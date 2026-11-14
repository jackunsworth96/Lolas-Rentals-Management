import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: vi.fn() }));

import { buildRoutedAccounts, resolvePaymentAccount } from '../src/lib/deposit-envelope.js';

const routed = buildRoutedAccounts(
  [
    { payment_method_id: 'Cash', received_into_account_id: 'CASH-LOLA' },
    { payment_method_id: 'Gcash', received_into_account_id: 'GCASH-store-lolas' },
  ],
  'CASH-DEPOSIT-ENVELOPE',
);

describe('resolvePaymentAccount', () => {
  it('books a Cash payment to the till even if the client sent a stale GCash account', () => {
    expect(resolvePaymentAccount(routed, 'Cash', 'GCASH-store-lolas')).toBe('CASH-LOLA');
  });

  it('matches the method case-insensitively', () => {
    expect(resolvePaymentAccount(routed, 'cash', null)).toBe('CASH-LOLA');
    expect(resolvePaymentAccount(routed, 'GCash', 'CASH-LOLA')).toBe('GCASH-store-lolas');
  });

  it('falls back to the client account only when the method has no routing rule', () => {
    expect(resolvePaymentAccount(routed, 'Bank Transfer', 'BANK-BDO-store-lolas')).toBe('BANK-BDO-store-lolas');
  });

  it('returns null when there is neither a rule nor a client account', () => {
    expect(resolvePaymentAccount(routed, 'Bank Transfer', null)).toBeNull();
    expect(resolvePaymentAccount(routed, null, undefined)).toBeNull();
  });
});
