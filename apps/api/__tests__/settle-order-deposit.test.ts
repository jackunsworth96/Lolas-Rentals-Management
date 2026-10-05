import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Money } from '@lolas/domain';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/adapters/supabase/client.js', () => ({ supabase: { rpc } }));
vi.mock('../src/lib/manual-refund-method.js', () => ({ assertManualRefundMethod: vi.fn() }));

import { settleOrder, type SettleOrderDeps } from '../src/use-cases/orders/settle-order.js';

function dependencies(payments: Array<Record<string, unknown>>): SettleOrderDeps {
  const order = {
    id: 'order-1', storeId: 'store-lolas', customerId: 'customer-1',
    finalTotal: Money.php(500), securityDeposit: Money.php(1000),
    calculateBalanceDue: () => Money.zero(),
  };
  return {
    orderRepo: { findById: vi.fn().mockResolvedValue(order) },
    orderItemRepo: { findByOrderId: vi.fn().mockResolvedValue([]) },
    paymentRepo: { findByOrderId: vi.fn().mockResolvedValue(payments) },
    fleetRepo: {}, accountingPort: {}, cardSettlementRepo: {},
  } as unknown as SettleOrderDeps;
}

const baseInput = {
  orderId: 'order-1', settlementDate: '2026-10-03',
  depositLiabilityAccountId: 'deposit-liability', receivableAccountId: 'receivable',
  refundAccountId: 'cash-account',
};

describe('settleOrder deposit evidence', () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ error: null }));

  it('does not refund a configured deposit with no collection receipt', async () => {
    const result = await settleOrder(dependencies([
      { paymentType: 'card_xendit', amount: 500 },
    ]), baseInput);
    expect(result.depositRefund).toBe(0);
    expect(result.depositApplied).toBe(0);
    expect(rpc).toHaveBeenCalledWith('settle_order_checked_atomic', expect.objectContaining({
      p_deposit_refund_payment: null,
      p_journal_legs: [],
    }));
  });

  it('rejects a held-deposit refund without a verified manual method', async () => {
    await expect(settleOrder(dependencies([
      { paymentType: 'card_xendit', amount: 500 },
      { paymentType: 'deposit', amount: 1000 },
    ]), baseInput)).rejects.toThrow('verified manual deposit refund method');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed if the checked RPC is not installed', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'function does not exist' } });
    await expect(settleOrder(dependencies([
      { paymentType: 'card_xendit', amount: 500 },
    ]), baseInput)).rejects.toThrow('settle_order_checked_atomic RPC failed');
  });
});
