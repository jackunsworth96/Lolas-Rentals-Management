import { getSupabaseClient } from '../adapters/supabase/client.js';

export type PartnerDealType = 'commission' | 'discount' | 'free_delivery' | 'combined' | 'commission_delivery' | 'discount_delivery';
export type PartnerDiscountType = 'percentage' | 'fixed';

/** Per-vehicle override row from partner_vehicle_terms. */
export interface PartnerVehicleTermRow {
  vehicleModelId: string;
  dealType: PartnerDealType;
  commissionType: 'fixed' | 'percentage' | null;
  commissionValue: number | null;
  advanceBookingDays: number | null;
  commissionIncludesExtensions: boolean;
  discountType: PartnerDiscountType | null;
  discountValue: number | null;
  advanceDiscountDays: number | null;
  earlyBirdDays: number | null;
  earlyBirdDiscountValue: number | null;
  freeDelivery: boolean;
}

export interface PartnerBenefitRow {
  id: string;
  slug: string;
  name: string;
  storeId: string;
  dealType: PartnerDealType;
  discountType: PartnerDiscountType | null;
  discountValue: number | null;
  freeDelivery: boolean;
  /** When set, free delivery applies per delivery/collection leg for these locations. */
  freeDeliveryLocationIds: number[] | null;
  advanceDiscountDays: number | null;
  earlyBirdDays: number | null;
  earlyBirdDiscountValue: number | null;
  /** Per-vehicle overrides; empty array when none are configured. */
  vehicleTerms: PartnerVehicleTermRow[];
}

/**
 * The resolved set of deal terms after applying per-vehicle override logic.
 * Shape mirrors the fields used by isBenefitEligibleForPickup and applyPartnerBenefit.
 */
export interface ResolvedPartnerTerms {
  dealType: PartnerDealType;
  discountType: PartnerDiscountType | null;
  discountValue: number | null;
  freeDelivery: boolean;
  advanceDiscountDays: number | null;
  earlyBirdDays: number | null;
  earlyBirdDiscountValue: number | null;
}

/**
 * Look up an active accommodation partner by slug or portal subdomain. Returns
 * null when the ref is missing/blank, when the partner does not exist, or when
 * the partner is pending/rejected/inactive — in any of those cases the booking
 * should be treated as if no partner referral was supplied (per spec).
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
    .select('id, slug, name, store_id, deal_type, discount_type, discount_value, free_delivery, free_delivery_location_ids, advance_discount_days, early_bird_days, early_bird_discount_value, status, active')
    .or(`slug.eq.${trimmed},portal_subdomain.eq.${trimmed}`)
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
    free_delivery_location_ids: number[] | null;
    advance_discount_days: number | null;
    early_bird_days: number | null;
    early_bird_discount_value: number | null;
  };

  // Fetch per-vehicle overrides for this partner
  const { data: vtRows } = await sb
    .from('partner_vehicle_terms')
    .select('vehicle_model_id, deal_type, commission_type, commission_value, advance_booking_days, commission_includes_extensions, discount_type, discount_value, advance_discount_days, early_bird_days, early_bird_discount_value, free_delivery')
    .eq('partner_id', row.id);

  const vehicleTerms: PartnerVehicleTermRow[] = (vtRows ?? []).map((vt: {
    vehicle_model_id: string;
    deal_type: PartnerDealType;
    commission_type: string | null;
    commission_value: number | null;
    advance_booking_days: number | null;
    commission_includes_extensions: boolean;
    discount_type: string | null;
    discount_value: number | null;
    advance_discount_days: number | null;
    early_bird_days: number | null;
    early_bird_discount_value: number | null;
    free_delivery: boolean;
  }) => ({
    vehicleModelId: vt.vehicle_model_id,
    dealType: vt.deal_type,
    commissionType: (vt.commission_type as 'fixed' | 'percentage' | null),
    commissionValue: vt.commission_value != null ? Number(vt.commission_value) : null,
    advanceBookingDays: vt.advance_booking_days,
    commissionIncludesExtensions: vt.commission_includes_extensions,
    discountType: (vt.discount_type as PartnerDiscountType | null),
    discountValue: vt.discount_value != null ? Number(vt.discount_value) : null,
    advanceDiscountDays: vt.advance_discount_days,
    earlyBirdDays: vt.early_bird_days,
    earlyBirdDiscountValue: vt.early_bird_discount_value != null ? Number(vt.early_bird_discount_value) : null,
    freeDelivery: vt.free_delivery,
  }));

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    storeId: row.store_id,
    dealType: row.deal_type,
    discountType: row.discount_type,
    discountValue: row.discount_value != null ? Number(row.discount_value) : null,
    freeDelivery: row.free_delivery,
    freeDeliveryLocationIds: row.free_delivery_location_ids ?? null,
    advanceDiscountDays: row.advance_discount_days,
    earlyBirdDays: row.early_bird_days,
    earlyBirdDiscountValue: row.early_bird_discount_value != null ? Number(row.early_bird_discount_value) : null,
    vehicleTerms,
  };
}

/**
 * Resolve the effective deal terms for a booking, applying a per-vehicle override
 * when one exists for the given model. Falls back to the global partner terms.
 */
export function resolveTerms(
  partner: PartnerBenefitRow,
  vehicleModelId?: string | null,
): ResolvedPartnerTerms {
  if (vehicleModelId) {
    const override = partner.vehicleTerms.find((vt) => vt.vehicleModelId === vehicleModelId);
    if (override) {
      return {
        dealType: override.dealType,
        discountType: override.discountType,
        discountValue: override.discountValue,
        freeDelivery: override.freeDelivery || partner.freeDelivery,
        advanceDiscountDays: override.advanceDiscountDays ?? partner.advanceDiscountDays,
        earlyBirdDays: override.earlyBirdDays ?? partner.earlyBirdDays,
        earlyBirdDiscountValue: override.earlyBirdDiscountValue ?? partner.earlyBirdDiscountValue,
      };
    }
  }
  return {
    dealType: partner.dealType,
    discountType: partner.discountType,
    discountValue: partner.discountValue,
    freeDelivery: partner.freeDelivery,
    advanceDiscountDays: partner.advanceDiscountDays,
    earlyBirdDays: partner.earlyBirdDays,
    earlyBirdDiscountValue: partner.earlyBirdDiscountValue,
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
  vehicleModelId?: string | null,
): boolean {
  const terms = resolveTerms(partner, vehicleModelId);

  if (terms.dealType === 'commission' && !terms.freeDelivery) return false;
  const hasRentalRateBenefit =
    ((terms.dealType === 'discount' || terms.dealType === 'combined' || terms.dealType === 'discount_delivery') &&
      terms.discountType != null &&
      terms.discountValue != null) ||
    (terms.earlyBirdDays != null && terms.earlyBirdDiscountValue != null);
  if (!hasRentalRateBenefit) return true;
  if (terms.advanceDiscountDays == null || terms.advanceDiscountDays <= 0) return true;

  const pickup = new Date(pickupDatetime);
  if (Number.isNaN(pickup.getTime())) return false;

  const advanceDays = (pickup.getTime() - bookingNow.getTime()) / MS_PER_DAY;
  return advanceDays >= terms.advanceDiscountDays;
}

/**
 * Returns true when the selected locations are permitted for free delivery.
 * If no allowlist is configured (null or empty) all locations qualify.
 */
function isLocationAllowed(
  ids: number[] | null,
  locationId?: number | null,
): boolean {
  if (!ids || ids.length === 0) return true;
  return locationId != null && ids.includes(locationId);
}

export interface ApplyBenefitInput {
  partner: PartnerBenefitRow;
  rentalSubtotal: number;
  pickupFee: number;
  dropoffFee: number;
  /** Days between booking (now) and pickup — used to pick early-bird tier. */
  advanceDaysFromNow?: number | null;
  /** When provided, per-vehicle override terms are applied if they exist. */
  vehicleModelId?: string | null;
  /** Location IDs used to check against the partner's free-delivery location allowlist. */
  pickupLocationId?: number | null;
  dropoffLocationId?: number | null;
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
 *
 * Per-vehicle overrides are resolved via vehicleModelId when supplied.
 */
export function applyPartnerBenefit(input: ApplyBenefitInput): ApplyBenefitResult {
  const terms = resolveTerms(input.partner, input.vehicleModelId);

  let rentalSubtotal = input.rentalSubtotal;
  let pickupFee = input.pickupFee;
  let dropoffFee = input.dropoffFee;
  let rentalDiscount = 0;
  let deliveryDiscount = 0;

  const applyDiscount =
    terms.dealType === 'discount' || terms.dealType === 'combined' || terms.dealType === 'discount_delivery';
  const applyFreeDelivery =
    terms.freeDelivery || terms.dealType === 'free_delivery' || terms.dealType === 'combined' ||
    terms.dealType === 'commission_delivery' || terms.dealType === 'discount_delivery';
  const advanceQualified =
    terms.advanceDiscountDays == null ||
    terms.advanceDiscountDays <= 0 ||
    (input.advanceDaysFromNow != null && input.advanceDaysFromNow >= terms.advanceDiscountDays);

  if (applyDiscount && advanceQualified && terms.discountType && terms.discountValue != null) {
    // Use the early-bird (higher) value when the pickup qualifies for that tier.
    const effectiveDiscountValue =
      terms.earlyBirdDiscountValue != null &&
      terms.earlyBirdDays != null &&
      input.advanceDaysFromNow != null &&
      input.advanceDaysFromNow >= terms.earlyBirdDays
        ? terms.earlyBirdDiscountValue
        : terms.discountValue;

    if (terms.discountType === 'percentage') {
      rentalDiscount = Math.round(rentalSubtotal * (effectiveDiscountValue / 100) * 100) / 100;
    } else {
      rentalDiscount = Math.min(rentalSubtotal, effectiveDiscountValue);
    }
    rentalSubtotal = Math.max(0, Math.round((rentalSubtotal - rentalDiscount) * 100) / 100);
  }

  if (applyFreeDelivery && isLocationAllowed(input.partner.freeDeliveryLocationIds, input.pickupLocationId)) {
    deliveryDiscount += pickupFee;
    pickupFee = 0;
  }
  if (applyFreeDelivery && isLocationAllowed(input.partner.freeDeliveryLocationIds, input.dropoffLocationId)) {
    deliveryDiscount += dropoffFee;
    dropoffFee = 0;
  }

  return { rentalSubtotal, pickupFee, dropoffFee, rentalDiscount, deliveryDiscount };
}
