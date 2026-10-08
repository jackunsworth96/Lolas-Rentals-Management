import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  enabled: vi.fn(() => true),
  refund: vi.fn(),
}));
vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.client }));
vi.mock('../src/services/xendit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/xendit.js')>()),
  isXenditEnabled: mocks.enabled,
  createXenditRefund: mocks.refund,
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { publicXenditRouter, staffXenditRouter } = await import('../src/routes/xendit.js');

function handler(path: string) {
  const layer = (staffXenditRouter as unknown as { stack: Array<{
    route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: any[]) => Promise<void> }> };
  }> }).stack.find((entry) => entry.route?.path === path && entry.route.methods.post);
  if (!layer?.route) throw new Error(`Missing route ${path}`);
  return layer.route.stack.at(-1)!.handle;
}

function webhookHandler() {
  const layer = (publicXenditRouter as unknown as { stack: Array<{
    route?: { path: string; stack: Array<{ handle: (...args: any[]) => Promise<void> }> };
  }> }).stack.find((entry) => entry.route?.path === '/webhook');
  if (!layer?.route) throw new Error('Missing Xendit webhook route');
  return layer.route.stack.at(-1)!.handle;
}

function response() {
  const json = vi.fn();
  return { json, status: vi.fn(() => ({ json })) };
}

function fixture(reservationError: string | null = null) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({
    data: { id: 'order-1', store_id: 'store-lolas' }, error: null,
  }));
  const db = {
    from: vi.fn(() => query),
    rpc: vi.fn(async (name: string) => name === 'reserve_xendit_refund_atomic'
      ? reservationError
        ? { data: null, error: { message: reservationError } }
        : { data: { paymentRequestId: 'pr-1' }, error: null }
      : { data: 'pending', error: null }),
  };
  mocks.client.mockReturnValue(db);
  return db;
}

function request() {
  return {
    params: { orderId: 'order-1' },
    body: { sourcePaymentId: 'payment-1', amountPHP: 100, reason: 'Customer requested a refund' },
    user: { roleId: 'role-admin', storeIds: ['store-lolas'], employeeId: 'emp-admin' },
  };
}

describe('Phase 3 refund provider-call boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.refund.mockResolvedValue({ id: 'rf-1', status: 'PENDING' });
  });

  it.each([
    'Xendit receiving account routing is not configured',
    'Original rental income account is missing or ambiguous',
    'Deposit refund accounts are missing or unavailable',
    'Refund exceeds unallocated held deposit after pending refunds and charges',
  ])('never calls Xendit when reservation rejects: %s', async (message) => {
    const db = fixture(message);
    const res = response();
    const next = vi.fn();
    await handler('/orders/:orderId/refunds')(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status.mock.calls[0]?.[0]).toBe(409);
    expect(db.rpc).toHaveBeenCalledWith('reserve_xendit_refund_atomic', expect.objectContaining({
      p_order_id: 'order-1', p_source_payment_id: 'payment-1', p_amount_php: 100,
    }));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'REFUND_REVIEW_REQUIRED', message }),
    }));
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('calls Xendit only after a successful reservation', async () => {
    const db = fixture();
    const res = response();
    await handler('/orders/:orderId/refunds')(request(), res, vi.fn());

    expect(db.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.refund.mock.invocationCallOrder[0]);
    expect(mocks.refund).toHaveBeenCalledWith(expect.objectContaining({
      paymentRequestId: 'pr-1', amountPHP: 100,
    }));
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('rejects another store before reserving or requesting a refund', async () => {
    const db = fixture();
    const res = response();
    const req = request();
    req.user.storeIds = ['other-store'];
    await handler('/orders/:orderId/refunds')(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });
});

describe('Phase 3 refund dashboard verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('XENDIT_CALLBACK_TOKEN', 'test-callback-token');
  });

  afterEach(() => vi.unstubAllEnvs());

  const sample = (event: 'refund.succeeded' | 'refund.failed') => ({
    event,
    business_id: 'sample_business_id',
    created: '2021-12-31T04:08:38.833Z',
    data: {
      id: 'rfd-bec34fbf-5623-4994-8c51-7249fb43f0d7',
      payment_id: 'ddpy-6664d032-b92a-43ca-b0e1-6e341707abc0',
      reference_id: '239605b3-48dd-4bb2-9f4b-518c51dc9cdd',
      amount: '1500',
      currency: 'IDR',
      status: event === 'refund.succeeded' ? 'SUCCEEDED' : 'FAILED',
    },
  });

  it.each(['refund.succeeded', 'refund.failed'] as const)('acknowledges authenticated %s samples without database writes', async (event) => {
    const res = response();
    await webhookHandler()({ headers: { 'x-callback-token': 'test-callback-token' }, body: sample(event) }, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { received: true, verification: true } });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated sample', async () => {
    const res = response();
    await webhookHandler()({ headers: {}, body: sample('refund.succeeded') }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it('does not acknowledge a real-business refund with the sample currency', async () => {
    const res = response();
    await webhookHandler()({
      headers: { 'x-callback-token': 'test-callback-token' },
      body: { ...sample('refund.succeeded'), business_id: 'real-business-id' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
