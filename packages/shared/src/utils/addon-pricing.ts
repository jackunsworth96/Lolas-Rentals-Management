export type AddonType = 'per_day' | 'one_time' | 'percentage';

export interface AddonPricingFields {
  addonType: AddonType | string;
  pricePerDay?: number | string | null;
  priceOneTime?: number | string | null;
  pricePercentage?: number | string | null;
  minimumAmount?: number | string | null;
}

export interface AddonPricingContext {
  rentalDays: number;
  /** Vehicle rental subtotal after discounts; excludes delivery/collection fees and other add-ons. */
  rentalFee: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Value stored as `addon_price` on order lines: daily rate, one-off price, or the percentage. */
export function addonUnitPrice(addon: AddonPricingFields): number {
  if (addon.addonType === 'per_day') return num(addon.pricePerDay);
  if (addon.addonType === 'percentage') return num(addon.pricePercentage);
  return num(addon.priceOneTime);
}

export function computeAddonLineTotal(addon: AddonPricingFields, ctx: AddonPricingContext): number {
  if (addon.addonType === 'per_day') return num(addon.pricePerDay) * Math.max(0, ctx.rentalDays);
  if (addon.addonType === 'percentage') {
    const pct = (Math.max(0, ctx.rentalFee) * num(addon.pricePercentage)) / 100;
    return Math.round(Math.max(pct, num(addon.minimumAmount)));
  }
  return num(addon.priceOneTime);
}

interface PricedAddonLine {
  type: string;
  unitPrice: number;
  minimumAmount?: number;
  total: number;
}

/**
 * Re-prices percentage lines against a different rental fee (e.g. after a partner discount)
 * and returns the new lines and their sum. Other line types are unchanged.
 */
export function rebaseAddonLines<T extends PricedAddonLine>(
  lines: T[],
  rentalFee: number,
): { lines: T[]; total: number } {
  const rebased = lines.map((line) =>
    line.type === 'percentage'
      ? {
          ...line,
          total: computeAddonLineTotal(
            { addonType: 'percentage', pricePercentage: line.unitPrice, minimumAmount: line.minimumAmount },
            { rentalDays: 0, rentalFee },
          ),
        }
      : line,
  );
  return { lines: rebased, total: rebased.reduce((s, l) => s + l.total, 0) };
}

/** Short price label, e.g. "₱150/day", "₱500", "10% of rental (min ₱300)". */
export function addonPriceLabel(addon: AddonPricingFields, currency = '₱'): string {
  const fmt = (n: number) => `${currency}${n.toLocaleString()}`;
  if (addon.addonType === 'per_day') return `${fmt(num(addon.pricePerDay))}/day`;
  if (addon.addonType === 'percentage') {
    const min = num(addon.minimumAmount);
    return `${num(addon.pricePercentage)}% of rental${min > 0 ? ` (min ${fmt(min)})` : ''}`;
  }
  return fmt(num(addon.priceOneTime));
}
