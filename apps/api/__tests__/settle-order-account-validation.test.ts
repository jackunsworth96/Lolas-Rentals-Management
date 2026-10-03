import { describe, expect, it, vi } from 'vitest';
import { Money } from '@lolas/domain';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

const { settleOrder } = await import('../src/use-cases/orders/settle-order.js');

describe('settleOrder account validation', () => {
  it('names a missing journal account before the settlement RPC runs', async () => {
    mocks.from.mockReturnValue({
      select: () => ({ in: async () => ({ data: [{ id: 'deposit-liability' }], error: null }) }),
    });
    const order = {
      id: 'order-1', storeId: 'store-1', customerId: null,
      securityDeposit: Money.php(1000), finalTotal: Money.php(1500),
      calculateBalanceDue: () => Money.zero(),
    };
    const deps = {
      orderRepo: { findById: vi.fn().mockResolvedValue(order) },
      orderItemRepo: { findByOrderId: vi.fn().mockResolvedValue([]) },
      paymentRepo: { findByOrderId: vi.fn().mockResolvedValue([]) },
    };

    await expect(settleOrder(deps as never, {
      orderId: 'order-1', settlementDate: '2026-10-04',
      depositLiabilityAccountId: 'deposit-liability',
      receivableAccountId: 'receivable', refundAccountId: 'deleted-cash',
      depositRefundMethodId: 'cash',
    })).rejects.toThrow('Settlement account deleted-cash no longer exists');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
