import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.client }));
vi.mock('../src/services/xendit.js', () => ({
  isXenditEnabled: () => true,
  createXenditPaymentSession: mocks.create,
  createXenditReturnState: () => 'signed-state',
  cancelXenditPaymentSession: mocks.cancel,
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
const RAW_ID = '11111111-1111-4111-8111-111111111111';

function query(result: () => unknown) {
  const builder: Record<string, unknown> = {};
  for (const name of ['select', 'eq']) builder[name] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({ data: result(), error: null }));
  builder.single = vi.fn(async () => ({ data: result(), error: null }));
  builder.update = vi.fn(() => builder);
  return builder;
}

function fixture(options: { existingSession?: Record<string, unknown> | null; activationError?: { message: string } | null } = {}) {
  const raw = {
    id: RAW_ID, store_id: 'store-lolas', status: 'unprocessed', booking_channel: 'direct',
    order_reference: 'LR-TEST', web_payment_method: 'cash', web_quote_raw: 1000,
    web_card_fee_surcharge: 0, transfer_amount: 100, charity_donation: 50,
    xendit_payment_session_id: null,
  };
  const method = { id: 'xendit', is_active: true, gateway_provider: 'xendit', surcharge_percent: 5 };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'orders_raw') return query(() => raw);
      if (table === 'payment_methods') return query(() => method);
      if (table === 'payments') {
        const paymentQuery = query(() => []);
        paymentQuery.limit = vi.fn(() => paymentQuery);
        paymentQuery.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
        return paymentQuery;
      }
      if (table === 'xendit_payment_sessions') {
        const sessionQuery = query(() => options.existingSession ?? null);
        sessionQuery.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: options.activationError ?? null })) }));
        return sessionQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async (_name: string, args: { p_expected_amount_php?: number }) => ({
      data: { amountPHP: args.p_expected_amount_php ?? 1042.5 }, error: null,
    })),
  };
  mocks.client.mockReturnValue(client);
  return { client, raw };
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

describe('staff raw-booking Xendit links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancel.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ paymentSessionId: 'ps-1', checkoutUrl: 'https://checkout.example.test/ps-1', expiresAt: '2026-10-01T00:00:00Z' });
  });

  it('previews the persisted quote with transfer and charity excluded from surcharge', async () => {
    fixture();
    const res = response();
    await handler('/raw-orders/:rawOrderId/preview')(
      { params: { rawOrderId: RAW_ID }, user: { storeIds: ['store-lolas'] } }, res, vi.fn(),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: {
      originalQuotePHP: 1000, principalPHP: 1000, surchargePHP: 42.5,
      amountPHP: 1042.5, requiresAcknowledgement: true,
    } });
  });

  it('rejects cross-store staff and requires acknowledgement before creating a link', async () => {
    const { client } = fixture();
    const forbidden = response();
    await handler('/raw-orders/sessions')(
      { body: { rawOrderId: RAW_ID, acknowledgePriceChange: true }, user: { storeIds: ['store-bass'] } }, forbidden, vi.fn(),
    );
    expect(forbidden.status).toHaveBeenCalledWith(403);
    expect(client.rpc).not.toHaveBeenCalled();

    const unacknowledged = response();
    await handler('/raw-orders/sessions')(
      { body: { rawOrderId: RAW_ID }, user: { storeIds: ['store-lolas'] } }, unacknowledged, vi.fn(),
    );
    expect(unacknowledged.status).toHaveBeenCalledWith(409);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('freezes the quote and returns a link only after local activation', async () => {
    const { client } = fixture();
    const res = response();
    const next = vi.fn();
    await handler('/raw-orders/sessions')(
      { body: { rawOrderId: RAW_ID, acknowledgePriceChange: true }, user: { storeIds: ['store-lolas'], employeeId: 'employee-1' } },
      res, next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith('create_xendit_raw_staff_session_draft', expect.objectContaining({
      p_raw_order_id: RAW_ID, p_store_id: 'store-lolas', p_expected_amount_php: 1042.5,
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amountPHP: 1042.5 }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      successReturnUrl: expect.stringContaining('/book/payment-return/LR-TEST'),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true,
      data: expect.objectContaining({ checkoutUrl: 'https://checkout.example.test/ps-1' }) }));
  });

  it('uses the walk-in draft contract for an unprocessed reservation', async () => {
    const { client, raw } = fixture();
    raw.booking_channel = 'walk_in';
    raw.transfer_amount = 0;
    raw.charity_donation = 0;
    const res = response();
    await handler('/raw-orders/sessions')(
      { body: { rawOrderId: RAW_ID, acknowledgePriceChange: true }, user: { storeIds: ['store-lolas'], employeeId: 'employee-1' } },
      res, vi.fn(),
    );
    expect(client.rpc).toHaveBeenCalledWith('create_xendit_walkin_staff_session_draft', expect.objectContaining({
      p_raw_order_id: RAW_ID, p_expected_amount_php: 1050,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('reuses an active link instead of creating a second payable session', async () => {
    const existing = { id: 'session-1', status: 'active', payment_link_url: 'https://checkout.example.test/old', expires_at: '2099-01-01T00:00:00Z', amount_php: 1042.5 };
    const { client, raw } = fixture({ existingSession: existing });
    raw.xendit_payment_session_id = 'session-1';
    const res = response();
    await handler('/raw-orders/sessions')(
      { body: { rawOrderId: RAW_ID }, user: { storeIds: ['store-lolas'] } }, res, vi.fn(),
    );
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ checkoutUrl: existing.payment_link_url }) });
  });

  it('never returns a checkout URL if local activation fails', async () => {
    const { client } = fixture({ activationError: { message: 'write failed' } });
    const res = response();
    const next = vi.fn();
    await handler('/raw-orders/sessions')(
      { body: { rawOrderId: RAW_ID, acknowledgePriceChange: true }, user: { storeIds: ['store-lolas'], employeeId: 'employee-1' } },
      res, next,
    );
    expect(res.status).not.toHaveBeenCalledWith(201);
    expect(res.json).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith('ps-1');
    expect(client.rpc).toHaveBeenCalledWith('close_xendit_session_without_payment', expect.any(Object));
    expect(next).toHaveBeenCalled();
  });
});
