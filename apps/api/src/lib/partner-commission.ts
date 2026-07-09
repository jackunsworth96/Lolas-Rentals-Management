import { getSupabaseClient } from '../adapters/supabase/client.js';

export interface PartnerCommissionBooking {
  id: string;
  orderReference: string | null;
  customerName: string | null;
  vehicleModelId: string | null;
  pickupDatetime: string | null;
  dropoffDatetime: string | null;
  rentalValue: number;
  bookingValue: number;
  commissionBase: number | null;
  commissionType: 'fixed' | 'percentage' | null;
  commissionValue: number | null;
  status: string;
  bookedAt: string;
  advanceDays: number | null;
  commissionable: boolean;
  commissionAmount: number;
}

export interface PartnerCommissionStats {
  totalBookings: number;
  commissionableBookings: number;
  totalCommission: number;
  bookings: PartnerCommissionBooking[];
}

interface PartnerTerms {
  id: string;
  slug: string;
  store_id: string;
  advance_booking_days: number;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
  commission_includes_extensions: boolean;
}

interface VehicleCommissionTerms {
  vehicle_model_id: string;
  deal_type: string;
  advance_booking_days: number | null;
  commission_type: 'fixed' | 'percentage' | null;
  commission_value: number | null;
  commission_includes_extensions: boolean;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthBounds(month?: string): { from?: string; to?: string } {
  if (!month) return {};
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return {};
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}

export async function getPartnerCommissionStats(partnerId: string, month?: string): Promise<PartnerCommissionStats> {
  const sb = getSupabaseClient();
  const { data: partner, error: partnerErr } = await sb
    .from('accommodation_partners')
    .select('id, slug, store_id, advance_booking_days, commission_type, commission_value, commission_includes_extensions')
    .eq('id', partnerId)
    .single();

  if (partnerErr || !partner) {
    const err = new Error('Partner not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const p = partner as PartnerTerms;
  const bounds = monthBounds(month);

  const { data: vehicleTermsRows, error: vehicleTermsErr } = await sb
    .from('partner_vehicle_terms')
    .select('vehicle_model_id, deal_type, advance_booking_days, commission_type, commission_value, commission_includes_extensions')
    .eq('partner_id', p.id);

  if (vehicleTermsErr) throw new Error(`Failed to fetch partner vehicle terms: ${vehicleTermsErr.message}`);

  const vehicleTermsByModel = new Map(
    ((vehicleTermsRows ?? []) as VehicleCommissionTerms[]).map((term) => [term.vehicle_model_id, term]),
  );

  let rawQuery = sb
    .from('orders_raw')
    .select('id, order_reference, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime, rental_value_raw, web_quote_raw, status, created_at')
    .eq('store_id', p.store_id)
    .eq('partner_ref', p.slug)
    .order('created_at', { ascending: false });

  if (bounds.from && bounds.to) rawQuery = rawQuery.gte('created_at', bounds.from).lt('created_at', bounds.to);

  const { data: rawRows, error: rawErr } = await rawQuery;
  if (rawErr) throw new Error(`Failed to fetch partner bookings: ${rawErr.message}`);

  let activeTotals = new Map<string, number>();
  const anyVehicleOverrideIncludesExtensions = Array.from(vehicleTermsByModel.values())
    .some((term) => term.commission_includes_extensions);
  if (p.commission_includes_extensions || anyVehicleOverrideIncludesExtensions) {
    const refs = (rawRows ?? [])
      .map((r: { order_reference?: string | null }) => r.order_reference)
      .filter(Boolean) as string[];
    if (refs.length > 0) {
      const orderQuery = sb
        .from('orders')
        .select('booking_token, final_total, security_deposit, partner_ref, store_id')
        .eq('store_id', p.store_id)
        .eq('partner_ref', p.slug)
        .in('booking_token', refs);

    const { data: orders } = await orderQuery;
    activeTotals = new Map(
      (orders ?? []).map((o: { booking_token: string | null; final_total: number | null; security_deposit: number | null }) => [
        o.booking_token ?? '',
        Math.max(0, Number(o.final_total ?? 0) - Number(o.security_deposit ?? 0)),
      ]),
    );
    }
  }

  const bookings = ((rawRows ?? []) as Array<{
    id: string;
    order_reference: string | null;
    customer_name: string | null;
    vehicle_model_id: string | null;
    pickup_datetime: string | null;
    dropoff_datetime: string | null;
    rental_value_raw: number | null;
    web_quote_raw: number | null;
    status: string;
    created_at: string;
  }>).map((row) => {
    const advanceDays = row.pickup_datetime
      ? (new Date(row.pickup_datetime).getTime() - new Date(row.created_at).getTime()) / 86_400_000
      : null;
    const override = row.vehicle_model_id ? vehicleTermsByModel.get(row.vehicle_model_id) : undefined;
    const overrideHasCommission = override
      ? ['commission', 'combined', 'commission_delivery'].includes(override.deal_type)
        && override.commission_type != null
        && override.commission_value != null
      : false;
    const commissionType = override
      ? (overrideHasCommission ? override.commission_type : null)
      : p.commission_type;
    const commissionValue = override
      ? (overrideHasCommission ? Number(override.commission_value) : null)
      : Number(p.commission_value ?? 0);
    const advanceBookingDays = override?.advance_booking_days ?? p.advance_booking_days;
    const includesExtensions = override ? override.commission_includes_extensions : p.commission_includes_extensions;
    const commissionable =
      row.status !== 'cancelled' &&
      commissionType != null &&
      commissionValue != null &&
      advanceDays !== null &&
      advanceDays >= advanceBookingDays;
    const originalBase = Number(row.rental_value_raw ?? row.web_quote_raw ?? 0);
    const extensionBase = row.order_reference ? activeTotals.get(row.order_reference) : undefined;
    const base = includesExtensions && extensionBase != null ? extensionBase : originalBase;
    const commissionBase = commissionType === 'fixed' ? null : base;
    const commissionAmount = !commissionable
      ? 0
      : commissionType === 'fixed'
        ? Number(commissionValue ?? 0)
        : roundMoney(base * Number(commissionValue ?? 0) / 100);

    return {
      id: row.id,
      orderReference: row.order_reference,
      customerName: row.customer_name,
      vehicleModelId: row.vehicle_model_id,
      pickupDatetime: row.pickup_datetime,
      dropoffDatetime: row.dropoff_datetime,
      rentalValue: Number(row.rental_value_raw ?? 0),
      bookingValue: Number(row.web_quote_raw ?? 0),
      commissionBase,
      commissionType,
      commissionValue,
      status: row.status,
      bookedAt: row.created_at,
      advanceDays: advanceDays !== null ? Math.floor(advanceDays) : null,
      commissionable,
      commissionAmount,
    };
  });

  const totalCommission = bookings.reduce((sum, b) => sum + b.commissionAmount, 0);
  return {
    totalBookings: bookings.length,
    commissionableBookings: bookings.filter((b) => b.commissionable).length,
    totalCommission: roundMoney(totalCommission),
    bookings,
  };
}
