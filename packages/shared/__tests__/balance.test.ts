import { describe, expect, it } from 'vitest';
import { calculateBalanceDue } from '../src/utils/balance.js';

describe('calculateBalanceDue', () => {
  it('does not count an extension already included in the order total twice', () => {
    expect(calculateBalanceDue(5_040, 4_945)).toBe(95);
  });

  it('does not show a negative balance after overpayment', () => {
    expect(calculateBalanceDue(5_040, 5_600)).toBe(0);
  });
});
