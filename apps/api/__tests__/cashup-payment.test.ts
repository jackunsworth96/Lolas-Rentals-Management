import { describe, expect, it } from 'vitest';
import { cashupCustomerName, cashupPaymentCategory, nextCalendarDate } from '../src/lib/cashup-payment.js';

describe('Cash Up payment presentation', () => {
  it('keeps all hosted Xendit payments separate from bank and physical card sales', () => {
    expect(cashupPaymentCategory('card_xendit', 'xendit')).toBe('online');
    expect(cashupPaymentCategory('card_xendit', 'GCASH')).toBe('online');
    expect(cashupPaymentCategory('rental', 'card')).toBe('card');
    expect(cashupPaymentCategory('rental', 'gcash')).toBe('gcash');
    expect(cashupPaymentCategory('rental', 'cash')).toBe('cash');
  });

  it('uses the raw-booking name until a customer record is linked', () => {
    expect(cashupCustomerName(null, 'Guest Name')).toBe('Guest Name');
    expect(cashupCustomerName('Registered Name', 'Guest Name')).toBe('Registered Name');
    expect(cashupCustomerName(null, null)).toBeNull();
  });

  it('uses the next local midnight as the exclusive receipt boundary', () => {
    expect(nextCalendarDate('2026-10-21')).toBe('2026-10-22');
    expect(nextCalendarDate('2028-02-29')).toBe('2028-03-01');
    expect(nextCalendarDate('2026-12-31')).toBe('2027-01-01');
  });
});
