import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('../src/lib/assert-vehicle-assignment.js', () => ({
  assertAssignmentsAvailable: vi.fn().mockResolvedValue(undefined),
}));

const { processRawOrder } = await import('../src/use-cases/orders/process-raw-order.js');

type Leg = { account_id: string; debit: number; credit: number; reference_type: string };

const rawOrder = { id: 'raw-1', store_id: 'store-1', payload: {}, order_reference: 'LR-TEST', charity_donation: 0 };
const routing: Record<string, string> = { cash: 'TILL', gcash: 'GCASH', card: 'CARD-PENDING' };
const cashAccounts = {
  tillAccountId: 'TILL',
  envelopeAccountId: 'ENVELOPE',
  accountFor: (m: string | null | undefined) => routing[String(m ?? '').toLowerCase()] ?? null,
};

function query(): Record<string, unknown> {
  const result = { data: rawOrder, error: null };
  const q: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  for (const m of ['select', 'eq', 'is', 'update', 'single']) q[m] = () => q;
  return q;
}

function deps() {
  return {
    fleetRepo: { findById: vi.fn() },
    customerRepo: { findByEmail: vi.fn().mockResolvedValue(null), findByMobile: vi.fn().mockResolvedValue(null) },
    paymentRepo: { findByRawOrderId: vi.fn().mockResolvedValue([]) },
    orderRepo: { findById: vi.fn().mockResolvedValue({ id: 'order-1' }) },
    transferRepo: { findByBookingToken: vi.fn().mockResolvedValue(null) },
  };
}

const baseInput = {
  rawOrderId: 'raw-1',
  storeId: 'store-1',
  employeeId: 'emp-1',
  customer: { name: 'Test Renter', email: null, phone: null },
  vehicleAssignments: [],
  addons: [{ addonName: 'Scooter', addonPrice: 2000, addonType: 'one_time', quantity: 1, totalAmount: 2000 }],
  securityDeposit: 1000,
  webQuoteRaw: null,
  webNotes: null,
  receivableAccountId: 'AR',
  incomeAccountId: 'INCOME',
  cardFeeSurcharge: 0,
  depositLiabilityAccountId: 'DEPOSITS-HELD',
  cashAccounts,
};

const rpcArgs = () => mocks.rpc.mock.calls[0][1] as {
  p_journal_legs: Leg[];
  p_deposit_payment: { account_id: string; amount: number } | null;
  p_order_row: { balance_due: number; deposit_status: string | null };
};

describe('processRawOrder security deposit', () => {
  beforeEach(() => {
    mocks.from.mockReset().mockImplementation(query);
    mocks.rpc.mockReset().mockResolvedValue({ data: [{ order_id: 'order-1', was_new: true }], error: null });
  });

  it('records a cash deposit in the envelope when the rental is paid by card', async () => {
    await processRawOrder(deps() as never, {
      ...baseInput, paymentMethodId: 'Card', depositMethodId: 'Cash', paymentAccountId: null, isCardPayment: true,
    });
    const args = rpcArgs();
    expect(args.p_deposit_payment).toMatchObject({ account_id: 'ENVELOPE', amount: 1000 });
    expect(args.p_journal_legs).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'ENVELOPE', debit: 1000 }),
      expect.objectContaining({ account_id: 'DEPOSITS-HELD', credit: 1000 }),
    ]));
    expect(args.p_order_row.deposit_status).toBe('paid');
  });

  it('does not count the deposit toward a partially paid rental', async () => {
    await processRawOrder(deps() as never, {
      ...baseInput, paymentMethodId: 'Gcash', depositMethodId: 'Cash', paymentAccountId: 'GCASH', partialPaymentAmount: 500,
    });
    expect(rpcArgs().p_order_row.balance_due).toBe(1500);
  });
});
