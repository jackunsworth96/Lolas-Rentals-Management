import { computeAddonLineTotal } from '@lolas/shared';
import type { Addon } from './basket-types.js';

/** Add-on charge across every vehicle in the basket; percentage add-ons use each vehicle's discounted rental. */
export function addonBasketTotal(
  addon: Addon,
  basket: Array<{ dailyRate: number }>,
  rentalDays: number,
  rentalDiscount: number,
): number {
  const gross = basket.reduce((s, b) => s + b.dailyRate * rentalDays, 0);
  const netRatio = gross > 0 ? Math.max(0, gross - rentalDiscount) / gross : 1;
  return basket.reduce(
    (s, b) => s + computeAddonLineTotal(addon, { rentalDays, rentalFee: b.dailyRate * rentalDays * netRatio }),
    0,
  );
}
