import { computeQuote, type ComputeQuoteDeps } from './compute-quote.js';

export interface PriceExtensionRentalInput {
  storeId: string;
  modelId: string | null;
  fromIso: string;
  toIso: string;
  /** The item's current rental_rate; the extension is never charged more per day than this. */
  storedDailyRate: number;
  locationId: number;
  overrideDailyRate?: number;
}

export interface PriceExtensionRentalResult {
  days: number;
  dailyRate: number;
  cost: number;
}

export function extensionDayCount(fromMs: number, toMs: number): number {
  return Math.max(1, Math.ceil((toMs - fromMs) / 86400000));
}

/**
 * Rental charge for extending a booking from `fromIso` to `toIso`: the bracket
 * rate for the extension days, capped at the stored daily rate (a cheaper
 * bracket unlocked by volume is kept). Throws if the quote cannot be computed.
 */
export async function priceExtensionRental(
  deps: ComputeQuoteDeps,
  input: PriceExtensionRentalInput,
): Promise<PriceExtensionRentalResult> {
  const days = extensionDayCount(new Date(input.fromIso).getTime(), new Date(input.toIso).getTime());
  const storedDailyRate = Number(input.storedDailyRate ?? 0);
  let dailyRate = 0;

  if (input.modelId) {
    const quote = await computeQuote(deps, {
      storeId: input.storeId,
      vehicleModelId: input.modelId,
      pickupDatetime: input.fromIso,
      dropoffDatetime: input.toIso,
      pickupLocationId: input.locationId,
      dropoffLocationId: input.locationId,
    });
    if (input.overrideDailyRate !== undefined) {
      dailyRate = input.overrideDailyRate;
    } else {
      const computedExtDailyRate = days > 0 ? quote.rentalSubtotal / days : quote.rentalSubtotal;
      dailyRate = storedDailyRate > 0 ? Math.min(computedExtDailyRate, storedDailyRate) : computedExtDailyRate;
    }
  } else if (input.overrideDailyRate !== undefined) {
    dailyRate = input.overrideDailyRate;
  } else if (storedDailyRate > 0) {
    // Model unknown: fall back to the stored daily rate so the extension is still charged.
    dailyRate = storedDailyRate;
  }

  return { days, dailyRate, cost: Math.round(dailyRate * days * 100) / 100 };
}
