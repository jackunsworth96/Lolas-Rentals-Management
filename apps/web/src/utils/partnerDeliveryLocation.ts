import type { PublicPartnerBenefit } from '../api/partners.js';

const FREE_DELIVERY_DEALS = new Set([
  'free_delivery',
  'combined',
  'commission_delivery',
  'discount_delivery',
]);

export function hasPartnerFreeDelivery(
  benefit: PublicPartnerBenefit | null | undefined,
  vehicleModelId?: string | null,
): boolean {
  if (!benefit) return false;

  const vehicleTerms = vehicleModelId
    ? benefit.vehicleTerms.find((term) => term.vehicleModelId === vehicleModelId)
    : undefined;

  return Boolean(
    benefit.freeDelivery ||
    FREE_DELIVERY_DEALS.has(vehicleTerms?.dealType ?? benefit.dealType) ||
    vehicleTerms?.freeDelivery,
  );
}

export function partnerAllowsFreeDeliveryLocation(
  benefit: PublicPartnerBenefit | null | undefined,
  locationId: number | null,
  vehicleModelId?: string | null,
): boolean {
  if (!hasPartnerFreeDelivery(benefit, vehicleModelId)) return false;
  const ids = benefit?.freeDeliveryLocationIds;
  if (!ids || ids.length === 0) return true;
  return locationId != null && ids.includes(locationId);
}

/**
 * The pricing zone still determines eligibility, but staff need the actual
 * establishment as the operational delivery/collection destination.
 */
export function partnerEstablishmentLocation(
  benefit: PublicPartnerBenefit | null | undefined,
  pricingLocationId: number | null,
  vehicleModelId?: string | null,
): string {
  if (!partnerAllowsFreeDeliveryLocation(benefit, pricingLocationId, vehicleModelId)) return '';
  return benefit?.name.trim() ?? '';
}
