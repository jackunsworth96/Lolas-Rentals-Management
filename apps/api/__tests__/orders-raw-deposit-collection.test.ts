import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  processRawOrder: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({ supabase: mocks.supabase }));
vi.mock('../src/use-cases/orders/process-raw-order.js', () => ({ processRawOrder: mocks.processRawOrder }));
vi.mock('../src/lib/xendit-session-lock.js', () => ({
  findLiveXenditSessionForRawOrder: vi.fn(async () => null),
  paymentInProgressError: vi.fn(),
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { ordersRawRoutes } = await import('../src/routes/orders-raw.js');

const rawOrder = {
  id: 'raw-1', status: 'unprocessed', booking_channel: 'woocommerce',
  store_id: 'store-lolas', transfer_type: null,
};
const accounts: Record<string, Record<string, unknown>> = {
  'deposit-routed': { id: 'deposit-routed', store_id: 'store-lolas', account_type: 'Asset', is_active: true },
  'deposit-manual': { id: 'deposit-manual', store_id: 'store-lolas', account_type: 'Asset', is_active: true },
  liability: { id: 'liability', store_id: 'company', account_type: 'Liability', is_active: true },
};

function chain(result: () => unknown) {
  let id: string | null = null;
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn((column: string, value: string) => {
    if (column === 'id') id = value;
    return query;
  });
  query.single = vi.fn(async () => ({ data: result(), error: null }));
  query.maybeSingle = vi.fn(async () => ({ data: result(), error: null }));
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: result(), error: null });
  return { query, selectedId: () => id };
}

function setup(method: Record<string, unknown> = {
  id: 'cash', name: 'Cash', is_active: true, is_deposit_eligible: true, gateway_provider: null,
}, routedAccountId: string | null = 'deposit-routed') {
  mocks.supabase.from.mockImplementation((table: string) => {
    if (table === 'orders_raw') return chain(() => rawOrder).query;
    if (table === 'payment_routing_rules') return chain(() => routedAccountId ? { received_into_account_id: routedAccountId } : null).query;
    if (table === 'payment_methods') return chain(() => method).query;
    if (table === 'chart_of_accounts') {
      const builder = chain(() => accounts[builder.selectedId() ?? ''] ?? null);
      return builder.query;
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    storeId: 'store-lolas',
    customer: { name: 'Test Guest', email: null, phone: null },
    vehicleAssignments: [{
      vehicleId: 'vehicle-1', vehicleName: 'Honda Beat',
      pickupDatetime: '2026-10-05T01:00:00Z', dropoffDatetime: '2026-10-06T01:00:00Z',
      rentalDaysCount: 1, pickupLocation: 'Shop', dropoffLocation: 'Shop',
      pickupFee: 0, dropoffFee: 0, rentalRate: 500, discount: 0,
    }],
    addons: [], securityDeposit: 1000, webQuoteRaw: null, webNotes: null,
    receivableAccountId: '', incomeAccountId: '', paymentMethodId: null,
    depositMethodId: 'cash', paymentAccountId: 'rental-account',
    depositReceivingAccountId: 'deposit-manual', depositLiabilityAccountId: 'liability',
    cardFeeSurcharge: 0, ...overrides,
  };
}

function processHandler() {
  const layer = (ordersRawRoutes as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: any[]) => Promise<void> }> } }>;
  }).stack.find((entry) => entry.route?.path === '/:id/process' && entry.route.methods.post);
  if (!layer?.route) throw new Error('Process route not found');
  return layer.route.stack.at(-1)!.handle;
}

async function submit(requestBody: Record<string, unknown>) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const next = vi.fn();
  await processHandler()({
    params: { id: rawOrder.id }, body: requestBody,
    user: { storeIds: ['store-lolas'], employeeId: 'employee-1', permissions: [] },
    app: { locals: { deps: {} } },
  }, { status, json }, next);
  return { status, json, next };
}

describe('raw-order deposit collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
    mocks.processRawOrder.mockResolvedValue({ order: { id: 'order-1' }, alreadyProcessed: true });
  });

  it('defaults to an uncollected deposit even if old clients send method and account fields', async () => {
    const result = await submit(body());
    expect(result.next).not.toHaveBeenCalled();
    expect(mocks.processRawOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      depositCollected: false, depositMethodId: null, depositReceivingAccountId: null,
    }));
    expect(mocks.supabase.from).not.toHaveBeenCalledWith('payment_methods');
  });

  it('uses deposit-method routing, not the rental receiving account, when collection is confirmed', async () => {
    const result = await submit(body({ depositCollected: true }));
    expect(result.next).not.toHaveBeenCalled();
    expect(mocks.processRawOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      depositCollected: true, depositMethodId: 'cash',
      depositReceivingAccountId: 'deposit-routed', paymentAccountId: 'rental-account',
      depositLiabilityAccountId: 'liability',
    }));
  });

  it('uses the selected deposit account when no routing rule exists', async () => {
    setup(undefined, null);
    const result = await submit(body({ depositCollected: true }));
    expect(result.next).not.toHaveBeenCalled();
    expect(mocks.processRawOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      depositReceivingAccountId: 'deposit-manual',
    }));
  });

  it('rejects an online deposit method before activation', async () => {
    setup({ id: 'xendit', name: 'Card Payment', is_active: true, is_deposit_eligible: true, gateway_provider: 'xendit' });
    const result = await submit(body({ depositCollected: true, depositMethodId: 'xendit' }));
    expect(result.status).toHaveBeenCalledWith(400);
    expect(mocks.processRawOrder).not.toHaveBeenCalled();
  });

  it('rejects invalid liability accounts before activation', async () => {
    const result = await submit(body({ depositCollected: true, depositLiabilityAccountId: 'deposit-manual' }));
    expect(result.status).toHaveBeenCalledWith(400);
    expect(mocks.processRawOrder).not.toHaveBeenCalled();
  });
});
