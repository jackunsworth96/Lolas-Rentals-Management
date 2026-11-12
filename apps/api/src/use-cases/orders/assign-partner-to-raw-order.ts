import type { ConfigRepository } from '@lolas/domain';
import { resolveStoreFromSource } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { lookupActivePartnerBySlug, applyPartnerBenefit, type PartnerBenefitRow } from '../../lib/partner-benefit.js';
import { computeQuote } from '../booking/compute-quote.js';

interface RawOrderRow {
  id: string;
  store_id: string | null;
  source: string;
  status: string;
  partner_ref: string | null;
  vehicle_model_id: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  pickup_location_id: number | string | null;
  dropoff_location_id: number | string | null;
  web_quote_raw: number | string | null;
  rental_value_raw: number | string | null;
  created_at: string;
}

export interface AssignPartnerToRawOrderPreview {
  partnerName: string;
  partnerSlug: string;
  rentalDiscount: number;
  deliveryDiscount: number;
  totalDiscount: number;
  currentQuote: number | null;
  newQuote: number | null;
  /** False when the booking lacks the vehicle/date details needed to price the benefit (e.g. legacy website orders). */
  discountCalculated: boolean;
}

interface Deps {
  configRepo: ConfigRepository;
}

function httpError(message: string, statusCode: number): Error {
  const err = new Error(message);
  (err as Error & { statusCode?: number }).statusCode = statusCode;
  return err;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const numOrNull = (v: number | string | null) => (v == null ? null : Number(v));

async function loadRawOrder(id: string): Promise<RawOrderRow> {
  const { data, error } = await getSupabaseClient()
    .from('orders_raw')
    .select('id, store_id, source, status, partner_ref, vehicle_model_id, pickup_datetime, dropoff_datetime, pickup_location_id, dropoff_location_id, web_quote_raw, rental_value_raw, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load booking: ${error.message}`);
  if (!data) throw httpError('Booking not found', 404);
  return data as RawOrderRow;
}

function storeIdOf(row: RawOrderRow): string {
  return row.store_id ?? resolveStoreFromSource(row.source);
}

async function resolvePartner(row: RawOrderRow, partnerSlug: string): Promise<PartnerBenefitRow> {
  if (row.partner_ref) throw httpError(`Booking already has a partner assigned (${row.partner_ref})`, 409);
  if (row.status !== 'unprocessed') throw httpError('Only unprocessed inbox bookings can be assigned a partner here', 409);
  const partner = await lookupActivePartnerBySlug(partnerSlug);
  if (!partner || partner.storeId !== storeIdOf(row)) throw httpError('Choose an active partner in this store', 400);
  return partner;
}

/**
 * Prices the benefit the guest would have received had they booked through
 * the partner's ?ref= link. Advance-day / early-bird eligibility is measured
 * from when the booking was received, not from now.
 */
async function computeBenefit(deps: Deps, row: RawOrderRow, partner: PartnerBenefitRow) {
  if (!row.vehicle_model_id || !row.pickup_datetime || !row.dropoff_datetime) {
    return { rentalDiscount: 0, deliveryDiscount: 0, discountCalculated: false };
  }

  const pickupLocationId = numOrNull(row.pickup_location_id);
  const dropoffLocationId = numOrNull(row.dropoff_location_id);
  const storedRental = numOrNull(row.rental_value_raw);

  let rentalSubtotal = storedRental ?? 0;
  let pickupFee = 0;
  let dropoffFee = 0;
  let quoted = false;
  try {
    const quote = await computeQuote({ configRepo: deps.configRepo }, {
      storeId: storeIdOf(row),
      vehicleModelId: row.vehicle_model_id,
      pickupDatetime: row.pickup_datetime,
      dropoffDatetime: row.dropoff_datetime,
      pickupLocationId: pickupLocationId ?? 0,
      dropoffLocationId: dropoffLocationId ?? 0,
    });
    if (storedRental == null) rentalSubtotal = quote.rentalSubtotal;
    pickupFee = quote.pickupFee;
    dropoffFee = quote.dropoffFee;
    quoted = true;
  } catch {
    // No pricing tier for these dates — fall back to the stored rental value only.
  }
  if (!quoted && storedRental == null) {
    return { rentalDiscount: 0, deliveryDiscount: 0, discountCalculated: false };
  }

  const benefit = applyPartnerBenefit({
    partner,
    rentalSubtotal,
    pickupFee,
    dropoffFee,
    advanceDaysFromNow: (new Date(row.pickup_datetime).getTime() - new Date(row.created_at).getTime()) / 86_400_000,
    vehicleModelId: row.vehicle_model_id,
    pickupLocationId,
    dropoffLocationId,
  });
  return {
    rentalDiscount: round2(benefit.rentalDiscount),
    deliveryDiscount: round2(benefit.deliveryDiscount),
    discountCalculated: true,
  };
}

async function buildPreview(deps: Deps, row: RawOrderRow, partner: PartnerBenefitRow): Promise<AssignPartnerToRawOrderPreview> {
  const { rentalDiscount, deliveryDiscount, discountCalculated } = await computeBenefit(deps, row, partner);
  const totalDiscount = round2(rentalDiscount + deliveryDiscount);
  const currentQuote = numOrNull(row.web_quote_raw);
  return {
    partnerName: partner.name,
    partnerSlug: partner.slug,
    rentalDiscount,
    deliveryDiscount,
    totalDiscount,
    currentQuote,
    newQuote: currentQuote == null ? null : Math.max(0, round2(currentQuote - totalDiscount)),
    discountCalculated,
  };
}

export async function previewAssignPartnerToRawOrder(
  deps: Deps,
  input: { rawOrderId: string; partnerSlug: string },
): Promise<AssignPartnerToRawOrderPreview> {
  const row = await loadRawOrder(input.rawOrderId);
  const partner = await resolvePartner(row, input.partnerSlug);
  return buildPreview(deps, row, partner);
}

/**
 * Attributes an unprocessed inbox booking to a partner and nets their
 * discount out of the stored quote, so staff see the discounted figure when
 * activating and commission (read from orders_raw.rental_value_raw) is based
 * on it. No payments exist before activation, so no refund is ever needed.
 */
export async function assignPartnerToRawOrder(
  deps: Deps,
  input: { rawOrderId: string; partnerSlug: string },
): Promise<{ row: { id: string; partner_ref: string; web_quote_raw: number | null; rental_value_raw: number | null }; preview: AssignPartnerToRawOrderPreview }> {
  const row = await loadRawOrder(input.rawOrderId);
  const partner = await resolvePartner(row, input.partnerSlug);
  const preview = await buildPreview(deps, row, partner);

  const rentalBase = numOrNull(row.rental_value_raw) ?? numOrNull(row.web_quote_raw);
  const newRentalValue = rentalBase != null && preview.rentalDiscount > 0
    ? Math.max(0, round2(rentalBase - preview.rentalDiscount))
    : null;

  // The RPC also releases the booking's capacity reservation so partner allocation can re-key it.
  const { data, error } = await getSupabaseClient().rpc('assign_partner_to_raw_order_atomic', {
    p_raw_order_id: row.id,
    p_partner_ref: partner.slug,
    p_web_quote_raw: preview.newQuote,
    p_rental_value_raw: newRentalValue,
  });
  if (error) {
    if (error.message.includes('ALLOCATION_CONFLICT')) {
      throw httpError(`${partner.name} has no vehicle capacity left for this booking's dates`, 409);
    }
    if (error.message.includes('already has a partner') || error.message.includes('Only unprocessed')) {
      throw httpError(error.message, 409);
    }
    throw new Error(`Failed to assign partner: ${error.message}`);
  }
  const updated = (Array.isArray(data) ? data[0] : data) as
    { id: string; partner_ref: string; web_quote_raw: number | null; rental_value_raw: number | null } | undefined;
  if (!updated) throw httpError('Booking not found', 404);

  return { row: updated, preview };
}
