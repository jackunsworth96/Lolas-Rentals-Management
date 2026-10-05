import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), create: vi.fn(), cancel: vi.fn(), enabled: vi.fn(() => true) }));
vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.client }));
vi.mock('../src/services/xendit.js', () => ({
  isXenditEnabled: mocks.enabled,
  createXenditPaymentSession: mocks.create,
  cancelXenditPaymentSession: mocks.cancel,
  createXenditReturnState: () => 'signed-state',
  getXenditPaymentSession: vi.fn(),
  isXenditDashboardTestWebhook: () => false,
  parseXenditWebhookPayload: vi.fn(),
  verifyXenditCallbackToken: vi.fn(),
  verifyXenditReturnState: vi.fn(),
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.WEB_URL = 'https://rentals.example.test';

const { staffXenditRouter } = await import('../src/routes/xendit.js');

function builder(data: unknown) {
  const query: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'in', 'limit', 'update']) query[name] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data, error: null }));
  query.single = vi.fn(async () => ({ data, error: null }));
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null });
  return query;
}

function fixture(methodActive = true) {
  const order = { id: 'order-1', store_id: 'store-lolas', booking_token: 'LR-TEST', status: 'active', balance_due: 1000, payment_method_id: 'xendit' };
  const method = { id: 'xendit', is_active: methodActive, gateway_provider: 'xendit', surcharge_percent: 5 };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'orders') return builder(order);
      if (table === 'payment_methods') return builder(method);
      if (table === 'payments') return builder([]);
      if (table === 'xendit_payment_sessions') return builder(null);
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: { principalPHP: 1000, surchargePHP: 50, amountPHP: 1050 }, error: null })),
  };
  mocks.client.mockReturnValue(client);
  return client;
}

function handler(path: string) {
  const layer = (staffXenditRouter as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: (...args: any[]) => Promise<void> }> } }> }).stack
    .find((entry) => entry.route?.path === path);
  if (!layer?.route) throw new Error(`Missing route ${path}`);
  return layer.route.stack.at(-1)!.handle;
}

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { json, status };
}

describe('Phase 2 staff Xendit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.create.mockResolvedValue({ paymentSessionId: 'ps-1', checkoutUrl: 'https://checkout.example.test/ps-1', expiresAt: '2099-01-01T00:00:00Z' });
    mocks.cancel.mockResolvedValue(undefined);
  });

  it('rejects cross-store add-on creation before calling the atomic RPC', async () => {
    const client = fixture();
    const res = response();
    await handler('/orders/:orderId/online-addons')({
      params: { orderId: 'order-1' }, body: { addons: [{ id: 1, quantity: 2 }] },
      user: { storeIds: ['store-other'] },
    }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('creates linked online add-ons without a browser amount', async () => {
    const client = fixture();
    const res = response();
    await handler('/orders/:orderId/online-addons')({
      params: { orderId: 'order-1' }, body: { addons: [{ id: 1, quantity: 2 }] },
      user: { storeIds: ['store-lolas'] },
    }, res, vi.fn());
    expect(client.rpc).toHaveBeenCalledWith('create_online_addons_atomic', {
      p_order_id: 'order-1', p_store_id: 'store-lolas', p_addons: [{ id: 1, quantity: 2 }],
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('does not create add-on IOUs while Xendit is disabled', async () => {
    const client = fixture();
    mocks.enabled.mockReturnValue(false);
    const res = response();
    await handler('/orders/:orderId/online-addons')({
      params: { orderId: 'order-1' }, body: { addons: [{ id: 1, quantity: 2 }] },
      user: { storeIds: ['store-lolas'] },
    }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'XENDIT_DISABLED' }),
    }));
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('does not create add-on IOUs with an inactive Xendit method', async () => {
    const client = fixture(false);
    const res = response();
    await handler('/orders/:orderId/online-addons')({
      params: { orderId: 'order-1' }, body: { addons: [{ id: 1, quantity: 2 }] },
      user: { storeIds: ['store-lolas'] },
    }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'PAYMENT_METHOD_UNAVAILABLE' }),
    }));
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('freezes a full rental balance and returns a link only after activation', async () => {
    const client = fixture();
    const res = response();
    const next = vi.fn();
    await handler('/orders/:orderId/rental-session')({
      params: { orderId: 'order-1' }, body: { principalAmountPHP: 1 },
      user: { storeIds: ['store-lolas'], employeeId: 'employee-1' },
    }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith('create_xendit_full_rental_session_draft', expect.objectContaining({
      p_order_id: 'order-1', p_store_id: 'store-lolas',
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      amountPHP: 1050,
      successReturnUrl: expect.stringContaining('/book/payment-return/LR-TEST'),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('does not reveal a staff checkout status across stores', async () => {
    const session = { status: 'completed', store_id: 'store-lolas' };
    mocks.client.mockReturnValue({ from: vi.fn(() => builder(session)) });
    const res = response();
    await handler('/sessions/:id/status')({
      params: { id: '1b273c8a-0ed6-4329-89fe-c0788bc2dcb5' },
      user: { storeIds: ['store-other'] },
    }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false, error: expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    }));
  });

  it('returns only the confirmed local state to same-store staff', async () => {
    mocks.client.mockReturnValue({ from: vi.fn(() => builder({ status: 'completed', store_id: 'store-lolas' })) });
    const res = response();
    await handler('/sessions/:id/status')({
      params: { id: '1b273c8a-0ed6-4329-89fe-c0788bc2dcb5' },
      user: { storeIds: ['store-lolas'] },
    }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { status: 'completed' } });
  });
});
