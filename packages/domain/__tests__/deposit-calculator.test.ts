import { describe, it, expect } from 'vitest';
import { calculateRefundableDeposit } from '../src/services/deposit-calculator.js';
import { Money } from '../src/value-objects/money.js';

describe('calculateRefundableDeposit', () => {
  it('applies full deposit when balance exceeds deposit', () => {
    const result = calculateRefundableDeposit(
      Money.php(1000),
      Money.php(2000),
    );
    expect(result.amountApplied.toNumber()).toBe(1000);
    expect(result.refund.toNumber()).toBe(0);
  });

  it('refunds excess when deposit exceeds balance', () => {
    const result = calculateRefundableDeposit(
      Money.php(1000),
      Money.php(600),
    );
    expect(result.amountApplied.toNumber()).toBe(600);
    expect(result.refund.toNumber()).toBe(400);
  });

  it('refunds full deposit when balance is zero', () => {
    const result = calculateRefundableDeposit(
      Money.php(1000),
      Money.zero(),
    );
    expect(result.amountApplied.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(1000);
  });

  it('refunds full deposit when balance is negative', () => {
    const result = calculateRefundableDeposit(
      Money.php(1000),
      Money.php(-500),
    );
    expect(result.amountApplied.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(1000);
  });

  it('handles exact match (deposit equals balance)', () => {
    const result = calculateRefundableDeposit(
      Money.php(1000),
      Money.php(1000),
    );
    expect(result.amountApplied.toNumber()).toBe(1000);
    expect(result.refund.toNumber()).toBe(0);
  });

  it('throws on negative deposit', () => {
    expect(() =>
      calculateRefundableDeposit(Money.php(-100), Money.php(500)),
    ).toThrow('negative');
  });

  it('handles zero deposit', () => {
    const result = calculateRefundableDeposit(
      Money.zero(),
      Money.php(500),
    );
    expect(result.amountApplied.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(0);
  });
});
