import { describe, expect, it } from 'vitest';
import { summarizeOrderPayments } from '../src/utils/order-payment-summary.js';

describe('summarizeOrderPayments', () => {
  it('does not treat a configured but uncollected deposit as held money', () => {
    expect(summarizeOrderPayments([{ paymentType: 'card_xendit', amount: 500 }])).toEqual({
      rentalPaid: 500,
      depositCollected: 0,
      depositRefunded: 0,
      depositApplied: 0,
      depositHeld: 0,
      pendingExtensions: 0,
    });
  });

  it('separates rental receipts, actual deposits, and manual refunds', () => {
    expect(summarizeOrderPayments([
      { paymentType: 'card_xendit', amount: 500 },
      { paymentType: 'deposit', amount: 1000 },
      { paymentType: 'refund', amount: 100 },
      { paymentType: 'deposit_refund', amount: 250 },
    ])).toEqual({
      rentalPaid: 400,
      depositCollected: 1000,
      depositRefunded: 250,
      depositApplied: 0,
      depositHeld: 750,
      pendingExtensions: 0,
    });
  });

  it('excludes pending and absorbed IOUs from received rental payments', () => {
    expect(summarizeOrderPayments([
      { paymentType: 'extension', amount: 75, settlementStatus: 'pending' },
      { paymentType: 'extension', amount: 25, settlementStatus: 'absorbed' },
      { paymentType: 'addon', amount: 50, paymentMethodId: 'xendit', settlementStatus: 'pending' },
      { paymentType: 'card_xendit', amount: 150 },
    ])).toMatchObject({ rentalPaid: 150, pendingExtensions: 75 });
  });

  it('moves an applied deposit from held liability into rental paid without a new receipt', () => {
    expect(summarizeOrderPayments([
      { paymentType: 'card_xendit', amount: 500 },
      { paymentType: 'deposit', amount: 1000 },
      { paymentType: 'deposit_refund', amount: 600 },
      { paymentType: 'deposit_applied', amount: 400 },
    ])).toMatchObject({ rentalPaid: 900, depositHeld: 0, depositApplied: 400, depositRefunded: 600 });
  });
});
