import { describe, expect, it } from 'vitest';
import { revenueAmount, revenuePaymentsOnly } from '../src/lib/revenue-payments.js';

describe('revenuePaymentsOnly', () => {
  it('excludes deposits, deposit refunds and unreceived (pending or absorbed) payments', () => {
    const calls: Array<[string, ...string[]]> = [];
    const query = {
      not(column: string, operator: string, value: string) { calls.push(['not', column, operator, value]); return query; },
      or(filters: string) { calls.push(['or', filters]); return query; },
    };
    revenuePaymentsOnly(query);
    expect(calls).toEqual([
      ['not', 'payment_type', 'in', '(deposit,security_deposit,deposit_refund)'],
      ['or', 'settlement_status.is.null,settlement_status.not.in.(pending,absorbed)'],
    ]);
  });
});

describe('revenueAmount', () => {
  it('counts a rental refund as money out and everything else as money in', () => {
    expect(revenueAmount({ amount: '4650.00', payment_type: 'refund' })).toBe(-4650);
    expect(revenueAmount({ amount: -4650, payment_type: 'refund' })).toBe(-4650);
    expect(revenueAmount({ amount: '1705', payment_type: 'rental' })).toBe(1705);
    expect(revenueAmount({ amount: null, payment_type: 'extension' })).toBe(0);
  });
});
