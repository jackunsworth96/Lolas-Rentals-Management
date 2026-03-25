import { describe, it, expect } from 'vitest';
import { calculateMonthlyDepreciation } from '../src/services/depreciation-service.js';

describe('calculateMonthlyDepreciation', () => {
  it('calculates standard straight-line depreciation', () => {
    const result = calculateMonthlyDepreciation({
      totalCost: 100000,
      salvageValue: 35000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 0,
      bookValue: 100000,
    });
    expect(result.monthlyAmount).toBeCloseTo(1805.56, 2);
    expect(result.actualDepreciation).toBeCloseTo(1805.56, 2);
    expect(result.newBookValue).toBeCloseTo(98194.44, 2);
  });

  it('stops depreciation at salvage value', () => {
    const result = calculateMonthlyDepreciation({
      totalCost: 100000,
      salvageValue: 35000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 64500,
      bookValue: 35500,
    });
    expect(result.actualDepreciation).toBe(500);
    expect(result.newBookValue).toBeCloseTo(35000, 2);
  });

  it('returns zero when fully depreciated', () => {
    const result = calculateMonthlyDepreciation({
      totalCost: 100000,
      salvageValue: 35000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 65000,
      bookValue: 35000,
    });
    expect(result.actualDepreciation).toBe(0);
    expect(result.newBookValue).toBe(35000);
  });

  it('throws on zero useful life', () => {
    expect(() =>
      calculateMonthlyDepreciation({
        totalCost: 100000,
        salvageValue: 35000,
        usefulLifeMonths: 0,
        accumulatedDepreciation: 0,
        bookValue: 100000,
      }),
    ).toThrow('Useful life must be positive');
  });

  it('handles salvage value equal to total cost', () => {
    const result = calculateMonthlyDepreciation({
      totalCost: 100000,
      salvageValue: 100000,
      usefulLifeMonths: 36,
      accumulatedDepreciation: 0,
      bookValue: 100000,
    });
    expect(result.monthlyAmount).toBe(0);
    expect(result.actualDepreciation).toBe(0);
  });
});
