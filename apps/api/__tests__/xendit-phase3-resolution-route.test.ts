import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.client }));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { staffXenditRouter } = await import('../src/routes/xendit.js');

function handler(path: string) {
  const layer = (staffXenditRouter as unknown as { stack: Array<{
    route?: { path: string; stack: Array<{ handle: (...args: any[]) => Promise<void> }> };
  }> }).stack.find((entry) => entry.route?.path === path);
  if (!layer?.route) throw new Error(`Missing route ${path}`);
  return layer.route.stack.at(-1)!.handle;
}

function response() {
  const json = vi.fn();
  return { json, status: vi.fn(() => ({ json })) };
}

function client(storeId = 'store-lolas') {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: { id: 'order-1', store_id: storeId }, error: null }));
  const db = {
    from: vi.fn(() => query),
    rpc: vi.fn(async () => ({ data: { status: 'resolved', amountPHP: 400 }, error: null })),
  };
  mocks.client.mockReturnValue(db);
  return db;
}

describe('Phase 3 documented deposit charge resolution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-admin staff without querying the booking', async () => {
    const db = client();
    const res = response();
    await handler('/orders/:orderId/resolve-deposit-charge')({
      params: { orderId: 'order-1' }, body: { incomeAccountId: 'income-1' },
      user: { roleId: 'role-staff', storeIds: ['store-lolas'] },
    }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('does not expose another store or invoke the accounting RPC', async () => {
    const db = client();
    const res = response();
    await handler('/orders/:orderId/resolve-deposit-charge')({
      params: { orderId: 'order-1' }, body: { incomeAccountId: 'income-1' },
      user: { roleId: 'role-admin', storeIds: ['other-store'] },
    }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('uses the service-role RPC for an authorized administrator', async () => {
    const db = client();
    const res = response();
    await handler('/orders/:orderId/resolve-deposit-charge')({
      params: { orderId: 'order-1' }, body: { incomeAccountId: 'income-1' },
      user: { roleId: 'role-admin', storeIds: ['store-lolas'], employeeId: 'emp-admin' },
    }, res, vi.fn());
    expect(db.rpc).toHaveBeenCalledWith('resolve_xendit_cancellation_deposit_charge_atomic', {
      p_order_id: 'order-1', p_income_account_id: 'income-1', p_employee_id: 'emp-admin',
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { status: 'resolved', amountPHP: 400 } });
  });
});
