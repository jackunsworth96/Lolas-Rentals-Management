import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Money } from '@lolas/domain';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

const { settleOrder } = await import('../src/use-cases/orders/settle-order.js');

type Leg = { account_id: string; debit: number; credit: number; reference_type: string };

const cashAccounts = { tillAccountId: 'TILL', envelopeAccountId: 'ENVELOPE' };

function setup(opts: { balanceDue: number; depositMethod: string }) {
  mocks.from.mockReturnValue({
    select: () => ({ in: async (_col: string, ids: string[]) => ({ data: ids.map((id) => ({ id })), error: null }) }),
  });
  mocks.rpc.mockResolvedValue({ error: null });
  const order = {
    id: 'order-1', storeId: 'store-1', customerId: null,
    securityDeposit: Money.php(1000), finalTotal: Money.php(3000),
    calculateBalanceDue: () => Money.php(opts.balanceDue),
  };
  return {
    orderRepo: { findById: vi.fn().mockResolvedValue(order) },
    orderItemRepo: { findByOrderId: vi.fn().mockResolvedValue([]) },
    paymentRepo: {
      findByOrderId: vi.fn().mockResolvedValue([
        { paymentType: 'deposit', paymentMethodId: opts.depositMethod, amount: 1000 },
      ]),
    },
  };
}

function postedLegs(): Leg[] {
  return mocks.rpc.mock.calls[0][1].p_journal_legs as Leg[];
}

const baseInput = {
  orderId: 'order-1', settlementDate: '2026-11-08',
  depositLiabilityAccountId: 'DEPOSITS-HELD', receivableAccountId: 'AR', refundAccountId: 'TILL',
  cashAccounts,
};

describe('settleOrder deposit envelope postings', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('pays a cash deposit refund out of the envelope, not the till', async () => {
    await settleOrder(setup({ balanceDue: 0, depositMethod: 'Cash' }) as never, { ...baseInput, depositRefundMethodId: 'Cash' });
    const refundOut = postedLegs().find((l) => l.reference_type === 'refund' && l.credit > 0);
    expect(refundOut).toMatchObject({ account_id: 'ENVELOPE', credit: 1000 });
    expect(postedLegs().some((l) => l.account_id === 'TILL')).toBe(false);
  });

  it('keeps a GCash deposit refund on the GCash account', async () => {
    await settleOrder(setup({ balanceDue: 0, depositMethod: 'Gcash' }) as never, {
      ...baseInput, refundAccountId: 'GCASH', depositRefundMethodId: 'Gcash',
    });
    expect(postedLegs().find((l) => l.reference_type === 'refund' && l.credit > 0)).toMatchObject({ account_id: 'GCASH' });
  });

  it('moves the applied part of a cash deposit from the envelope into the till', async () => {
    await settleOrder(setup({ balanceDue: 400, depositMethod: 'Cash' }) as never, { ...baseInput, depositRefundMethodId: 'Cash' });
    const moves = postedLegs().filter((l) => l.reference_type === 'deposit_envelope_transfer');
    expect(moves).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'TILL', debit: 400 }),
      expect.objectContaining({ account_id: 'ENVELOPE', credit: 400 }),
    ]));
    expect(postedLegs().find((l) => l.reference_type === 'refund' && l.credit > 0)).toMatchObject({ account_id: 'ENVELOPE', credit: 600 });
  });

  it('books a return charge as income', async () => {
    await settleOrder(setup({ balanceDue: 0, depositMethod: 'Cash' }) as never, {
      ...baseInput,
      depositRefundMethodId: 'Cash',
      returnChargesDelta: 300,
      returnChargesNote: 'Fuel',
      returnChargesPaymentMethodId: 'Cash',
      returnChargesAccountId: 'TILL',
      returnChargesIncomeAccountId: 'INCOME',
    });
    const charge = postedLegs().filter((l) => l.reference_type === 'payment');
    expect(charge).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'TILL', debit: 300 }),
      expect.objectContaining({ account_id: 'INCOME', credit: 300 }),
    ]));
    const legs = postedLegs();
    const net = legs.reduce((s, l) => s + l.debit - l.credit, 0);
    expect(net).toBe(0);
  });
});
