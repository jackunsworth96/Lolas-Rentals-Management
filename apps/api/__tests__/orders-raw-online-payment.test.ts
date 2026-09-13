import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: mocks.supabase,
  getSupabaseClient: () => mocks.supabase,
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { ordersRawRoutes } = await import('../src/routes/orders-raw.js');

function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'eq', 'range', 'in']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function routeHandler(path: string, method: 'get' | 'post' | 'patch') {
  const layer = (ordersRawRoutes as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (...args: any[]) => Promise<void> }>;
      };
    }>;
  }).stack.find((item) => item.route?.path === path && item.route.methods[method]);
  const handler = layer?.route?.stack.at(-1)?.handle;
  if (!handler) throw new Error(`${method.toUpperCase()} ${path} handler not found`);
  return handler;
}

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { json, status };
}

describe('orders-raw online payment state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds webhook-confirmed Xendit payment details to the inbox response', async () => {
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') {
        return chain({
          data: [{ id: 'raw-1', order_reference: 'LR-TEST', status: 'unprocessed', store_id: 'store-lolas' }],
          error: null,
          count: 1,
        });
      }
      if (table === 'payments') {
        return chain({
          data: [{
            raw_order_id: 'raw-1',
            amount: 1795,
            settlement_ref: 'xendit-payment-1',
            created_at: '2026-09-10T01:00:00.000Z',
          }],
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const res = response();
    const next = vi.fn();
    await routeHandler('/', 'get')(
      { query: {}, user: { permissions: ['can_view_inbox'], storeIds: ['store-lolas'] } },
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        data: [expect.objectContaining({
          id: 'raw-1',
          online_payment: {
            status: 'paid',
            amount: 1795,
            reference: 'xendit-payment-1',
            paidAt: '2026-09-10T01:00:00.000Z',
          },
        })],
      }),
    }));
  });

  it('returns no online payment summary when no Xendit payment exists', async () => {
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') {
        return chain({ data: { id: 'raw-1', status: 'unprocessed', store_id: 'store-lolas' }, error: null });
      }
      if (table === 'payments') return chain({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    const res = response();
    await routeHandler('/:id', 'get')(
      { params: { id: 'raw-1' }, user: { permissions: ['can_view_inbox'], storeIds: ['store-lolas'] } },
      res,
      vi.fn(),
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ id: 'raw-1', online_payment: null }),
    });
  });

  it('rejects manual collection after a confirmed Xendit payment', async () => {
    mocks.supabase.from.mockReturnValue(chain({
      data: { id: 'raw-1', source: 'lolas', status: 'unprocessed', store_id: 'store-lolas' },
      error: null,
    }));
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'xendit_payment_session_orders') return chain({ data: null, error: null });
      return chain({
        data: { id: 'raw-1', source: 'lolas', status: 'unprocessed', store_id: 'store-lolas' },
        error: null,
      });
    });
    const paymentRepo = {
      findByRawOrderId: vi.fn(async () => [{ paymentType: 'card_xendit' }]),
      save: vi.fn(),
    };
    const cardSettlementRepo = { save: vi.fn() };
    const res = response();

    await routeHandler('/:id/collect-payment', 'post')(
      {
        params: { id: 'raw-1' },
        body: { amount: 100, paymentMethodId: 'cash' },
        app: { locals: { deps: { paymentRepo, cardSettlementRepo } } },
        user: { permissions: ['can_edit_orders'], storeIds: ['store-lolas'] },
      },
      res,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'ONLINE_PAYMENT_ALREADY_CONFIRMED',
        message: 'This booking has already been paid online',
      },
    });
    expect(paymentRepo.save).not.toHaveBeenCalled();
    expect(cardSettlementRepo.save).not.toHaveBeenCalled();
  });

  it('does not expose another store through the raw-order inbox', async () => {
    const ordersQuery = chain({ data: [], error: null, count: 0 });
    mocks.supabase.from.mockReturnValue(ordersQuery);

    const res = response();
    await routeHandler('/', 'get')(
      { query: { store: 'bass' }, user: { permissions: ['can_view_inbox'], storeIds: ['store-lolas'] } },
      res,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this booking.' },
    });
    expect(ordersQuery.eq).not.toHaveBeenCalledWith('source', 'bass');
    expect(ordersQuery.in).not.toHaveBeenCalled();
  });

  it('scopes inbox records to the assigned store and allows company access to all stores', async () => {
    const employeeQuery = chain({ data: [], error: null, count: 0 });
    mocks.supabase.from.mockReturnValue(employeeQuery);

    await routeHandler('/', 'get')(
      { query: {}, user: { permissions: ['can_view_inbox'], storeIds: ['store-lolas'] } },
      response(),
      vi.fn(),
    );
    expect(employeeQuery.in).toHaveBeenCalledWith('store_id', ['store-lolas']);

    const companyQuery = chain({ data: [], error: null, count: 0 });
    mocks.supabase.from.mockReturnValue(companyQuery);
    await routeHandler('/', 'get')(
      { query: {}, user: { permissions: ['can_view_inbox'], storeIds: ['company'] } },
      response(),
      vi.fn(),
    );
    expect(companyQuery.in).not.toHaveBeenCalled();
  });

  it('rejects cross-store detail and payment-collection requests before revealing payment data', async () => {
    mocks.supabase.from.mockReturnValue(chain({
      data: { id: 'raw-other', source: 'bass', status: 'unprocessed', store_id: 'store-bass' },
      error: null,
    }));

    const detailResponse = response();
    await routeHandler('/:id', 'get')(
      { params: { id: 'raw-other' }, user: { permissions: ['can_view_inbox'], storeIds: ['store-lolas'] } },
      detailResponse,
      vi.fn(),
    );
    expect(detailResponse.status).toHaveBeenCalledWith(403);
    expect(mocks.supabase.from).toHaveBeenCalledTimes(1);

    const paymentRepo = { findByRawOrderId: vi.fn(), save: vi.fn() };
    const collectionResponse = response();
    await routeHandler('/:id/collect-payment', 'post')(
      {
        params: { id: 'raw-other' },
        body: { amount: 100, paymentMethodId: 'cash' },
        app: { locals: { deps: { paymentRepo, cardSettlementRepo: { save: vi.fn() } } } },
        user: { permissions: ['can_edit_orders'], storeIds: ['store-lolas'] },
      },
      collectionResponse,
      vi.fn(),
    );
    expect(collectionResponse.status).toHaveBeenCalledWith(403);
    expect(paymentRepo.findByRawOrderId).not.toHaveBeenCalled();
  });

  it('allows company users to inspect bookings from any store', async () => {
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') {
        return chain({ data: { id: 'raw-other', status: 'unprocessed', store_id: 'store-bass' }, error: null });
      }
      if (table === 'payments') return chain({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    const res = response();
    await routeHandler('/:id', 'get')(
      { params: { id: 'raw-other' }, user: { permissions: ['can_view_inbox'], storeIds: ['company'] } },
      res,
      vi.fn(),
    );

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects cross-store processing and cancellation before either mutation runs', async () => {
    mocks.supabase.from.mockReturnValue(chain({
      data: {
        id: 'raw-other',
        status: 'unprocessed',
        booking_channel: 'direct',
        store_id: 'store-bass',
      },
      error: null,
    }));

    const processResponse = response();
    await routeHandler('/:id/process', 'post')(
      {
        params: { id: 'raw-other' },
        body: {
          storeId: 'store-lolas',
          customer: { name: 'Customer', email: 'customer@example.com', phone: null },
          vehicleAssignments: [{
            vehicleId: 'vehicle-1', vehicleName: 'Vehicle',
            pickupDatetime: '2026-09-20T09:00:00.000Z', dropoffDatetime: '2026-09-21T09:00:00.000Z',
            rentalDaysCount: 1, pickupLocation: 'Shop', dropoffLocation: 'Shop',
            pickupFee: 0, dropoffFee: 0, rentalRate: 500,
          }],
          addons: [], securityDeposit: 0, webQuoteRaw: null, webNotes: null,
        },
        app: { locals: { deps: {} } },
        user: { employeeId: 'employee-1', permissions: ['can_edit_orders'], storeIds: ['store-lolas'] },
      },
      processResponse,
      vi.fn(),
    );
    expect(processResponse.status).toHaveBeenCalledWith(403);

    const cancelResponse = response();
    await routeHandler('/:id/cancel', 'patch')(
      {
        params: { id: 'raw-other' },
        body: { reason: 'Customer requested cancellation' },
        user: { permissions: ['can_cancel_orders'], storeIds: ['store-lolas'] },
      },
      cancelResponse,
      vi.fn(),
    );
    expect(cancelResponse.status).toHaveBeenCalledWith(403);
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });
});
