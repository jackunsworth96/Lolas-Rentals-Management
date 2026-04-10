import type { ConfigRepository, ModelPricing, Location, Addon } from '@lolas/domain';
import type { QuoteBreakdown, QuoteAddonLine } from '@lolas/shared';

export interface ComputeQuoteInput {
  storeId: string;
  vehicleModelId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  addonIds?: number[];
}

export interface ComputeQuoteDeps {
  configRepo: ConfigRepository;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function computeQuote(
  deps: ComputeQuoteDeps,
  input: ComputeQuoteInput,
): Promise<QuoteBreakdown> {
  const pickup = new Date(input.pickupDatetime);
  const dropoff = new Date(input.dropoffDatetime);

  if (Number.isNaN(pickup.getTime()) || Number.isNaN(dropoff.getTime())) {
    throw new Error('Invalid pickup or dropoff datetime');
  }
  if (dropoff <= pickup) {
    throw new Error('Dropoff datetime must be after pickup datetime');
  }

  const rentalDays = Math.max(1, Math.ceil((dropoff.getTime() - pickup.getTime()) / MS_PER_DAY));

  const vehicleModel = await deps.configRepo.getVehicleModelById(input.vehicleModelId);
  if (!vehicleModel) {
    const err = new Error(`Vehicle model "${input.vehicleModelId}" not found or inactive`);
    (err as Error & { statusCode: number }).statusCode = 422;
    throw err;
  }

  const securityDeposit = Math.max(0, Number(vehicleModel.securityDeposit ?? 0));

  // --- Daily rate from tiered pricing ---
  const pricingTiers = await deps.configRepo.getModelPricing(input.vehicleModelId, input.storeId);
  const tier = pricingTiers.find(
    (t: ModelPricing) => t.minDays <= rentalDays && t.maxDays >= rentalDays,
  );

  if (!tier) {
    const err = new Error(
      `No pricing tier configured for ${input.vehicleModelId} at ${rentalDays} day(s). Please contact the store.`,
    );
    (err as Error & { statusCode: number }).statusCode = 422;
    throw err;
  }

  const dailyRate = Number(tier.dailyRate);
  const rentalSubtotal = dailyRate * rentalDays;

  // --- Location fees ---
  const locations = await deps.configRepo.getLocations(input.storeId);
  const locMap = new Map<number | string, Location>();
  for (const loc of locations) {
    locMap.set(Number(loc.id), loc);
  }

  const pickupLoc = locMap.get(input.pickupLocationId);
  const dropoffLoc = locMap.get(input.dropoffLocationId);

  const pickupFee = pickupLoc ? Number(pickupLoc.deliveryCost) : 0;
  const dropoffFee = dropoffLoc ? Number(dropoffLoc.collectionCost) : 0;

  // --- Add-ons ---
  const addonLines: QuoteAddonLine[] = [];
  let addonsTotal = 0;

  if (input.addonIds && input.addonIds.length > 0) {
    const allAddons = await deps.configRepo.getAddons(input.storeId);
    const addonMap = new Map<number, Addon>();
    for (const a of allAddons) {
      if (a.isActive) addonMap.set(Number(a.id), a);
    }

    const requestedIds = new Set(input.addonIds);
    const selected: Addon[] = [];
    for (const id of requestedIds) {
      const addon = addonMap.get(id);
      if (!addon) {
        const err = new Error(`Add-on ${id} not found or inactive for this store`);
        (err as Error & { statusCode: number }).statusCode = 422;
        throw err;
      }
      selected.push(addon);
    }

    // Mutual exclusivity check
    const groupsSeen = new Map<string, string>();
    for (const addon of selected) {
      if (addon.mutualExclusivityGroup) {
        const existing = groupsSeen.get(addon.mutualExclusivityGroup);
        if (existing) {
          const err = new Error(
            `Add-ons "${existing}" and "${addon.name}" cannot be selected together`,
          );
          (err as Error & { statusCode: number }).statusCode = 422;
          throw err;
        }
        groupsSeen.set(addon.mutualExclusivityGroup, addon.name);
      }
    }

    for (const addon of selected) {
      const unitPrice =
        addon.addonType === 'per_day' ? Number(addon.pricePerDay) : Number(addon.priceOneTime);
      const total =
        addon.addonType === 'per_day' ? unitPrice * rentalDays : unitPrice;

      addonLines.push({
        id: Number(addon.id),
        name: addon.name,
        type: addon.addonType,
        unitPrice,
        total,
      });
      addonsTotal += total;
    }
  }

  return {
    rentalDays,
    dailyRate,
    rentalSubtotal,
    pickupFee,
    dropoffFee,
    addons: addonLines,
    addonsTotal,
    securityDeposit,
    grandTotal: rentalSubtotal + addonsTotal,
    grandTotalWithFees: rentalSubtotal + pickupFee + dropoffFee + addonsTotal,
  };
}
