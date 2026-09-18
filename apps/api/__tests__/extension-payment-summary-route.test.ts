import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  isXenditEnabled: vi.fn(() => true),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));

vi.mock('../src/services/xendit.js', () => ({
  isXenditEnabled: mocks.isXenditEnabled,
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { publicExtendRoutes } = await import('../src/routes/public-extend.js');

function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'ilike', 'in', 'eq', 'gt', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function summaryHandler() {
  const layer = (publicExtendRoutes as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void> }>;
      };
    }>;
  }).stack.find((item) => item.route?.path === '/payment-summary');
  const handler = layer?.route?.stack.at(-1)?.handle;
  if (!handler) throw new Error('Extension payment summary handler not found');
  return handler;
}

function fakeSupabase(customerFound = true) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'customers') {
        return chain({ data: customerFound ? [{ id: 'customer-1' }] : [], error: null });
      }
      if (table === 'orders') {
        return chain({
          data: { id: 'order-1', booking_token: 'LR-0909-TEST', store_id: 'store-1' },
          error: null,
        });
      }
      if (table === 'payments') {
        return chain({ data: [{ amount: 400 }, { amount: 600 }], error: null });
      }
      if (table === 'payment_methods') {
        return chain({
          data: { id: 'xendit', surcharge_percent: 5 },
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

async function invoke(body: Record<string, unknown>) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const next = vi.fn();
  await summaryHandler()({ body }, { json, status }, next);
  return { json, status, next };
}

describe('extension payment summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isXenditEnabled.mockReturnValue(true);
  });

  it('returns the server-calculated pending balance and surcharge', async () => {
    mocks.getSupabaseClient.mockReturnValue(fakeSupabase());

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'customer@example.com',
    });

    expect(response.next).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        found: true,
        orderReference: 'LR-0909-TEST',
        principalAmountPHP: 1000,
        surchargeAmountPHP: 50,
        surchargePercent: 5,
        totalAmountPHP: 1050,
        paymentAvailable: true,
        provider: 'xendit',
        message: expect.any(String),
      },
    });
  });

  it('does not disclose balances when the email is not associated with a customer', async () => {
    mocks.getSupabaseClient.mockReturnValue(fakeSupabase(false));

    const response = await invoke({
      orderReference: 'LR-0909-TEST',
      email: 'wrong@example.com',
    });

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active booking not found' },
    });
  });
});
