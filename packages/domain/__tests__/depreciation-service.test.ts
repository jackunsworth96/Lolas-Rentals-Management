import { describe, it, expect } from 'vitest';
import { calculateMonthlyDepreciation } from '../src/services/depreciation-service.js';

describe('calculateMonthlyDepreciation', () => {
  it('calculates standard straight-line depreciation', () => {
    const result = calculateMonthlyDepreciation({
      purchasePrice: 100000,
      salvageValue: 35000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 0,
    });
    expect(result.monthlyAmount).toBeCloseTo(1805.56, 2);
    expect(result.actualDepreciation).toBeCloseTo(1805.56, 2);
    expect(result.newBookValue).toBeCloseTo(98194.44, 2);
  });

  it('stops depreciation at salvage value', () => {
    const result = calculateMonthlyDepreciation({
      purchasePrice: 100000,
      salvageValue: 35000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 64500,
    });
    expect(result.actualDepreciation).toBe(500);
    expect(result.newBookValue).toBeCloseTo(35000, 2);
  });

  it('returns zero when fully depreciated', () => {
    const result = calculateMonthlyDepreciation({
      purchasePrice: 100000,
      salvageValue: 35000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 65000,
    });
    expect(result.actualDepreciation).toBe(0);
    expect(result.newBookValue).toBe(35000);
  });

  it('throws on zero useful life', () => {
    expect(() =>
      calculateMonthlyDepreciation({
        purchasePrice: 100000,
        salvageValue: 35000,
        usefulLifeMonths: 0,
        accumulatedDepreciation: 0,
      }),
    ).toThrow('Useful life must be positive');
  });

  it('handles salvage value equal to purchase price', () => {
    const result = calculateMonthlyDepreciation({
      purchasePrice: 100000,
      salvageValue: 100000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 0,
    });
    expect(result.monthlyAmount).toBe(0);
    expect(result.actualDepreciation).toBe(0);
  });

  it('excludes reusable setup costs from the Honda Beat depreciation basis', () => {
    const result = calculateMonthlyDepreciation({
      purchasePrice: 75122,
      salvageValue: 35000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 0,
    });
    expect(result.monthlyAmount).toBe(1114.5);
    expect(result.newBookValue).toBe(74007.5);
  });
});
