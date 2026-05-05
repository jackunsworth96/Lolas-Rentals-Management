import type { PublicPartnerBenefit } from '../api/partners.js';

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
 * Compute the partner benefit applied to a quote at display time. Returns
 * `applied: false` when the partner has an advance_discount_days rule and
 * the chosen pickup date is too soon — the caller can then surface the
 * "advance booking required" hint to the customer.
 */
export function computePartnerBenefit(
  benefit: PublicPartnerBenefit | null,
  rentalSubtotal: number,
  pickupDatetime: string,
  now: Date = new Date(),
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
  if (benefit.dealType === 'commission') return empty;

  // Advance days gate (mirrors the server-side rule in lib/partner-benefit.ts)
  if (benefit.advanceDiscountDays != null && benefit.advanceDiscountDays > 0) {
    const pickup = pickupDatetime ? new Date(pickupDatetime) : null;
    if (!pickup || Number.isNaN(pickup.getTime())) {
      return { ...empty, pendingReason: 'advance_days', daysShort: benefit.advanceDiscountDays };
    }
    const advanceDays = (pickup.getTime() - now.getTime()) / MS_PER_DAY;
    if (advanceDays < benefit.advanceDiscountDays) {
      return {
        ...empty,
        pendingReason: 'advance_days',
        daysShort: Math.max(1, Math.ceil(benefit.advanceDiscountDays - advanceDays)),
      };
    }
  }

  const isDiscountDeal = benefit.dealType === 'discount' || benefit.dealType === 'combined';
  const isFreeDeliveryDeal =
    benefit.freeDelivery || benefit.dealType === 'free_delivery' || benefit.dealType === 'combined';

  // Determine advance days for early-bird check
  const pickup = pickupDatetime ? new Date(pickupDatetime) : null;
  const advanceDays = pickup && !Number.isNaN(pickup.getTime())
    ? (pickup.getTime() - now.getTime()) / MS_PER_DAY
    : 0;

  const earlyBird =
    benefit.earlyBirdDays != null &&
    benefit.earlyBirdDiscountValue != null &&
    advanceDays >= benefit.earlyBirdDays;

  const effectiveDiscountValue = earlyBird
    ? benefit.earlyBirdDiscountValue!
    : benefit.discountValue;

  let rentalDiscount = 0;
  if (isDiscountDeal && benefit.discountType && effectiveDiscountValue != null) {
    if (benefit.discountType === 'percentage') {
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
export function describeBenefit(benefit: PublicPartnerBenefit): string {
  const parts: string[] = [];
  const discount = benefit.dealType === 'discount' || benefit.dealType === 'combined';
  if (discount && benefit.discountValue != null && benefit.discountType) {
    parts.push(benefit.discountType === 'percentage'
      ? `${benefit.discountValue}% discount applied`
      : `₱${benefit.discountValue.toLocaleString('en-PH')} discount applied`);
  }
  if (benefit.freeDelivery || benefit.dealType === 'free_delivery' || benefit.dealType === 'combined') {
    parts.push('Free delivery included');
  }
  if (parts.length === 0) {
    return 'Special partner rate';
  }
  return parts.join(' · ');
}
