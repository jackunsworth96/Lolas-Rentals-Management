import { describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.hoisted(() => vi.fn());
vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));

import { collectPayment, type CollectPaymentDeps } from '../src/use-cases/orders/collect-payment.js';

const input = {
  orderId: 'order-1', amount: 500, paymentMethodId: 'xendit',
  paymentType: 'rental', transactionDate: '2026-10-03', receivableAccountId: 'receivable',
};

describe('manual rental collection', () => {
  it('does not create a received payment for a gateway method', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: 'xendit', is_active: true, gateway_provider: 'xendit' }, error: null });
    const findById = vi.fn();
    const deps = { orderRepo: { findById } } as unknown as CollectPaymentDeps;
    await expect(collectPayment(deps, input)).rejects.toThrow('provider webhook');
    expect(findById).not.toHaveBeenCalled();
  });

  it('does not allow deposit receipts through the rental payment use case', async () => {
    const deps = { orderRepo: { findById: vi.fn() } } as unknown as CollectPaymentDeps;
    await expect(collectPayment(deps, { ...input, paymentType: 'deposit' })).rejects.toThrow('dedicated workflow');
  });
});
