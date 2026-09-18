import type { ConfigRepository } from '@lolas/domain';
import type { DirectBookingTerms } from '@lolas/shared';

export interface DirectBookingTermsRow {
  booking_channel: string;
  vehicle_model_id: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  pickup_location_id: number | null;
  dropoff_location_id: number | null;
  store_id: string | null;
  addon_ids: number[] | null;
  rental_value_raw: number | string | null;
  web_quote_raw: number | string | null;
  web_card_fee_surcharge: number | string | null;
  transfer_amount: number | string | null;
  charity_donation: number | string | null;
  partner_ref?: string | null;
  created_at?: string | null;
}

const MONEY_EPSILON = 0.01;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function rentalDaysBetween(pickup: string, dropoff: string): number {
  const pickupMs = new Date(pickup).getTime();
  const dropoffMs = new Date(dropoff).getTime();
  if (!Number.isFinite(pickupMs) || !Number.isFinite(dropoffMs) || dropoffMs <= pickupMs) {
    throw new Error('Dropoff datetime must be after pickup datetime');
  }
  return Math.max(1, Math.ceil((dropoffMs - pickupMs) / 86_400_000));
}

export async function resolveDirectBookingTerms(
  row: DirectBookingTermsRow,
  configRepo: ConfigRepository,
): Promise<DirectBookingTerms | null> {
  if (row.booking_channel !== 'direct') return null;
  if (!row.vehicle_model_id || !row.pickup_datetime || !row.dropoff_datetime ||
      !row.store_id || row.pickup_location_id == null || row.dropoff_location_id == null) {
    return null;
  }

  const rentalDays = rentalDaysBetween(row.pickup_datetime, row.dropoff_datetime);
  const [model, locations, configuredAddons, pricing] = await Promise.all([
    configRepo.getVehicleModelById(row.vehicle_model_id),
    configRepo.getLocations(row.store_id),
    configRepo.getAddons(row.store_id),
    configRepo.getModelPricing(row.vehicle_model_id, row.store_id),
  ]);

  const pickupLocation = locations.find((location) => Number(location.id) === row.pickup_location_id);
  const dropoffLocation = locations.find((location) => Number(location.id) === row.dropoff_location_id);
  if (!model || !pickupLocation || !dropoffLocation) return null;

  const storedRentalSubtotal = row.rental_value_raw == null
    ? null
    : Number(row.rental_value_raw);
  const currentTier = pricing.find((tier) => tier.minDays <= rentalDays && tier.maxDays >= rentalDays);
  const rentalSubtotal = Number.isFinite(storedRentalSubtotal)
    ? roundMoney(storedRentalSubtotal as number)
    : roundMoney(Number(currentTier?.dailyRate ?? 0) * rentalDays);
  // Keep the division precision so multiplying by rentalDays reconstructs the
  // stored subtotal even when it does not divide evenly into whole centavos.
  const effectiveDailyRate = rentalSubtotal / rentalDays;

  const selectedIds = new Set(row.addon_ids ?? []);
  const addons = configuredAddons
    .filter((addon) => selectedIds.has(Number(addon.id)))
    .map((addon) => {
      const unitPrice = addon.addonType === 'per_day'
        ? Number(addon.pricePerDay)
        : Number(addon.priceOneTime);
      const quantity = addon.addonType === 'per_day' ? rentalDays : 1;
      return {
        id: Number(addon.id),
        name: addon.name,
        type: addon.addonType,
        unitPrice: roundMoney(unitPrice),
        quantity,
        total: roundMoney(unitPrice * quantity),
      };
    });

  const addonsTotal = roundMoney(addons.reduce((sum, addon) => sum + addon.total, 0));
  const configuredPickupFee = roundMoney(Number(pickupLocation.deliveryCost ?? 0));
  const configuredDropoffFee = roundMoney(Number(dropoffLocation.collectionCost ?? 0));
  // rental_value_raw is persisted after partner pricing has already been
  // applied. Re-applying benefits here double-discounts historical bookings.
  // Location fee history is not persisted, so current configured fees remain
  // a best-effort reconstruction and quote differences stay visible.
  const pickupFee = configuredPickupFee;
  const dropoffFee = configuredDropoffFee;
  const surcharge = roundMoney(Number(row.web_card_fee_surcharge ?? 0));
  const transferAmount = roundMoney(Number(row.transfer_amount ?? 0));
  const charityAmount = roundMoney(Number(row.charity_donation ?? 0));
  const calculatedTotal = roundMoney(
    rentalSubtotal + pickupFee + dropoffFee + addonsTotal + surcharge + transferAmount + charityAmount,
  );
  const quotedTotal = row.web_quote_raw == null ? null : roundMoney(Number(row.web_quote_raw));
  const totalDifference = quotedTotal == null ? 0 : roundMoney(calculatedTotal - quotedTotal);

  const warnings: string[] = [];
  if (storedRentalSubtotal == null) warnings.push('The original rental subtotal was not stored; the current configured rate is being used.');
  if ((row.addon_ids ?? []).length !== addons.length) warnings.push('One or more originally selected add-ons are no longer available in configuration.');
  if (quotedTotal != null && Math.abs(totalDifference) > MONEY_EPSILON) {
    warnings.push(`The reconstructed breakdown differs from the original web quote by PHP ${Math.abs(totalDifference).toFixed(2)}.`);
  }

  return {
    source: 'reconstructed',
    vehicleModelId: row.vehicle_model_id,
    vehicleModelName: model.name,
    pickupDatetime: row.pickup_datetime,
    dropoffDatetime: row.dropoff_datetime,
    rentalDays,
    effectiveDailyRate,
    discount: 0,
    pickupLocationId: row.pickup_location_id,
    pickupLocationName: pickupLocation.name,
    pickupFee,
    dropoffLocationId: row.dropoff_location_id,
    dropoffLocationName: dropoffLocation.name,
    dropoffFee,
    addons,
    rentalSubtotal,
    addonsTotal,
    surcharge,
    transferAmount,
    charityAmount,
    calculatedTotal,
    quotedTotal,
    totalDifference,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
}

export function sameMoney(left: number, right: number): boolean {
  return Math.abs(roundMoney(left) - roundMoney(right)) <= MONEY_EPSILON;
}

export function sameInstant(left: string, right: string): boolean {
  const leftMs = new Date(left).getTime();
  const rightMs = new Date(right).getTime();
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}
