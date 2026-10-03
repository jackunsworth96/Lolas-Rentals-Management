import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: { rpc: mocks.rpc },
}));

const { refundOrder } = await import('../src/use-cases/orders/refund-order.js');

describe('refundOrder', () => {
  it('records refund classification and actual return in one RPC call', async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    const order = { id: 'order-1', storeId: 'store-1', customerId: 'customer-1', applyPayments: vi.fn() };
    const deps = {
      orderRepo: { findById: vi.fn().mockResolvedValue(order), save: vi.fn() },
      paymentRepo: { findByOrderId: vi.fn().mockResolvedValue([]) },
    };

    await refundOrder(deps as never, {
      orderId: 'order-1', amount: 3255,
      refundMethodId: 'Cash', refundAccountId: 'cash', receivableAccountId: 'income',
      transactionDate: '2026-10-03', affectsRentalRevenue: true,
      revenueSource: 'extension', sourcePaymentId: 'extension-1', orderItemId: 'item-1',
      actualReturnDatetime: '2026-10-03T10:00:00+08:00',
    });

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('record_refund_atomic', expect.objectContaining({
      p_amount: 3255,
      p_affects_rental_revenue: true,
      p_revenue_source: 'extension',
      p_source_payment_id: 'extension-1',
      p_order_item_id: 'item-1',
      p_actual_return_datetime: '2026-10-03T10:00:00+08:00',
    }));
    expect(deps.orderRepo.findById).toHaveBeenCalledTimes(2);
  });
});
