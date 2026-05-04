import { getSupabaseClient } from '../adapters/supabase/client.js';

export type PartnerDealType = 'commission' | 'discount' | 'free_delivery' | 'combined';
export type PartnerDiscountType = 'percentage' | 'fixed';

export interface PartnerBenefitRow {
  id: string;
  slug: string;
  name: string;
  storeId: string;
  dealType: PartnerDealType;
  discountType: PartnerDiscountType | null;
  discountValue: number | null;
  freeDelivery: boolean;
  advanceDiscountDays: number | null;
}

/**
 * Look up an active accommodation partner by slug. Returns null when the slug
 * is missing/blank, when the partner does not exist, or when the partner is
 * pending/rejected/inactive — in any of those cases the booking should be
 * treated as if no partner referral was supplied (per spec).
 */
export async function lookupActivePartnerBySlug(
  slug: string | null | undefined,
): Promise<PartnerBenefitRow | null> {
  const trimmed = slug?.trim();
  if (!trimmed) return null;
  if (!/^[a-z0-9-]+$/.test(trimmed) || trimmed.length > 80) return null;

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('accommodation_partners')
    .select('id, slug, name, store_id, deal_type, discount_type, discount_value, free_delivery, advance_discount_days, status, active')
    .eq('slug', trimmed)
    .eq('status', 'active')
    .eq('active', true)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string; slug: string; name: string; store_id: string;
    deal_type: PartnerDealType;
    discount_type: PartnerDiscountType | null;
    discount_value: number | null;
    free_delivery: boolean;
    advance_discount_days: number | null;
  };

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    storeId: row.store_id,
    dealType: row.deal_type,
    discountType: row.discount_type,
    discountValue: row.discount_value != null ? Number(row.discount_value) : null,
    freeDelivery: row.free_delivery,
    advanceDiscountDays: row.advance_discount_days,
  };
}

const MS_PER_DAY = 86_400_000;

/**
 * Decide whether the partner benefit applies for a given pickup datetime.
 * If the partner has an `advanceDiscountDays` rule the customer must book at
 * least that many days ahead of the rental start date.
 */
export function isBenefitEligibleForPickup(
  partner: PartnerBenefitRow,
  pickupDatetime: string,
  bookingNow: Date = new Date(),
): boolean {
  if (partner.dealType === 'commission') return false;
  if (partner.advanceDiscountDays == null || partner.advanceDiscountDays <= 0) return true;

  const pickup = new Date(pickupDatetime);
  if (Number.isNaN(pickup.getTime())) return false;

  const advanceDays = (pickup.getTime() - bookingNow.getTime()) / MS_PER_DAY;
  return advanceDays >= partner.advanceDiscountDays;
}

export interface ApplyBenefitInput {
  partner: PartnerBenefitRow;
  rentalSubtotal: number;
  pickupFee: number;
  dropoffFee: number;
}

export interface ApplyBenefitResult {
  rentalSubtotal: number;
  pickupFee: number;
  dropoffFee: number;
  rentalDiscount: number;
  deliveryDiscount: number;
}

/**
 * Apply a partner benefit to a quote. The discount is taken off the rental
 * subtotal only (not addons or transfers); free delivery zeroes the
 * pickup/dropoff fees. The function rounds to 2dp so PHP totals stay sane.
 */
export function applyPartnerBenefit(input: ApplyBenefitInput): ApplyBenefitResult {
  const { partner } = input;
  let rentalSubtotal = input.rentalSubtotal;
  let pickupFee = input.pickupFee;
  let dropoffFee = input.dropoffFee;
  let rentalDiscount = 0;
  let deliveryDiscount = 0;

  const applyDiscount =
    partner.dealType === 'discount' || partner.dealType === 'combined';
  const applyFreeDelivery =
    partner.freeDelivery || partner.dealType === 'free_delivery' || partner.dealType === 'combined';

  if (applyDiscount && partner.discountType && partner.discountValue != null) {
    if (partner.discountType === 'percentage') {
      rentalDiscount = Math.round(rentalSubtotal * (partner.discountValue / 100) * 100) / 100;
    } else {
      rentalDiscount = Math.min(rentalSubtotal, partner.discountValue);
    }
    rentalSubtotal = Math.max(0, Math.round((rentalSubtotal - rentalDiscount) * 100) / 100);
  }

  if (applyFreeDelivery) {
    deliveryDiscount = pickupFee + dropoffFee;
    pickupFee = 0;
    dropoffFee = 0;
  }

  return { rentalSubtotal, pickupFee, dropoffFee, rentalDiscount, deliveryDiscount };
}
