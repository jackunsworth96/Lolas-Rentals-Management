import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../src/adapters/supabase/client.js', () => ({ supabase: mocks.supabase }));

const { processRawOrder } = await import('../src/use-cases/orders/process-raw-order.js');

function query(result: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'update', 'eq']) builder[method] = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    rawOrderId: '5a2cf641-796d-4b72-a0d6-1f3487410cdc',
    storeId: 'store-lolas', employeeId: 'employee-1',
    customer: { name: 'Test Guest', email: null, phone: null },
    vehicleAssignments: [{
      vehicleId: 'vehicle-1', vehicleName: 'Honda Beat',
      pickupDatetime: '2026-10-05T01:00:00Z', dropoffDatetime: '2026-10-06T01:00:00Z',
      rentalDaysCount: 1, pickupLocation: 'Shop', dropoffLocation: 'Shop',
      pickupFee: 0, dropoffFee: 0, rentalRate: 500, discount: 0,
      helmetNumbers: null, opsNotes: null,
    }],
    addons: [], securityDeposit: 1000, webQuoteRaw: null, webNotes: null,
    receivableAccountId: 'receivable', incomeAccountId: 'rental-income',
    paymentMethodId: 'cash', depositMethodId: 'cash', depositCollected: false,
    depositReceivingAccountId: 'deposit-asset', depositLiabilityAccountId: 'deposit-liability',
    paymentAccountId: 'rental-asset', cardFeeSurcharge: 0, ...overrides,
  };
}

function deps(prepayments: Array<Record<string, unknown>> = []) {
  return {
    fleetRepo: { findById: vi.fn(async () => ({ id: 'vehicle-1', status: 'Available', isRentable: () => true })) },
    customerRepo: { findByEmail: vi.fn(), findByMobile: vi.fn() },
    paymentRepo: { findByRawOrderId: vi.fn(async () => prepayments) },
    orderRepo: { findById: vi.fn(async () => ({ id: 'order-1', customerId: null })) },
  } as any;
}

describe('raw-order activation deposit receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') return query({
        data: { id: input().rawOrderId, store_id: 'store-lolas', payload: {},
          charity_donation: 0, transfer_type: null, order_reference: null }, error: null,
      });
      if (table === 'orders') return query({ error: null });
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.supabase.rpc.mockResolvedValue({ data: [{ order_id: 'order-1', was_new: true }], error: null });
  });

  it('does not create a deposit receipt from a selected method and rental account alone', async () => {
    await processRawOrder(deps(), input() as any);
    const payload = mocks.supabase.rpc.mock.calls[0][1];
    expect(payload.p_deposit_payment).toBeNull();
    expect(payload.p_order_row.deposit_status).toBeNull();
    expect(payload.p_order_row.deposit_method_id).toBeNull();
    expect(payload.p_order_row.balance_due).toBe(0);
    expect(payload.p_journal_legs).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'deposit-liability' }),
    ]));
  });

  it('posts a confirmed deposit separately from rental income and balance', async () => {
    await processRawOrder(deps(), input({ depositCollected: true }) as any);
    const payload = mocks.supabase.rpc.mock.calls[0][1];
    expect(payload.p_deposit_payment).toEqual(expect.objectContaining({
      payment_type: 'deposit', amount: 1000, payment_method_id: 'cash', account_id: 'deposit-asset',
    }));
    expect(payload.p_order_row.deposit_status).toBe('paid');
    expect(payload.p_order_row.deposit_method_id).toBe('cash');
    expect(payload.p_order_row.balance_due).toBe(0);
    expect(payload.p_journal_legs).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'deposit-asset', debit: 1000, credit: 0 }),
      expect.objectContaining({ account_id: 'deposit-liability', debit: 0, credit: 1000 }),
    ]));
  });

  it('keeps a webhook-paid rental distinct from a manually collected deposit', async () => {
    const prepayment = { paymentType: 'card_xendit', paymentMethodId: 'xendit', amount: 500 };
    await processRawOrder(deps([prepayment]), input({
      paymentMethodId: null, paymentAccountId: null, depositCollected: true,
    }) as any);
    const payload = mocks.supabase.rpc.mock.calls[0][1];
    expect(payload.p_rental_payment).toBeNull();
    expect(payload.p_deposit_payment).toEqual(expect.objectContaining({ amount: 1000, account_id: 'deposit-asset' }));
    expect(payload.p_order_row.balance_due).toBe(0);
  });

  it('rejects incomplete confirmed-deposit details before any database lookup', async () => {
    await expect(processRawOrder(deps(), input({
      depositCollected: true, depositReceivingAccountId: null,
    }) as any)).rejects.toThrow('Confirmed deposit collection requires');
    expect(mocks.supabase.from).not.toHaveBeenCalled();
  });
});
