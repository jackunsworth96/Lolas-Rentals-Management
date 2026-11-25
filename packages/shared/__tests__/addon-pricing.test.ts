import { describe, expect, it } from 'vitest';
import {
  addonPriceLabel,
  addonUnitPrice,
  computeAddonLineTotal,
  rebaseAddonLines,
} from '../src/utils/addon-pricing.js';

const cover = { addonType: 'percentage', pricePercentage: 10, minimumAmount: 300 } as const;

describe('computeAddonLineTotal', () => {
  it('charges a percentage of the rental fee', () => {
    expect(computeAddonLineTotal(cover, { rentalDays: 7, rentalFee: 7000 })).toBe(700);
  });

  it('applies the minimum when the percentage is lower', () => {
    expect(computeAddonLineTotal(cover, { rentalDays: 1, rentalFee: 500 })).toBe(300);
  });

  it('has no floor when the minimum is zero, and rounds to whole pesos', () => {
    expect(
      computeAddonLineTotal({ addonType: 'percentage', pricePercentage: 7.5, minimumAmount: 0 }, { rentalDays: 3, rentalFee: 1235 }),
    ).toBe(93);
  });

  it('leaves per-day and one-time pricing unchanged', () => {
    expect(computeAddonLineTotal({ addonType: 'per_day', pricePerDay: 95 }, { rentalDays: 4, rentalFee: 9999 })).toBe(380);
    expect(computeAddonLineTotal({ addonType: 'one_time', priceOneTime: 150 }, { rentalDays: 4, rentalFee: 9999 })).toBe(150);
  });

  it('reads numeric strings from the database', () => {
    expect(
      computeAddonLineTotal({ addonType: 'percentage', pricePercentage: '10.00', minimumAmount: '0' }, { rentalDays: 2, rentalFee: 2000 }),
    ).toBe(200);
  });
});

describe('addonUnitPrice and addonPriceLabel', () => {
  it('uses the percentage as the unit price', () => {
    expect(addonUnitPrice(cover)).toBe(10);
    expect(addonPriceLabel(cover)).toBe('10% of rental (min ₱300)');
    expect(addonPriceLabel({ addonType: 'per_day', pricePerDay: 95 })).toBe('₱95/day');
  });
});

describe('rebaseAddonLines', () => {
  it('re-prices only percentage lines against a discounted rental', () => {
    const lines = [
      { type: 'percentage', unitPrice: 10, minimumAmount: 0, total: 1000 },
      { type: 'per_day', unitPrice: 95, total: 380 },
    ];
    const rebased = rebaseAddonLines(lines, 8000);
    expect(rebased.lines.map((l) => l.total)).toEqual([800, 380]);
    expect(rebased.total).toBe(1180);
  });
});
