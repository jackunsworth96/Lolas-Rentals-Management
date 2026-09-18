import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  onlinePayments: [] as Array<{ amount: number }>,
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: mocks.supabase,
  getSupabaseClient: () => mocks.supabase,
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { guardDirectBookingProcess } = await import('../src/routes/orders-raw.js');

function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'lt', 'gt', 'limit', 'is']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

const configRepo = {
  getVehicleModelById: vi.fn(async () => ({ id: 'model-1', name: 'Honda Beat', isActive: true, securityDeposit: 0 })),
  getLocations: vi.fn(async () => [
    { id: 1, name: "Lola's Shop", deliveryCost: 0, collectionCost: 0, locationType: null, storeId: 'lolas', isActive: true },
  ]),
  getAddons: vi.fn(async () => []),
  getModelPricing: vi.fn(async () => [{ id: 1, modelId: 'model-1', storeId: 'lolas', minDays: 1, maxDays: 10, dailyRate: 500 }]),
  getFleetStatuses: vi.fn(async () => [{ id: 'Available', name: 'Available', isRentable: true }]),
};

const rawOrder = {
  id: 'raw-1',
  status: 'unprocessed',
  booking_channel: 'direct',
  store_id: 'lolas',
  vehicle_model_id: 'model-1',
  pickup_datetime: '2026-09-20T09:15:00+08:00',
  dropoff_datetime: '2026-09-22T09:15:00+08:00',
  pickup_location_id: 1,
  dropoff_location_id: 1,
  addon_ids: [],
  rental_value_raw: 1000,
  web_quote_raw: 1000,
  web_card_fee_surcharge: 0,
  transfer_amount: 0,
  charity_donation: 0,
};

function body(rate = 500) {
  return {
    storeId: 'lolas',
    customer: { name: 'Test Customer', email: 'test@example.com', phone: null },
    vehicleAssignments: [{
      vehicleId: 'vehicle-1',
      vehicleName: 'Beat 1',
      pickupDatetime: '2026-09-20T09:15:00+08:00',
      dropoffDatetime: '2026-09-22T09:15:00+08:00',
      rentalDaysCount: 2,
      pickupLocation: "Lola's Shop",
      dropoffLocation: "Lola's Shop",
      pickupFee: 0,
      dropoffFee: 0,
      rentalRate: rate,
      discount: 0,
    }],
    addons: [],
    securityDeposit: 0,
    webQuoteRaw: 1000,
    webNotes: 'Customer note',
    receivableAccountId: '',
    incomeAccountId: '',
    paymentMethodId: null,
    depositMethodId: null,
    cardFeeSurcharge: 0,
    excludeTransferFromBalance: false,
  };
}

describe('direct booking process guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onlinePayments = [];
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'fleet') return chain({ data: { id: 'vehicle-1', model_id: 'model-1', store_id: 'lolas', status: 'Available' }, error: null });
      if (table === 'payments') return chain({ data: mocks.onlinePayments, error: null });
      if (['order_items', 'orders_raw', 'fleet_unavailability'].includes(table)) return chain({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('accepts an unchanged direct booking without an override', async () => {
    const result = await guardDirectBookingProcess({
      rawOrder: rawOrder as never,
      body: body() as never,
      employeeId: 'employee-1',
      permissions: ['can_edit_orders'],
      storeIds: ['lolas'],
      configRepo: configRepo as never,
    });

    expect(result).toEqual({
      webNotes: 'Customer note',
      bookingOverrideApplied: false,
      paymentAdjustment: { kind: 'none', amount: 0 },
    });
  });

  it('rejects changed protected terms without an override', async () => {
    await expect(guardDirectBookingProcess({
      rawOrder: rawOrder as never,
      body: body(600) as never,
      employeeId: 'employee-1',
      permissions: ['can_edit_orders'],
      storeIds: ['lolas'],
      configRepo: configRepo as never,
    })).rejects.toMatchObject({ code: 'BOOKING_TERMS_CHANGED', status: 409 });
  });

  it('records an authorized paid-booking override and reports the balance', async () => {
    mocks.onlinePayments = [{ amount: 1000 }];
    const changed = {
      ...body(600),
      bookingOverride: {
        reason: 'Customer approved a higher-rate vehicle.',
        acknowledgePaymentAdjustment: true,
      },
    };

    const result = await guardDirectBookingProcess({
      rawOrder: rawOrder as never,
      body: changed as never,
      employeeId: 'employee-1',
      permissions: ['can_edit_orders', 'can_override_booking_terms'],
      storeIds: ['lolas'],
      configRepo: configRepo as never,
    });

    expect(result.bookingOverrideApplied).toBe(true);
    expect(result.paymentAdjustment).toEqual({ kind: 'collect', amount: 200 });
    expect(result.webNotes).toContain('Customer note');
    expect(result.webNotes).toContain('Customer approved a higher-rate vehicle.');
    expect(result.webNotes).toContain('Original quote: PHP 1000.00; revised total: PHP 1200.00.');
  });
});
