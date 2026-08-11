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
  cancelledReason: string | null;
  cancelledAt: string | null;
  bookedAt: string;
  advanceDays: number | null;
  commissionable: boolean;
  commissionAmount: number;
  isExtended: boolean;
  extendedDropoffDatetime: string | null;
  pendingCommissionAmount: number;
}

export interface PartnerCommissionStats {
  totalBookings: number;
  commissionableBookings: number;
  totalCommission: number;
  totalPendingCommission: number;
  totalVehiclesRented: number;
  averageVehiclesPerDay: number;
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

function daysInReportMonth(month?: string): number {
  const source = month && /^\d{4}-\d{2}$/.test(month)
    ? month
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
  const [y, m] = source.split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
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
    .select('id, order_reference, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime, rental_value_raw, web_quote_raw, status, cancelled_reason, cancelled_at, created_at')
    .eq('store_id', p.store_id)
    .eq('partner_ref', p.slug)
    .order('created_at', { ascending: false });

  if (bounds.from && bounds.to) rawQuery = rawQuery.gte('created_at', bounds.from).lt('created_at', bounds.to);

  const { data: rawRows, error: rawErr } = await rawQuery;
  if (rawErr) throw new Error(`Failed to fetch partner bookings: ${rawErr.message}`);

  // Maps keyed by order_reference (booking_token) for extension data
  let paidExtensionByRef = new Map<string, number>();    // confirmed/collected extension amounts
  let pendingExtensionByRef = new Map<string, number>(); // pending (uncollected) extension amounts
  let extDropoffByRef = new Map<string, string>();       // updated return date from order_items

  const anyVehicleOverrideIncludesExtensions = Array.from(vehicleTermsByModel.values())
    .some((term) => term.commission_includes_extensions);
  if (p.commission_includes_extensions || anyVehicleOverrideIncludesExtensions) {
    const refs = (rawRows ?? [])
      .map((r: { order_reference?: string | null }) => r.order_reference)
      .filter(Boolean) as string[];
    if (refs.length > 0) {
      const { data: orders } = await sb
        .from('orders')
        .select('id, booking_token')
        .eq('store_id', p.store_id)
        .eq('partner_ref', p.slug)
        .in('booking_token', refs);

      const orderRows = (orders ?? []) as Array<{ id: string; booking_token: string | null }>;
      const orderIds = orderRows.map((o) => o.id).filter(Boolean);
      const refByOrderId = new Map(orderRows.map((o) => [o.id, o.booking_token ?? '']));

      if (orderIds.length > 0) {
        // Extended return date from order_items (updated by the extend RPC)
        const { data: items } = await sb
          .from('order_items')
          .select('order_id, dropoff_datetime')
          .in('order_id', orderIds);
        for (const item of (items ?? []) as Array<{ order_id: string; dropoff_datetime: string | null }>) {
          const ref = refByOrderId.get(item.order_id);
          if (ref && item.dropoff_datetime) extDropoffByRef.set(ref, item.dropoff_datetime);
        }

        // Extension payments split by settlement status:
        //   pending   → customer hasn't paid yet (commission is pending)
        //   anything else (absorbed/null) → collected (commission is confirmed)
        const { data: extPmts } = await sb
          .from('payments')
          .select('order_id, amount, settlement_status')
          .in('order_id', orderIds)
          .eq('payment_type', 'extension');
        for (const pmt of (extPmts ?? []) as Array<{ order_id: string; amount: number | null; settlement_status: string | null }>) {
          const ref = refByOrderId.get(pmt.order_id);
          if (!ref) continue;
          const amt = Number(pmt.amount ?? 0);
          if (pmt.settlement_status === 'pending') {
            pendingExtensionByRef.set(ref, (pendingExtensionByRef.get(ref) ?? 0) + amt);
          } else {
            paidExtensionByRef.set(ref, (paidExtensionByRef.get(ref) ?? 0) + amt);
          }
        }
      }
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
    cancelled_reason: string | null;
    cancelled_at: string | null;
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

    // Extension amounts for this booking (only when the partner has the flag enabled)
    const ref = row.order_reference ?? '';
    const paidExtAmt = includesExtensions ? (paidExtensionByRef.get(ref) ?? 0) : 0;
    const pendingExtAmt = includesExtensions ? (pendingExtensionByRef.get(ref) ?? 0) : 0;
    const isExtended = includesExtensions && (paidExtAmt > 0 || pendingExtAmt > 0);
    const extendedDropoffDatetime = isExtended ? (extDropoffByRef.get(ref) ?? null) : null;

    // Commission base = original rental value + any collected extension amounts.
    // Pending (uncollected) extensions are excluded from confirmed commission and
    // surfaced separately so the portal can show a "Pending" indicator.
    const originalBase = Number(row.rental_value_raw ?? row.web_quote_raw ?? 0);
    const base = originalBase + paidExtAmt;
    const commissionBase = commissionType === 'fixed' ? null : base;
    const commissionAmount = !commissionable
      ? 0
      : commissionType === 'fixed'
        ? Number(commissionValue ?? 0)
        : roundMoney(base * Number(commissionValue ?? 0) / 100);

    // Pending commission accrues only on percentage-type deals (fixed is per booking,
    // so there is no extra commission due when an extension is later collected).
    const pendingCommissionAmount = !commissionable || commissionType !== 'percentage'
      ? 0
      : roundMoney(pendingExtAmt * Number(commissionValue ?? 0) / 100);

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
      cancelledReason: row.cancelled_reason,
      cancelledAt: row.cancelled_at,
      bookedAt: row.created_at,
      advanceDays: advanceDays !== null ? Math.floor(advanceDays) : null,
      commissionable,
      commissionAmount,
      isExtended,
      extendedDropoffDatetime,
      pendingCommissionAmount,
    };
  });

  const totalCommission = bookings.reduce((sum, b) => sum + b.commissionAmount, 0);
  const totalPendingCommission = bookings.reduce((sum, b) => sum + b.pendingCommissionAmount, 0);
  const totalVehiclesRented = bookings.filter((b) => b.status !== 'cancelled').length;
  const monthDays = daysInReportMonth(month);

  // Sum vehicle-days: duration of each non-cancelled rental, clamped to the report month
  // so e.g. a booking that runs Jul 29 → Aug 2 only contributes 3 days to the July report.
  const monthStart = bounds.from ? new Date(bounds.from).getTime() : null;
  const monthEnd = bounds.to ? new Date(bounds.to).getTime() : null;

  function clampedRentalDays(pickup: string | null, dropoff: string | null): number {
    if (!pickup || !dropoff) return 0;
    const start = monthStart !== null ? Math.max(new Date(pickup).getTime(), monthStart) : new Date(pickup).getTime();
    const end = monthEnd !== null ? Math.min(new Date(dropoff).getTime(), monthEnd) : new Date(dropoff).getTime();
    return Math.max(0, (end - start) / 86_400_000);
  }

  const totalVehicleDays = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => {
      // Use extended dropoff if the booking was extended, to reflect actual return date
      const effectiveDropoff = b.isExtended && b.extendedDropoffDatetime
        ? b.extendedDropoffDatetime
        : b.dropoffDatetime;
      return sum + clampedRentalDays(b.pickupDatetime, effectiveDropoff);
    }, 0);

  return {
    totalBookings: bookings.length,
    commissionableBookings: bookings.filter((b) => b.commissionable).length,
    totalCommission: roundMoney(totalCommission),
    totalPendingCommission: roundMoney(totalPendingCommission),
    totalVehiclesRented,
    averageVehiclesPerDay: roundMoney(totalVehicleDays / monthDays),
    bookings,
  };
}
