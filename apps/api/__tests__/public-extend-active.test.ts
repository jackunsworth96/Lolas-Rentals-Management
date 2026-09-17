import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  computeQuote: vi.fn(),
  checkAvailability: vi.fn(),
  resolveStoreAccounts: vi.fn(),
  sendEmail: vi.fn(),
  sendTelegramAlert: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));
vi.mock('../src/use-cases/booking/compute-quote.js', () => ({ computeQuote: mocks.computeQuote }));
vi.mock('../src/use-cases/booking/check-availability.js', () => ({ checkAvailability: mocks.checkAvailability }));
vi.mock('../src/adapters/supabase/maintenance-expense-rpc.js', () => ({
  resolveStoreAccounts: mocks.resolveStoreAccounts,
}));
vi.mock('../src/services/email.js', () => ({
  sendEmail: mocks.sendEmail,
  extendConfirmationHtml: vi.fn(() => '<html />'),
  escapeHtml: (value: string) => value,
}));
vi.mock('../src/lib/telegram.js', () => ({
  sendTelegramAlert: mocks.sendTelegramAlert,
  getTelegramChatId: vi.fn(() => null),
}));

const { resolveExtensionForActive } = await import('../src/routes/public-extend-helpers.js');

function resultQuery<T>(getResult: () => { data: T; error: null }) {
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    not: vi.fn(() => query),
    ilike: vi.fn(() => query),
    limit: vi.fn(async () => getResult()),
    single: vi.fn(async () => getResult()),
    maybeSingle: vi.fn(async () => getResult()),
    then: (
      resolve: (value: { data: T; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(getResult()).then(resolve, reject),
  };
  return query;
}

function activeBookingClient(options?: {
  addons?: Array<Record<string, unknown>>;
}) {
  const state = {
    order: {
      id: 'order-active',
      customer_id: 'customer-1',
      store_id: 'store-lolas',
      booking_token: 'LR-0720-2C2D',
      final_total: 4000,
      balance_due: 0,
    },
    item: {
      id: 'item-active',
      order_id: 'order-active',
      vehicle_id: 'vehicle-1',
      pickup_datetime: '2026-07-20T11:15:00+08:00',
      dropoff_datetime: '2026-07-22T11:15:00+08:00',
      store_id: 'store-lolas',
      rental_days_count: 2,
      rental_rate: 500,
      pickup_fee: 0,
      dropoff_fee: 0,
      discount: 0,
      dropoff_location_id: '1',
    },
    payments: [] as Array<Record<string, unknown>>,
  };

  const client = {
    from: vi.fn((table: string) => {
      switch (table) {
        case 'customers':
          return resultQuery(() => ({ data: [{ id: 'customer-1', name: 'Customer' }], error: null }));
        case 'orders':
          return resultQuery(() => ({ data: [state.order], error: null }));
        case 'order_items':
          return resultQuery(() => ({ data: [state.item], error: null }));
        case 'fleet':
          return resultQuery(() => ({ data: { model_id: 'beat', name: 'Honda Beat' }, error: null }));
        case 'order_addons':
          return resultQuery(() => ({ data: options?.addons ?? [], error: null }));
        case 'payments':
          return resultQuery(() => ({ data: state.payments, error: null }));
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    }),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe('confirm_extend_order_atomic');
      state.item.dropoff_datetime = String(args.p_new_dropoff);
      state.item.rental_days_count = Number(args.p_new_days);
      state.order.final_total += Number(args.p_total_delta);
      state.order.balance_due += Number(args.p_total_delta);
      state.payments.push({
        id: args.p_payment_id,
        order_id: args.p_order_id,
        raw_order_id: null,
        order_item_id: args.p_order_item_id_fk,
        amount: args.p_amount,
        payment_type: 'extension',
        settlement_status: args.p_settlement_status,
      });
      return { data: { success: true }, error: null };
    }),
  };

  return { client, state };
}

describe('active booking extension resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.computeQuote.mockResolvedValue({ rentalSubtotal: 1000 });
    mocks.checkAvailability.mockResolvedValue([{ modelId: 'beat', availableCount: 1 }]);
    mocks.resolveStoreAccounts.mockResolvedValue(null);
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.sendTelegramAlert.mockResolvedValue(undefined);
  });

  it('updates the active item and totals and creates one pending payment linked to the active order', async () => {
    const { client, state } = activeBookingClient();
    mocks.getSupabaseClient.mockReturnValue(client);

    const result = await resolveExtensionForActive({
      orderReference: 'LR-0720-2C2D',
      trimmedEmail: 'customer@example.com',
      newDropoffDatetime: '2026-07-24T11:15:00+08:00',
      overrideDailyRate: undefined,
      isPaid: false,
      paymentMethodId: 'pending',
      emailErrorLabel: '[test]',
      deps: {
        bookingPort: {},
        configRepo: {
          getLocations: async () => [{ id: 1, deliveryCost: 0, collectionCost: 0 }],
        },
      },
    });

    expect(result).toMatchObject({
      kind: 'success',
      extensionDays: 2,
      extensionCost: 1000,
      outstandingBalance: 1000,
    });
    expect(state.item).toMatchObject({
      dropoff_datetime: '2026-07-24T11:15:00+08:00',
      rental_days_count: 4,
    });
    expect(state.order).toMatchObject({ final_total: 5000, balance_due: 1000 });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({
      order_id: 'order-active',
      raw_order_id: null,
      order_item_id: 'item-active',
      amount: 1000,
      payment_type: 'extension',
      settlement_status: 'pending',
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('includes recurring per-day add-ons in the pending balance and customer-facing extension total', async () => {
    const { client, state } = activeBookingClient({
      addons: [{
        id: 'addon-pom',
        addon_name: 'Peace of Mind Cover',
        addon_type: 'per_day',
        addon_price: 95,
        quantity: 2,
        total_amount: 190,
      }],
    });
    state.item.rental_rate = 465;
    mocks.computeQuote.mockResolvedValue({ rentalSubtotal: 930 });
    mocks.getSupabaseClient.mockReturnValue(client);

    const result = await resolveExtensionForActive({
      orderReference: 'LR-0720-2C2D',
      trimmedEmail: 'customer@example.com',
      newDropoffDatetime: '2026-07-24T11:15:00+08:00',
      overrideDailyRate: undefined,
      isPaid: false,
      paymentMethodId: 'pending',
      emailErrorLabel: '[test]',
      deps: {
        bookingPort: {},
        configRepo: {
          getLocations: async () => [{ id: 1, deliveryCost: 0, collectionCost: 0 }],
        },
      },
    });

    expect(result).toMatchObject({
      kind: 'success',
      extensionDays: 2,
      extensionCost: 1120,
      outstandingBalance: 1120,
    });
    expect(state.order).toMatchObject({ final_total: 5120, balance_due: 1120 });
    expect(state.payments[0]).toMatchObject({
      amount: 1120,
      payment_type: 'extension',
      settlement_status: 'pending',
    });
    expect(client.rpc).toHaveBeenCalledWith(
      'confirm_extend_order_atomic',
      expect.objectContaining({
        p_total_delta: 1120,
        p_amount: 1120,
        p_addon_updates: [{
          id: 'addon-pom',
          name: 'Peace of Mind Cover',
          delta: 190,
          new_total: 380,
        }],
      }),
    );
  });
});
