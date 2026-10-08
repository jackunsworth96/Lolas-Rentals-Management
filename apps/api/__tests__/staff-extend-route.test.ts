import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  resolveExtensionForActive: vi.fn(),
  resolveExtensionForRaw: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));

vi.mock('../src/routes/public-extend-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/routes/public-extend-helpers.js')>();
  return {
    ...actual,
    resolveExtensionForActive: mocks.resolveExtensionForActive,
    resolveExtensionForRaw: mocks.resolveExtensionForRaw,
  };
});

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { staffExtendRoutes } = await import('../src/routes/public-extend.js');
const { calculateExtensionDiscount } = await import('../src/routes/public-extend-helpers.js');
const { StaffExtendOrderSchema } = await import('@lolas/shared');

function extensionMessageLogClient() {
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: [{ id: 'already-sent' }], error: null })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === 'extension_message_log') return query;
      if (table === 'orders') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { id: 'order-1', store_id: 'store-lolas', booking_token: 'LR-0720-2C2D',
            customer_id: 'customer-1', status: 'active' }, error: null,
        }) }) }),
      };
      if (table === 'customers') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { email: 'customer@example.com' }, error: null,
        }) }) }),
      };
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function confirmHandler() {
  const routeLayer = (staffExtendRoutes as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: unknown, res: unknown, next: (err?: unknown) => void) => Promise<void> }>;
      };
    }>;
  }).stack.find((layer) => layer.route?.path === '/confirm');

  if (!routeLayer?.route) throw new Error('Staff /confirm route not found');
  const handler = routeLayer.route.stack.at(-1)?.handle;
  if (!handler) throw new Error('Staff /confirm handler not found');
  return handler;
}

async function invokeConfirm(body: Record<string, unknown> = {}) {
  const json = vi.fn();
  const next = vi.fn();
  await confirmHandler()(
    {
      body: {
        orderId: 'order-1',
        newDropoffDatetime: '2026-07-28T11:15:00+08:00',
        paymentStatus: 'unpaid',
        ...body,
      },
      app: { locals: { deps: { bookingPort: {}, configRepo: {} } } },
      user: { storeIds: ['store-lolas'], employeeId: 'employee-1' },
    },
    { json, status: vi.fn().mockReturnThis() },
    next,
  );
  expect(next).not.toHaveBeenCalled();
  return json;
}

describe('staff extension route resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseClient.mockReturnValue(extensionMessageLogClient());
  });

  it('uses the active order when an activated booking also has a processed raw record', async () => {
    const calls: string[] = [];
    mocks.resolveExtensionForActive.mockImplementation(async () => {
      calls.push('active');
      return {
        kind: 'success',
        extensionDays: 3,
        extensionCost: 2675,
        outstandingBalance: 2675,
        newDropoffDatetime: '2026-07-28T11:15:00+08:00',
      };
    });
    mocks.resolveExtensionForRaw.mockImplementation(async () => {
      calls.push('raw');
      return {
        kind: 'success',
        extensionDays: 3,
        extensionCost: 9999,
        outstandingBalance: 9999,
        newDropoffDatetime: '2026-07-28T11:15:00+08:00',
      };
    });

    const json = await invokeConfirm();

    expect(calls).toEqual(['active']);
    expect(mocks.resolveExtensionForRaw).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        newDropoffDatetime: '2026-07-28T11:15:00+08:00',
        extensionCost: 2675,
        extensionDays: 3,
      },
    });
  });

  it('does not extend a raw booking when the active order cannot be resolved', async () => {
    const calls: string[] = [];
    mocks.resolveExtensionForActive.mockImplementation(async () => {
      calls.push('active');
      return { kind: 'not_found' };
    });
    mocks.resolveExtensionForRaw.mockImplementation(async () => {
      calls.push('raw');
      return {
        kind: 'success',
        extensionDays: 3,
        extensionCost: 2675,
        outstandingBalance: 2675,
        newDropoffDatetime: '2026-07-28T11:15:00+08:00',
      };
    });

    const json = await invokeConfirm();

    expect(calls).toEqual(['active']);
    expect(mocks.resolveExtensionForRaw).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('passes a staff discount to the extension resolver', async () => {
    mocks.resolveExtensionForActive.mockResolvedValue({ kind: 'not_found' });
    mocks.resolveExtensionForRaw.mockResolvedValue({ kind: 'not_found' });

    await invokeConfirm({ discountType: 'percentage', discountValue: 15 });

    expect(mocks.resolveExtensionForActive).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-1',
      discountType: 'percentage',
      discountValue: 15,
    }));
    expect(mocks.resolveExtensionForRaw).not.toHaveBeenCalled();
  });
});

describe('extension discount calculation', () => {
  it('calculates percentage discounts to currency precision', () => {
    expect(calculateExtensionDiscount(1120, 'percentage', 15)).toBe(168);
    expect(calculateExtensionDiscount(999.99, 'percentage', 10)).toBe(100);
  });

  it('caps percentage and fixed discounts at the extension subtotal', () => {
    expect(calculateExtensionDiscount(500, 'percentage', 100)).toBe(500);
    expect(calculateExtensionDiscount(500, 'fixed', 750)).toBe(500);
  });

  it('does not discount without a complete positive discount', () => {
    expect(calculateExtensionDiscount(500, undefined, 10)).toBe(0);
    expect(calculateExtensionDiscount(500, 'fixed', 0)).toBe(0);
  });

  it('validates complete staff discounts and caps percentages at 100', () => {
    const base = {
      orderId: 'order-1',
      newDropoffDatetime: '2026-07-28T11:15:00+08:00',
    };
    expect(StaffExtendOrderSchema.safeParse({
      ...base,
      discountType: 'fixed',
      discountValue: 250,
    }).success).toBe(true);
    expect(StaffExtendOrderSchema.safeParse({ ...base, discountType: 'fixed' }).success).toBe(false);
    expect(StaffExtendOrderSchema.safeParse({
      ...base,
      discountType: 'percentage',
      discountValue: 101,
    }).success).toBe(false);
  });
});
