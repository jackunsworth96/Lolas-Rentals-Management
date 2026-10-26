import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), create: vi.fn(), send: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.client }));
vi.mock('../src/services/email.js', () => ({ escapeHtml: (value: string) => value, sendEmailChecked: mocks.send,
  transferBookingConfirmationHtml: vi.fn() }));
vi.mock('../src/services/xendit.js', () => ({
  isXenditEnabled: () => true, createXenditPaymentSession: mocks.create,
  createXenditReturnState: () => 'state', verifyXenditReturnState: () => true,
  cancelXenditPaymentSession: vi.fn(), getXenditPaymentSession: vi.fn(),
  isXenditDashboardTestWebhook: () => false, parseXenditWebhookPayload: vi.fn(),
  verifyXenditCallbackToken: vi.fn(),
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.WEB_URL = 'https://rentals.example.test';

const { staffXenditRouter } = await import('../src/routes/xendit.js');
const ID = 'TRF-1';

function builder(result: () => unknown) {
  const b: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'update']) b[key] = vi.fn(() => b);
  b.maybeSingle = vi.fn(async () => ({ data: result(), error: null }));
  b.then = (resolve: (value: unknown) => unknown) => resolve({ data: result(), error: null });
  return b;
}

function fixture(session: Record<string, unknown> | null = null) {
  const transfer = { id: ID, store_id: 'store-lolas', customer_name: 'Guest',
    customer_email: 'guest@example.test', total_price: 500, payment_status: 'Pending', status: 'Pending' };
  const method = { id: 'xendit', is_active: true, gateway_provider: 'xendit', surcharge_percent: 3 };
  const client = { from: vi.fn((table: string) => {
    if (table === 'transfers') return builder(() => transfer);
    if (table === 'payment_methods') return builder(() => method);
    if (table === 'xendit_payment_sessions') return builder(() => session ? [session] : []);
    throw new Error(`Unexpected table: ${table}`);
  }), rpc: vi.fn(async () => ({ data: true, error: null })) };
  mocks.client.mockReturnValue(client);
  return { client, transfer };
}

function handler(path: string, method: 'get' | 'post' = 'post') {
  const layer = (staffXenditRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: any[]) => Promise<void> }> } }> }).stack
    .find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer?.route) throw new Error(`Missing route ${path}`);
  return layer.route.stack.at(-1)!.handle;
}

function response() {
  const json = vi.fn(); const status = vi.fn(() => ({ json }));
  return { json, status };
}

describe('staff transfer Xendit links', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ paymentSessionId: 'ps-1',
    checkoutUrl: 'https://checkout.example.test/1', expiresAt: '2099-01-01T00:00:00Z' });
    mocks.send.mockResolvedValue(undefined); });

  it('rejects a cross-store creator before reserving checkout', async () => {
    const { client } = fixture(); const res = response();
    await handler('/transfers/:id/session')({ params: { id: ID }, user: { storeIds: ['other'] } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('reuses an active link without a second provider call', async () => {
    fixture({ id: 'session-1', status: 'active', payment_link_url: 'https://checkout.example.test/old',
      expires_at: '2099-01-01T00:00:00Z', amount_php: 515 });
    const res = response();
    await handler('/transfers/:id/session')({ params: { id: ID }, user: { storeIds: ['store-lolas'] } }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ checkoutUrl: 'https://checkout.example.test/old' }) });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('shows the frozen amount after a transfer has been paid', async () => {
    const { transfer } = fixture({ id: 'session-1', status: 'completed', payment_link_url: 'https://checkout.example.test/old',
      expires_at: '2099-01-01T00:00:00Z', principal_amount_php: 500, surcharge_amount_php: 15, amount_php: 515 });
    transfer.total_price = 515;
    transfer.payment_status = 'Paid';
    const res = response();
    await handler('/transfers/:id/session', 'get')({ params: { id: ID }, user: { storeIds: ['store-lolas'] } }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({
      principalPHP: 500, surchargePHP: 15, amountPHP: 515,
    }) });
  });

  it('claims an active session before accepting an explicit email', async () => {
    const { client } = fixture();
    client.from.mockImplementation((table: string) => {
      if (table === 'transfers') return builder(() => ({ id: ID, store_id: 'store-lolas', customer_name: 'Guest', customer_email: 'guest@example.test' }));
      if (table === 'xendit_payment_sessions') return builder(() => ({ id: '11111111-1111-4111-8111-111111111111', status: 'active',
        payment_link_url: 'https://checkout.example.test/1', expires_at: '2099-01-01T00:00:00Z' }));
      throw new Error(table);
    });
    const res = response();
    await handler('/transfers/:id/send-link')({ params: { id: ID }, body: { sessionId: '11111111-1111-4111-8111-111111111111' },
      user: { storeIds: ['store-lolas'] } }, res, vi.fn());
    expect(client.rpc).toHaveBeenCalledWith('claim_xendit_link_email', expect.objectContaining({ p_resend: false }));
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { accepted: true } });
  });
});
