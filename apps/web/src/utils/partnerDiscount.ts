import type { PublicPartnerBenefit, PublicPartnerVehicleTerm } from '../api/partners.js';

const MS_PER_DAY = 86_400_000;

export interface AppliedPartnerBenefit {
  /** Whether the discount/free delivery is applied (after advance-days check). */
  applied: boolean;
  /** Reason the benefit isn't applied — used to render a "select a date X+ days" hint. */
  pendingReason: 'advance_days' | null;
  /** Days the customer is short of the advance threshold (rounded up). */
  daysShort: number;
  /** ₱ off the rental subtotal. 0 when no discount applies. */
  rentalDiscount: number;
  /** Whether free delivery is in effect. */
  freeDelivery: boolean;
  /** True when the early-bird (higher) tier was applied. */
  earlyBird: boolean;
}

/**
 * Resolve the effective guest-facing deal terms for a booking.
 * When vehicleModelId is supplied and a per-vehicle override exists for that
 * model the override is used; otherwise the global partner terms apply.
 */
function resolveClientTerms(
  benefit: PublicPartnerBenefit,
  vehicleModelId?: string | null,
): PublicPartnerVehicleTerm | Pick<PublicPartnerBenefit, 'dealType' | 'discountType' | 'discountValue' | 'freeDelivery' | 'advanceDiscountDays' | 'earlyBirdDays' | 'earlyBirdDiscountValue'> {
  if (vehicleModelId && benefit.vehicleTerms?.length) {
    const override = benefit.vehicleTerms.find((vt) => vt.vehicleModelId === vehicleModelId);
    if (override) {
      return {
        ...override,
        freeDelivery: override.freeDelivery || benefit.freeDelivery,
      };
    }
  }
  return benefit;
}

/**
 * Returns true when both location IDs are permitted by the partner's
 * free-delivery allowlist. When the allowlist is null/empty all locations qualify.
 */
function isLocationAllowed(
  ids: number[] | null | undefined,
  pickupLocationId?: number | null,
  dropoffLocationId?: number | null,
): boolean {
  if (!ids || ids.length === 0) return true;
  return (pickupLocationId != null && ids.includes(pickupLocationId)) &&
         (dropoffLocationId != null && ids.includes(dropoffLocationId));
}

/**
 * Compute the partner benefit applied to a quote at display time. Returns
 * `applied: false` when the partner has an advance_discount_days rule and
 * the chosen pickup date is too soon — the caller can then surface the
 * "advance booking required" hint to the customer.
 *
 * When vehicleModelId is supplied, per-vehicle overrides are resolved first
 * with a fallback to the global partner terms.
 * When pickupLocationId / dropoffLocationId are supplied the partner's
 * free-delivery location allowlist is checked.
 */
export function computePartnerBenefit(
  benefit: PublicPartnerBenefit | null,
  rentalSubtotal: number,
  pickupDatetime: string,
  now: Date = new Date(),
  vehicleModelId?: string | null,
  pickupLocationId?: number | null,
  dropoffLocationId?: number | null,
): AppliedPartnerBenefit {
  const empty: AppliedPartnerBenefit = {
    applied: false,
    pendingReason: null,
    daysShort: 0,
    rentalDiscount: 0,
    freeDelivery: false,
    earlyBird: false,
  };

  if (!benefit) return empty;

  const terms = resolveClientTerms(benefit, vehicleModelId);

  // commission_delivery earns the partner a commission but still gives guests free delivery.
  // Allow it through — isFreeDeliveryDeal below will pick it up.
  if (terms.dealType === 'commission' && !terms.freeDelivery) return empty;

  // Advance days gate (mirrors the server-side rule in lib/partner-benefit.ts)
  if (terms.advanceDiscountDays != null && terms.advanceDiscountDays > 0) {
    const pickup = pickupDatetime ? new Date(pickupDatetime) : null;
    if (!pickup || Number.isNaN(pickup.getTime())) {
      return { ...empty, pendingReason: 'advance_days', daysShort: terms.advanceDiscountDays };
    }
    const advanceDays = (pickup.getTime() - now.getTime()) / MS_PER_DAY;
    if (advanceDays < terms.advanceDiscountDays) {
      return {
        ...empty,
        pendingReason: 'advance_days',
        daysShort: Math.max(1, Math.ceil(terms.advanceDiscountDays - advanceDays)),
      };
    }
  }

  const isDiscountDeal = terms.dealType === 'discount' || terms.dealType === 'combined' || terms.dealType === 'discount_delivery';
  const isFreeDeliveryDeal =
    (terms.freeDelivery || terms.dealType === 'free_delivery' || terms.dealType === 'combined' ||
    terms.dealType === 'commission_delivery' || terms.dealType === 'discount_delivery') &&
    isLocationAllowed(benefit.freeDeliveryLocationIds, pickupLocationId, dropoffLocationId);

  // Determine advance days for early-bird check
  const pickup = pickupDatetime ? new Date(pickupDatetime) : null;
  const advanceDays = pickup && !Number.isNaN(pickup.getTime())
    ? (pickup.getTime() - now.getTime()) / MS_PER_DAY
    : 0;

  const earlyBird =
    terms.earlyBirdDays != null &&
    terms.earlyBirdDiscountValue != null &&
    advanceDays >= terms.earlyBirdDays;

  const effectiveDiscountValue = earlyBird
    ? terms.earlyBirdDiscountValue!
    : terms.discountValue;

  let rentalDiscount = 0;
  if (isDiscountDeal && terms.discountType && effectiveDiscountValue != null) {
    if (terms.discountType === 'percentage') {
      rentalDiscount = Math.round(rentalSubtotal * (effectiveDiscountValue / 100) * 100) / 100;
    } else {
      rentalDiscount = Math.min(rentalSubtotal, effectiveDiscountValue);
    }
  }

  return {
    applied: true,
    pendingReason: null,
    daysShort: 0,
    rentalDiscount,
    freeDelivery: isFreeDeliveryDeal,
    earlyBird,
  };
}

/** Human-readable summary of the benefit for banner copy. */
export function describeBenefit(benefit: PublicPartnerBenefit, vehicleModelId?: string | null): string {
  const terms = resolveClientTerms(benefit, vehicleModelId);
  const parts: string[] = [];
  const discount = terms.dealType === 'discount' || terms.dealType === 'combined' || terms.dealType === 'discount_delivery';
  if (discount && terms.discountValue != null && terms.discountType) {
    parts.push(terms.discountType === 'percentage'
      ? `${terms.discountValue}% discount applied`
      : `₱${terms.discountValue.toLocaleString('en-PH')} discount applied`);
  }
  if (terms.freeDelivery || terms.dealType === 'free_delivery' || terms.dealType === 'combined' || terms.dealType === 'commission_delivery' || terms.dealType === 'discount_delivery') {
    parts.push('Free delivery included');
  }
  if (parts.length === 0) {
    return 'Special partner rate';
  }
  return parts.join(' · ');
}
