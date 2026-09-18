import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  getXenditPaymentSession: vi.fn(),
  cancelXenditPaymentSession: vi.fn(),
  createXenditPaymentSession: vi.fn(),
  createXenditReturnState: vi.fn(() => 'signed-return-state'),
  isXenditEnabled: vi.fn(() => true),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

vi.mock('../src/services/xendit.js', () => ({
  cancelXenditPaymentSession: mocks.cancelXenditPaymentSession,
  createXenditPaymentSession: mocks.createXenditPaymentSession,
  createXenditReturnState: mocks.createXenditReturnState,
  getXenditPaymentSession: mocks.getXenditPaymentSession,
  isXenditDashboardTestWebhook: vi.fn(() => false),
  isXenditEnabled: mocks.isXenditEnabled,
  parseXenditWebhookPayload: vi.fn(),
  verifyXenditCallbackToken: vi.fn(),
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.WEB_URL = 'https://rentals.example.test';

const { publicXenditRouter } = await import('../src/routes/xendit.js');

type FakeOptions = {
  customers?: Array<{ id: string }>;
  order?: { id: string; store_id: string; booking_token: string } | null;
  existingSession?: Record<string, unknown> | null;
  draftData?: Record<string, unknown> | null;
  draftError?: { message: string } | null;
  activationError?: { message: string } | null;
  checkedCloseData?: Record<string, unknown> | null;
};

function chain(terminal: () => Promise<unknown>) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'ilike', 'in', 'eq', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(terminal);
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    terminal().then(resolve, reject);
  return builder;
}

function fakeSupabase(options: FakeOptions = {}) {
  const customers = chain(async () => ({ data: options.customers ?? [{ id: 'customer-1' }], error: null }));
  const orders = chain(async () => ({
    data: options.order === undefined
      ? { id: 'order-1', store_id: 'store-1', booking_token: 'LR-0909-TEST' }
      : options.order,
    error: null,
  }));
  const paymentMethods = chain(async () => ({
    data: {
      id: 'xendit',
      name: 'Pay online',
      is_active: true,
      surcharge_percent: 5,
      gateway_provider: 'xendit',
    },
    error: null,
  }));
  const sessions = chain(async () => ({ data: options.existingSession ?? null, error: null }));
  sessions.update = vi.fn(() => ({
    eq: vi.fn(async () => ({ data: null, error: options.activationError ?? null })),
  }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'customers') return customers;
      if (table === 'orders') return orders;
      if (table === 'payment_methods') return paymentMethods;
      if (table === 'xendit_payment_sessions') return sessions;
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async (name: string) => {
      if (name === 'create_xendit_extension_session_draft') {
        return {
          data: options.draftData ?? {
            principal_amount_php: 1000,
            surcharge_amount_php: 50,
            amount_php: 1050,
          },
          error: options.draftError ?? null,
        };
      }
      if (name === 'close_xendit_session_without_payment') return { data: null, error: null };
      if (name === 'close_xendit_session_after_provider_terminal') {
        return {
          data: options.checkedCloseData ?? {
            status: 'expired',
            closed: true,
            claimsReleased: true,
            providerSessionMatched: true,
          },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }),
  };

  return { client, sessions };
}

function extensionSessionHandler() {
  const layer = (publicXenditRouter as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void> }>;
      };
    }>;
  }).stack.find((item) => item.route?.path === '/extension-sessions');
  const handler = layer?.route?.stack.at(-1)?.handle;
  if (!handler) throw new Error('Extension session handler not found');
  return handler;
}

async function invoke(body: Record<string, unknown>) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const next = vi.fn();
  await extensionSessionHandler()({ body }, { json, status }, next);
  return { json, status, next };
}

describe('public Xendit extension sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isXenditEnabled.mockReturnValue(true);
    mocks.cancelXenditPaymentSession.mockResolvedValue(undefined);
    mocks.getXenditPaymentSession.mockResolvedValue({ status: 'ACTIVE' });
    mocks.createXenditPaymentSession.mockResolvedValue({
      paymentSessionId: 'ps-extension-1',
      checkoutUrl: 'https://checkout.xendit.test/ps-extension-1',
      expiresAt: '2026-09-09T10:00:00.000Z',
    });
  });

  it('creates checkout using only the server-calculated draft amount', async () => {
    const { client } = fakeSupabase();
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'Customer@Example.com',
      amountPHP: 1,
    });

    expect(response.next).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith('create_xendit_extension_session_draft', expect.objectContaining({
      p_order_id: 'order-1',
      p_payment_method_id: 'xendit',
    }));
    expect(mocks.createXenditPaymentSession).toHaveBeenCalledWith(expect.objectContaining({
      amountPHP: 1050,
      successReturnUrl: expect.stringContaining('/book/extend/pay?ref=LR-0909-TEST&payment=processing'),
      cancelReturnUrl: expect.stringContaining('/book/extend/pay?ref=LR-0909-TEST&payment=cancelled'),
    }));
    expect(JSON.stringify(mocks.createXenditPaymentSession.mock.calls[0])).not.toContain('customer@example.com');
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('does not disclose a booking when the email does not match', async () => {
    const { client } = fakeSupabase({ customers: [] });
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'wrong@example.com',
    });

    expect(response.status).toHaveBeenCalledWith(404);
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('rejects inactive or unknown orders without creating a checkout', async () => {
    const { client } = fakeSupabase({ order: null });
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-UNKNOWN',
      email: 'customer@example.com',
    });

    expect(response.status).toHaveBeenCalledWith(404);
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('returns unavailable before querying the database when Xendit is disabled', async () => {
    mocks.isXenditEnabled.mockReturnValue(false);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.status).toHaveBeenCalledWith(503);
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('reuses an existing live extension checkout', async () => {
    const { client } = fakeSupabase({
      existingSession: {
        id: '00000000-0000-4000-8000-000000000001',
        target_type: 'public_extension',
        status: 'active',
        payment_link_url: 'https://checkout.xendit.test/existing',
        expires_at: '2099-01-01T00:00:00.000Z',
        created_at: '2026-09-09T00:00:00.000Z',
        amount_php: 1050,
      },
    });
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        sessionId: '00000000-0000-4000-8000-000000000001',
        checkoutUrl: 'https://checkout.xendit.test/existing',
        expiresAt: '2099-01-01T00:00:00.000Z',
        amountPHP: 1050,
      },
    });
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('rejects a second request while a checkout draft is still being created', async () => {
    const { client } = fakeSupabase({
      existingSession: {
        id: '00000000-0000-4000-8000-000000000002',
        target_type: 'public_extension',
        status: 'creating',
        payment_link_url: null,
        expires_at: '2020-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
        amount_php: 1050,
      },
    });
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.status).toHaveBeenCalledWith(409);
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('returns a conflict when a reconciliation-required checkout blocks the order', async () => {
    const { client } = fakeSupabase({
      draftError: { message: 'Order already has an unresolved Xendit session' },
    });
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.status).toHaveBeenCalledWith(409);
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('releases an expired local checkout only after Xendit confirms it expired', async () => {
    const { client } = fakeSupabase({
      existingSession: {
        id: '00000000-0000-4000-8000-000000000003',
        target_type: 'public_extension',
        status: 'active',
        payment_session_id: 'ps-expired',
        payment_link_url: 'https://checkout.xendit.test/expired',
        expires_at: '2020-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
        amount_php: 1050,
      },
    });
    mocks.getSupabaseClient.mockReturnValue(client);
    mocks.getXenditPaymentSession.mockResolvedValue({ status: 'EXPIRED' });

    const response = await invoke({ orderReference: 'LR-0909-TEST', email: 'customer@example.com' });

    expect(response.next).not.toHaveBeenCalled();
    expect(mocks.getXenditPaymentSession).toHaveBeenCalledWith('ps-expired');
    expect(client.rpc).toHaveBeenCalledWith('close_xendit_session_after_provider_terminal', expect.objectContaining({
      p_status: 'expired',
      p_expected_payment_session_id: 'ps-expired',
    }));
    expect(mocks.createXenditPaymentSession).toHaveBeenCalled();
  });

  it('keeps an expired-looking checkout locked when Xendit still reports it active', async () => {
    const { client } = fakeSupabase({
      existingSession: {
        id: '00000000-0000-4000-8000-000000000004',
        target_type: 'public_extension',
        status: 'active',
        payment_session_id: 'ps-still-active',
        payment_link_url: 'https://checkout.xendit.test/still-active',
        expires_at: '2020-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
        amount_php: 1050,
      },
    });
    mocks.getSupabaseClient.mockReturnValue(client);
    mocks.getXenditPaymentSession.mockResolvedValue({ status: 'ACTIVE' });

    const response = await invoke({ orderReference: 'LR-0909-TEST', email: 'customer@example.com' });

    expect(response.status).toHaveBeenCalledWith(409);
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('keeps checkout locked when checked local closure requires reconciliation', async () => {
    const { client } = fakeSupabase({
      existingSession: {
        id: '00000000-0000-4000-8000-000000000005',
        target_type: 'public_extension',
        status: 'active',
        payment_session_id: 'ps-reconciliation',
        payment_link_url: 'https://checkout.xendit.test/reconciliation',
        expires_at: '2020-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
        amount_php: 1050,
      },
      checkedCloseData: {
        status: 'reconciliation_required',
        closed: false,
        claimsReleased: false,
        providerSessionMatched: false,
      },
    });
    mocks.getSupabaseClient.mockReturnValue(client);
    mocks.getXenditPaymentSession.mockResolvedValue({ status: 'EXPIRED' });

    const response = await invoke({ orderReference: 'LR-0909-TEST', email: 'customer@example.com' });

    expect(response.status).toHaveBeenCalledWith(409);
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });

  it('cancels the provider checkout and does not return a link when activation cannot be persisted', async () => {
    const { client } = fakeSupabase({ activationError: { message: 'database unavailable' } });
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.json).not.toHaveBeenCalled();
    expect(response.next).toHaveBeenCalled();
    expect(mocks.cancelXenditPaymentSession).toHaveBeenCalledWith('ps-extension-1');
    expect(client.rpc).toHaveBeenCalledWith('close_xendit_session_without_payment', expect.objectContaining({
      p_status: 'failed',
    }));
  });

  it('keeps the draft locked when provider cancellation cannot be confirmed', async () => {
    const { client } = fakeSupabase({ activationError: { message: 'database unavailable' } });
    mocks.getSupabaseClient.mockReturnValue(client);
    mocks.cancelXenditPaymentSession.mockRejectedValue(new Error('timeout'));

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.json).not.toHaveBeenCalled();
    expect(response.next).toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith('close_xendit_session_without_payment', expect.anything());
  });

  it('returns a conflict when no pending extension balance remains', async () => {
    const { client } = fakeSupabase({
      draftError: { message: 'No pending extension payments found' },
    });
    mocks.getSupabaseClient.mockReturnValue(client);

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NO_PENDING_EXTENSION_BALANCE',
        message: 'There is no pending extension balance for this booking',
      },
    });
    expect(mocks.createXenditPaymentSession).not.toHaveBeenCalled();
  });
});
