import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Money } from '@lolas/domain';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: { rpc: mocks.rpc },
}));

const { collectPayment } = await import('../src/use-cases/orders/collect-payment.js');

type Row = { id: string; paymentType: string; amount: number; paymentMethodId: string; settlementStatus: string | null };

const addonIou: Row = { id: 'iou-1', paymentType: 'addon', amount: 665, paymentMethodId: 'pending', settlementStatus: 'pending' };

function deps(existing: Row[], afterwards: Row[]) {
  const order = {
    id: 'order-1',
    storeId: 'store-1',
    customerId: 'cust-1',
    finalTotal: Money.php(4295),
    balanceDue: Money.php(4295),
    applyPayments: vi.fn(),
  };
  return {
    order,
    deps: {
      orderRepo: { findById: vi.fn().mockResolvedValue(order), save: vi.fn() },
      paymentRepo: { findByOrderId: vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(afterwards) },
      accountingPort: {},
      cardSettlementRepo: { save: vi.fn() },
    } as never,
  };
}

const input = {
  orderId: 'order-1', amount: 4295, paymentMethodId: 'Wise', accountId: 'WISE',
  paymentType: 'rental', transactionDate: '2026-11-17', receivableAccountId: 'AR',
};

describe('collectPayment add-on IOUs', () => {
  beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ error: null }));

  it('absorbs a pending add-on IOU when the payment clears the balance', async () => {
    const { deps: d, order } = deps(
      [addonIou],
      [{ ...addonIou, settlementStatus: 'absorbed' }, { id: 'pay-1', paymentType: 'rental', amount: 4295, paymentMethodId: 'Wise', settlementStatus: null }],
    );
    await collectPayment(d, input);

    expect(mocks.rpc.mock.calls[0][1].p_absorbed_extension_iou_ids).toEqual(['iou-1']);
    expect(order.applyPayments.mock.calls[0][0].toNumber()).toBe(4295);
  });

  it('leaves the IOU pending when the payment does not clear the balance', async () => {
    const { deps: d } = deps([addonIou], [addonIou]);
    await collectPayment(d, { ...input, amount: 1000 });

    expect(mocks.rpc.mock.calls[0][1].p_absorbed_extension_iou_ids).toBeNull();
  });
});
