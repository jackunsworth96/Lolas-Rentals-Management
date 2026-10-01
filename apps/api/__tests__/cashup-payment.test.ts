import { describe, expect, it } from 'vitest';
import { cashupCustomerName, cashupPaymentCategory } from '../src/lib/cashup-payment.js';

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
});
