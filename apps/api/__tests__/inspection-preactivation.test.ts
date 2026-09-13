import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  sendTelegramAlert: vi.fn(async () => undefined),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => mocks.supabase,
}));

vi.mock('../src/lib/telegram.js', () => ({
  sendTelegramAlert: mocks.sendTelegramAlert,
  getTelegramChatId: () => 'test-chat',
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { inspectionRoutes } = await import('../src/routes/inspections.js');

function chain(result: unknown) {
  const builder: Record<string, any> = {};
  for (const method of ['select', 'eq', 'is', 'limit', 'insert', 'update', 'delete']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function postHandler() {
  const layer = (inspectionRoutes as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (...args: any[]) => Promise<void> }>;
      };
    }>;
  }).stack.find((item) => item.route?.path === '/' && item.route.methods.post);
  const handler = layer?.route?.stack.at(-1)?.handle;
  if (!handler) throw new Error('POST /inspections handler not found');
  return handler;
}

function response() {
  const res: Record<string, any> = {};
  res.json = vi.fn(() => res);
  res.status = vi.fn(() => res);
  return res;
}

function request(body: Record<string, unknown>) {
  return {
    body,
    user: {
      storeIds: ['store-1'],
      employeeId: 'employee-1',
      username: 'Admin',
    },
    app: {
      locals: {
        deps: {
          maintenanceRepo: { deleteById: vi.fn() },
          fleetRepo: {},
        },
      },
    },
  };
}

function inspectionBody(overrides: Record<string, unknown> = {}) {
  return {
    rawOrderId: 'raw-1',
    orderReference: 'FORGED-REFERENCE',
    storeId: 'store-1',
    results: [],
    ...overrides,
  };
}

describe('pre-activation inspections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAINTENANCE_LOG_EMAIL;
    delete process.env.NOTIFICATION_EMAIL;
  });

  it('stores a pending inspection using the raw booking reference', async () => {
    const rawOrderQuery = chain({
      data: {
        id: 'raw-1',
        store_id: 'store-1',
        order_reference: 'LR-REAL',
        status: 'unprocessed',
      },
      error: null,
    });
    const duplicateQuery = chain({ data: null, error: null });
    const insertQuery = chain({ data: { id: 'inspection-1' }, error: null });
    const raceQuery = chain({ data: null, error: null });
    let inspectionCalls = 0;

    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') return rawOrderQuery;
      if (table === 'orders') return raceQuery;
      if (table === 'inspections') {
        inspectionCalls += 1;
        return inspectionCalls === 1 ? duplicateQuery : insertQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const res = response();
    const next = vi.fn();
    await postHandler()(request(inspectionBody()), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: null,
      order_reference: 'LR-REAL',
      store_id: 'store-1',
    }));
  });

  it('rejects a duplicate inspection for an unprocessed raw booking', async () => {
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') {
        return chain({
          data: {
            id: 'raw-1',
            store_id: 'store-1',
            order_reference: 'LR-REAL',
            status: 'unprocessed',
          },
          error: null,
        });
      }
      if (table === 'inspections') {
        return chain({ data: { id: 'inspection-existing' }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const res = response();
    await postHandler()(request(inspectionBody()), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'CONFLICT' }),
    }));
  });

  it('attaches directly when the raw booking was already activated', async () => {
    const insertQuery = chain({ data: { id: 'inspection-1' }, error: null });
    let orderCalls = 0;
    let inspectionCalls = 0;

    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') {
        return chain({
          data: {
            id: 'raw-1',
            store_id: 'store-1',
            order_reference: 'LR-REAL',
            status: 'processed',
          },
          error: null,
        });
      }
      if (table === 'orders') {
        orderCalls += 1;
        return chain({ data: { id: 'order-1' }, error: null });
      }
      if (table === 'inspections') {
        inspectionCalls += 1;
        return inspectionCalls === 1
          ? chain({ data: null, error: null })
          : insertQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const res = response();
    await postHandler()(request(inspectionBody()), res, vi.fn());

    expect(orderCalls).toBe(2);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: 'order-1',
      order_reference: 'LR-REAL',
    }));
  });

  it('links the inspection when activation finishes during submission', async () => {
    const duplicateQuery = chain({ data: null, error: null });
    const insertQuery = chain({ data: { id: 'inspection-1' }, error: null });
    const linkQuery = chain({ data: null, error: null });
    let inspectionCalls = 0;

    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'orders_raw') {
        return chain({
          data: {
            id: 'raw-1',
            store_id: 'store-1',
            order_reference: 'LR-REAL',
            status: 'unprocessed',
          },
          error: null,
        });
      }
      if (table === 'orders') {
        return chain({ data: { id: 'order-1' }, error: null });
      }
      if (table === 'inspections') {
        inspectionCalls += 1;
        if (inspectionCalls === 1) return duplicateQuery;
        if (inspectionCalls === 2) return insertQuery;
        return linkQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const res = response();
    await postHandler()(request(inspectionBody()), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(linkQuery.update).toHaveBeenCalledWith({ order_id: 'order-1' });
    expect(linkQuery.eq).toHaveBeenCalledWith('id', 'inspection-1');
  });

  it('rejects a raw booking from another store', async () => {
    mocks.supabase.from.mockReturnValue(chain({
      data: {
        id: 'raw-1',
        store_id: 'store-2',
        order_reference: 'LR-REAL',
        status: 'unprocessed',
      },
      error: null,
    }));

    const res = response();
    await postHandler()(request(inspectionBody()), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'FORBIDDEN' }),
    }));
  });
});
