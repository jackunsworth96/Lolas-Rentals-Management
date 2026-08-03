import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.RESPOND_IO_API_KEY = 'respond-test-key';

const { app } = await import('../src/server.js');

function queryResult<T>(result: T) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    in: vi.fn(async () => result),
    limit: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return query;
}

function makeSupabaseForHandoff() {
  const locationRows = [
    {
      id: 1,
      name: 'Lola Shop',
      delivery_cost: 100,
      collection_cost: 0,
      location_type: 'shop',
    },
    {
      id: 2,
      name: 'General Luna',
      delivery_cost: 0,
      collection_cost: 150,
      location_type: 'delivery',
    },
  ];

  function locationQuery() {
    let selectedId: number | null = null;
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === 'id') selectedId = Number(value);
        return query;
      }),
      or: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: locationRows.find((row) => row.id === selectedId) ?? null,
        error: null,
      })),
    };
    return query;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'vehicle_models') {
        return queryResult({
          data: { id: 'beat', name: 'Honda Beat', security_deposit: 1000 },
          error: null,
        });
      }
      if (table === 'locations') {
        return locationQuery();
      }
      if (table === 'booking_sessions') {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}

function makeSupabaseForOrderLookup() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'orders_raw') {
        return queryResult({
          data: [
            {
              id: 'raw-1',
              order_reference: 'LR-1234-ABCD',
              customer_email: 'customer@example.com',
              customer_name: 'Customer Example',
              vehicle_model_id: 'beat',
              pickup_datetime: '2026-06-20T09:15:00+08:00',
              dropoff_datetime: '2026-06-23T09:15:00+08:00',
              pickup_location_id: 1,
              dropoff_location_id: 2,
              addon_ids: [11],
              transfer_type: null,
              flight_number: null,
              transfer_route: null,
              charity_donation: 0,
              booking_channel: 'direct',
              store_id: 'store-lolas',
              status: 'unprocessed',
            },
          ],
          error: null,
        });
      }
      if (table === 'vehicle_models') {
        return queryResult({ data: { name: 'Honda Beat' }, error: null });
      }
      if (table === 'addons') {
        return queryResult({ data: [{ name: 'Peace of Mind Cover' }], error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function makeSupabaseForInternationalPhoneExtension() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'customers') {
        let lookup: 'exact' | 'suffix' = 'exact';
        const query = {
          select: vi.fn(() => query),
          in: vi.fn(() => {
            lookup = 'exact';
            return query;
          }),
          ilike: vi.fn(() => {
            lookup = 'suffix';
            return query;
          }),
          limit: vi.fn(async () => ({
            data: lookup === 'suffix'
              ? [{
                  id: 'customer-phoebe',
                  name: 'Phoebe Delafaille',
                  email: 'phoebe@example.com',
                  mobile: '499430527',
                }]
              : [],
            error: null,
          })),
        };
        return query;
      }
      if (table === 'orders') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(async () => ({
            data: [{
              id: 'order-phoebe',
              booking_token: 'LR-0730-PHOE',
              status: 'active',
              store_id: 'store-lolas',
              customer_id: 'customer-phoebe',
              created_at: '2026-07-29T02:00:00Z',
            }],
            error: null,
          })),
        };
        return query;
      }
      if (table === 'order_items') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          not: vi.fn(() => query),
          order: vi.fn(async () => ({
            data: [{
              id: 'item-phoebe',
              vehicle_id: 'vehicle-phoebe',
              pickup_datetime: '2026-07-29T11:15:00+08:00',
              dropoff_datetime: '2026-07-31T11:15:00+08:00',
              store_id: 'store-lolas',
              rental_days_count: 2,
              rental_rate: 535,
              vehicle_name: 'Honda Beat',
              vehicle_model_id: 'beat',
            }],
            error: null,
          })),
        };
        return query;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function makeSupabaseForFutureDeliveryLookup() {
  const locations = new Map([
    [1, { name: 'Lola Shop', location_type: 'store' }],
    [2, { name: 'General Luna', location_type: 'delivery' }],
  ]);

  return {
    from: vi.fn((table: string) => {
      if (table === 'customers') {
        let byId = false;
        const query = {
          select: vi.fn(() => query),
          in: vi.fn(() => query),
          ilike: vi.fn(() => query),
          eq: vi.fn(() => {
            byId = true;
            return query;
          }),
          limit: vi.fn(async () => ({
            data: [{ id: 'customer-joris' }],
            error: null,
          })),
          maybeSingle: vi.fn(async () => ({
            data: byId
              ? { id: 'customer-joris', name: 'Joris', email: 'joris@example.com', mobile: '+447597124073' }
              : null,
            error: null,
          })),
        };
        return query;
      }
      if (table === 'orders') {
        const query = {
          select: vi.fn(() => query),
          in: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(async () => ({
            data: [{
              id: 'order-joris',
              booking_token: 'LR-0801-JORIS',
              status: 'confirmed',
              store_id: 'store-lolas',
              customer_id: 'customer-joris',
              created_at: '2026-07-30T00:00:00Z',
              balance_due: 0,
              final_total: 7200,
              security_deposit: 6000,
              deposit_status: 'pending',
            }],
            error: null,
          })),
        };
        return query;
      }
      if (table === 'order_items') {
        const items = [1, 2].map((number) => ({
          pickup_datetime: '2026-08-03T10:15:00+08:00',
          dropoff_datetime: '2026-08-06T10:15:00+08:00',
          vehicle_name: `TukTuk ${number}`,
          vehicle_model_id: 'tuktuk',
          pickup_location: 'General Luna',
          dropoff_location: 'Lola Shop',
          pickup_location_id: '2',
          dropoff_location_id: '1',
          pickup_fee: 100,
          dropoff_fee: 0,
        }));
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(async () => ({ data: items, error: null })),
        };
        return query;
      }
      if (table === 'locations') {
        let id = 0;
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((_column: string, value: unknown) => {
            id = Number(value);
            return query;
          }),
          maybeSingle: vi.fn(async () => ({ data: locations.get(id) ?? null, error: null })),
        };
        return query;
      }
      if (table === 'stores') {
        return queryResult({ data: { name: "Lola's Rentals" }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function makeSupabaseForMultiVehicleExtension() {
  const items = [1, 2, 3].map((number) => ({
    id: `item-${number}`,
    vehicle_id: `vehicle-${number}`,
    pickup_datetime: '2026-07-17T10:00:00+08:00',
    dropoff_datetime: '2026-07-20T10:00:00+08:00',
    store_id: 'store-lolas',
    rental_rate: 535,
    vehicle_name: `Honda Beat ${number}`,
    vehicle_model_id: 'beat',
  }));

  return {
    from: vi.fn((table: string) => {
      if (table === 'orders') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(async () => ({
            data: [{
              id: 'order-1',
              booking_token: 'LR-0722-TEST',
              status: 'active',
              store_id: 'store-lolas',
              customer_id: 'customer-1',
              created_at: '2026-07-17T00:00:00Z',
            }],
            error: null,
          })),
        };
        return query;
      }
      if (table === 'customers') {
        return queryResult({
          data: {
            id: 'customer-1',
            name: 'Jaap Groenendijk',
            email: 'jaap@example.com',
            mobile: '+31624640254',
          },
          error: null,
        });
      }
      if (table === 'order_items') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          not: vi.fn(() => query),
          order: vi.fn(async () => ({ data: items, error: null })),
        };
        return query;
      }
      if (table === 'fleet') {
        return queryResult({ data: { model_id: 'beat', name: 'Honda Beat' }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function makeSupabaseForSingleVehicleExtensionWithPom(securityDeposit = 2000) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'orders') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(async () => ({
            data: [{
              id: 'order-pom',
              booking_token: 'LR-0728-POM1',
              status: 'active',
              store_id: 'store-lolas',
              customer_id: 'customer-pom',
              created_at: '2026-07-20T00:00:00Z',
              security_deposit: securityDeposit,
            }],
            error: null,
          })),
        };
        return query;
      }
      if (table === 'customers') {
        return queryResult({
          data: {
            id: 'customer-pom',
            name: 'Indy Booth',
            email: 'indy@example.com',
            mobile: '+61439888798',
          },
          error: null,
        });
      }
      if (table === 'order_items') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          not: vi.fn(() => query),
          order: vi.fn(async () => ({
            data: [{
              id: 'item-pom',
              vehicle_id: 'vehicle-pom',
              pickup_datetime: '2026-07-20T16:45:00+08:00',
              dropoff_datetime: '2026-07-26T16:45:00+08:00',
              store_id: 'store-lolas',
              rental_days_count: 6,
              rental_rate: 465,
              vehicle_name: 'Honda Beat',
              vehicle_model_id: 'beat',
            }],
            error: null,
          })),
        };
        return query;
      }
      if (table === 'order_addons') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(async () => ({
            data: [{
              addon_name: 'Peace of Mind Cover',
              addon_type: 'per_day',
              addon_price: 95,
              total_amount: 570,
            }],
            error: null,
          })),
        };
        return query;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

const configRepo = {
  getVehicleModelById: vi.fn(async () => ({ id: 'beat', name: 'Honda Beat', securityDeposit: 1000 })),
  getVehicleModels: vi.fn(async () => [
    { id: 'beat', name: 'Honda Beat V3' },
    { id: 'tuktuk', name: 'Bajaj TukTuk' },
  ]),
  getModelPricing: vi.fn(async () => [{ minDays: 1, maxDays: 99, dailyRate: 500 }]),
  getLocations: vi.fn(async () => [
    { id: 1, name: 'Lola Shop', deliveryCost: 100, collectionCost: 0 },
    { id: 2, name: 'General Luna', deliveryCost: 0, collectionCost: 150 },
  ]),
  getAddons: vi.fn(async () => [
    {
      id: 10,
      name: 'Surf Rack',
      addonType: 'one_time',
      pricePerDay: 0,
      priceOneTime: 250,
      isActive: true,
      mutualExclusivityGroup: null,
    },
    {
      id: 11,
      name: 'Peace of Mind Cover',
      addonType: 'per_day',
      pricePerDay: 95,
      priceOneTime: 0,
      isActive: true,
      mutualExclusivityGroup: null,
    },
    {
      id: 12,
      name: 'Peace of Mind Cover (TukTuk)',
      addonType: 'per_day',
      pricePerDay: 200,
      priceOneTime: 0,
      isActive: true,
      mutualExclusivityGroup: null,
    },
  ]),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESPOND_IO_API_KEY = 'respond-test-key';
  app.locals.deps.bookingPort = {
    checkAvailability: vi.fn(async () => [{ modelId: 'beat', availableCount: 1 }]),
    insertHold: vi.fn(async (input) => ({
      id: 'hold-1',
      vehicleModelId: input.vehicleModelId,
      storeId: input.storeId,
      pickupDatetime: input.pickupDatetime,
      dropoffDatetime: input.dropoffDatetime,
      sessionToken: input.sessionToken,
      expiresAt: input.expiresAt,
    })),
  };
  app.locals.deps.configRepo = configRepo;
});

describe('Respond.io add-ons lookup', () => {
  it('returns compatible add-on IDs for a selected scooter model', async () => {
    const res = await request(app)
      .get('/api/public/respond/addons')
      .set('X-API-Key', 'respond-test-key')
      .query({ vehicleModelId: 'beat' });

    expect(res.status).toBe(200);
    expect(res.body.addons).toEqual([
      {
        id: 11,
        key: 'peace_of_mind',
        aliases: ['peace of mind', 'peace', 'pom', 'cover'],
        name: 'Peace of Mind Cover',
        price: 95,
        price_type: 'per_day',
        compatible_vehicle_model_id: 'beat',
      },
      {
        id: 10,
        key: 'surf_rack',
        aliases: ['surf rack', 'rack', 'board rack'],
        name: 'Surf Rack',
        price: 250,
        price_type: 'one_time',
        compatible_vehicle_model_id: 'beat',
      },
    ]);
  });

  it('accepts a vehicle display name with trailing spaces and returns the resolved model ID', async () => {
    configRepo.getVehicleModelById.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/public/respond/addons')
      .set('X-API-Key', 'respond-test-key')
      .query({ vehicleModelId: 'Honda Beat V3 ' });

    expect(res.status).toBe(200);
    expect(res.body.resolved_vehicle_model_id).toBe('beat');
    expect(res.body.resolved_vehicle_model_name).toBe('Honda Beat V3');
    expect(res.body.addons).toEqual([
      expect.objectContaining({
        id: 11,
        key: 'peace_of_mind',
        compatible_vehicle_model_id: 'beat',
      }),
      expect.objectContaining({
        id: 10,
        key: 'surf_rack',
        compatible_vehicle_model_id: 'beat',
      }),
    ]);
  });

  it('returns the TukTuk-specific Peace of Mind ID for a TukTuk model', async () => {
    configRepo.getVehicleModelById.mockResolvedValueOnce({
      id: 'tuktuk',
      name: 'Bajaj TukTuk',
      securityDeposit: 2000,
    });

    const res = await request(app)
      .get('/api/public/respond/addons')
      .set('X-API-Key', 'respond-test-key')
      .query({ vehicleModelId: 'tuktuk' });

    expect(res.status).toBe(200);
    expect(res.body.addons).toEqual([
      {
        id: 12,
        key: 'peace_of_mind',
        aliases: ['peace of mind', 'peace', 'pom', 'cover'],
        name: 'Peace of Mind Cover (TukTuk)',
        price: 200,
        price_type: 'per_day',
        compatible_vehicle_model_id: 'tuktuk',
      },
    ]);
  });
});

describe('Respond.io booking handoff', () => {
  it('accepts location names from Respond.io and resolves their numeric IDs', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForHandoff());

    const res = await request(app)
      .post('/api/public/respond/booking-handoff')
      .set('X-API-Key', 'respond-test-key')
      .send({
        vehicleModelId: 'Honda Beat',
        pickupDatetime: '2026-07-21T12:15:00+08:00',
        dropoffDatetime: '2026-07-26T12:15:00+08:00',
        pickupLocationId: ' General Luna ',
        dropoffLocationId: 'general luna',
        addonIds: '[]',
      });

    expect(res.status).toBe(201);
    expect(res.body.pickup.id).toBe(2);
    expect(res.body.dropoff.id).toBe(2);
    expect(res.body.quote.pickupFee).toBe(0);
    expect(res.body.quote.dropoffFee).toBe(150);
  });

  it('returns selected add-on lines and totals in the cart preview quote', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForHandoff());

    const res = await request(app)
      .post('/api/public/respond/booking-handoff')
      .set('X-API-Key', 'respond-test-key')
      .send({
        vehicleModelId: 'beat',
        pickupDatetime: '2026-06-20T09:15:00+08:00',
        dropoffDatetime: '2026-06-23T09:15:00+08:00',
        pickupLocationId: 1,
        dropoffLocationId: 2,
        addonIds: [10, 11],
      });

    expect(res.status).toBe(201);
    expect(res.body.quote.addons).toEqual([
      { id: 10, name: 'Surf Rack', type: 'one_time', unitPrice: 250, total: 250 },
      { id: 11, name: 'Peace of Mind Cover', type: 'per_day', unitPrice: 95, total: 285 },
    ]);
    expect(res.body.quote.addonsTotal).toBe(535);
    expect(res.body.quote.grandTotal).toBe(2285);
    expect(res.body.quote.securityDeposit).toBe(1000);
    expect(res.body.cartUrl).toContain('/book/basket?sessionToken=');
  });

  it('treats addonIds 0 from Respond.io as no selected add-ons', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForHandoff());

    const res = await request(app)
      .post('/api/public/respond/booking-handoff')
      .set('X-API-Key', 'respond-test-key')
      .send({
        vehicleModelId: 'beat',
        pickupDatetime: '2026-06-20T09:15:00+08:00',
        dropoffDatetime: '2026-06-23T09:15:00+08:00',
        pickupLocationId: 1,
        dropoffLocationId: 2,
        addonIds: 0,
      });

    expect(res.status).toBe(201);
    expect(res.body.quote.addons).toEqual([]);
    expect(res.body.quote.addonsTotal).toBe(0);
    expect(res.body.cartUrl).toContain('/book/basket?sessionToken=');
  });

  it('accepts a single numeric addonIds value from Respond.io', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForHandoff());

    const res = await request(app)
      .post('/api/public/respond/booking-handoff')
      .set('X-API-Key', 'respond-test-key')
      .send({
        vehicleModelId: 'beat',
        pickupDatetime: '2026-06-20T09:15:00+08:00',
        dropoffDatetime: '2026-06-23T09:15:00+08:00',
        pickupLocationId: 1,
        dropoffLocationId: 2,
        addonIds: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.quote.addons).toEqual([
      { id: 10, name: 'Surf Rack', type: 'one_time', unitPrice: 250, total: 250 },
    ]);
    expect(res.body.quote.addonsTotal).toBe(250);
  });

  it('rejects invalid selected add-ons through quote validation', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForHandoff());

    const res = await request(app)
      .post('/api/public/respond/booking-handoff')
      .set('X-API-Key', 'respond-test-key')
      .send({
        vehicleModelId: 'beat',
        pickupDatetime: '2026-06-20T09:15:00+08:00',
        dropoffDatetime: '2026-06-23T09:15:00+08:00',
        pickupLocationId: 1,
        dropoffLocationId: 2,
        addonIds: [999],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('Add-on 999 not found');
  });
});

describe('Public booking lookup totals', () => {
  it('includes stored add-ons when recomputing the public order total', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForOrderLookup());

    const res = await request(app)
      .get('/api/public/booking/order/LR-1234-ABCD')
      .query({ email: 'customer@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.grandTotal).toBe(2035);
    expect(res.body.data.addonNames).toEqual(['Peace of Mind Cover']);
  });
});

describe('Respond.io multi-vehicle extension pricing', () => {
  it('quotes all three scooters and makes the arithmetic explicit', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForMultiVehicleExtension());
    configRepo.getModelPricing.mockResolvedValue([
      { minDays: 1, maxDays: 99, dailyRate: 535 },
    ]);

    const res = await request(app)
      .get('/api/public/respond/extension/preview')
      .set('X-API-Key', 'respond-test-key')
      .query({
        ref: 'LR-0722-TEST',
        newDropoffDatetime: '2026-07-25T10:00:00+08:00',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      vehicle_count: 3,
      extension_days: 5,
      daily_rate_per_vehicle: 535,
      extension_total: 8025,
      calculation: '3 vehicles x 5 days x PHP 535 = PHP 8,025',
      can_auto_confirm: false,
      requires_human_confirmation: true,
    });
    expect(res.body.vehicles).toHaveLength(3);
  });

  it('refuses to partially confirm a multi-vehicle extension', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForMultiVehicleExtension());
    configRepo.getModelPricing.mockResolvedValue([
      { minDays: 1, maxDays: 99, dailyRate: 535 },
    ]);

    const res = await request(app)
      .post('/api/public/respond/extension/confirm')
      .set('X-API-Key', 'respond-test-key')
      .send({
        ref: 'LR-0722-TEST',
        newDropoffDatetime: '2026-07-25T10:00:00+08:00',
        confirmedByCustomer: true,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: false,
      code: 'MULTI_VEHICLE_HANDOFF',
      quote: {
        extension_total: 8025,
        vehicle_count: 3,
      },
    });
  });
});

describe('Respond.io international phone extension lookup', () => {
  it('matches Phoebe’s channel-prefixed phone to the stored nine-digit number', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForInternationalPhoneExtension());

    const res = await request(app)
      .get('/api/public/respond/extension/lookup')
      .set('X-API-Key', 'respond-test-key')
      .query({ lookup: 'whatsapp:499430527' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      order_reference: 'LR-0730-PHOE',
      customer_name: 'Phoebe Delafaille',
      status: 'active',
      can_extend: true,
    });
  });
});

describe('Respond.io future booking context', () => {
  it('returns multi-vehicle delivery details for a confirmed booking found by phone', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForFutureDeliveryLookup());

    const res = await request(app)
      .get('/api/public/respond/booking')
      .set('X-API-Key', 'respond-test-key')
      .query({ phone: '+447597124073' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      booking: {
        reference: 'LR-0801-JORIS',
        status: 'confirmed',
        has_existing_booking: true,
        booking_stage: 'future',
        customer_name: 'Joris',
        vehicle_count: 2,
        vehicles: ['TukTuk 1', 'TukTuk 2'],
        pickup_location: 'General Luna',
        dropoff_location: 'Lola Shop',
        delivery_booked: true,
        collection_booked: false,
      },
    });
  });
});

describe('Respond.io availability alternatives', () => {
  it('returns a confirmed available-until boundary for a shorter rental', async () => {
    app.locals.deps.bookingPort.checkAvailability = vi.fn(async () => [{
      modelId: 'tuktuk',
      modelName: 'TukTuk',
      availableCount: 0,
      availableUntil: '2026-08-03T10:15:00+08:00',
    }]);

    const res = await request(app)
      .get('/api/public/respond/availability')
      .set('X-API-Key', 'respond-test-key')
      .query({
        pickupDatetime: '2026-08-01T16:30:00+08:00',
        dropoffDatetime: '2026-08-05T16:30:00+08:00',
        quantity: '1',
      });

    expect(res.status).toBe(200);
    expect(res.body.available[0]).toMatchObject({
      model_id: 'tuktuk',
      sufficient_availability: false,
      available_until: '2026-08-03T10:15:00+08:00',
    });
    expect(res.body.guidance).toContain('offer that confirmed shorter window first');
    expect(app.locals.deps.bookingPort.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({
      requestedQuantity: 1,
    }));
  });
});

describe('Respond.io recurring add-on extension pricing', () => {
  it('includes Peace of Mind Cover in the quoted extension balance', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForSingleVehicleExtensionWithPom());
    configRepo.getModelPricing.mockResolvedValue([
      { minDays: 1, maxDays: 99, dailyRate: 465 },
    ]);

    const res = await request(app)
      .get('/api/public/respond/extension/preview')
      .set('X-API-Key', 'respond-test-key')
      .query({
        ref: 'LR-0728-POM1',
        newDropoffDatetime: '2026-07-28T16:45:00+08:00',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      extension_days: 2,
      daily_rate: 465,
      rental_extension_total: 930,
      recurring_addons_total: 190,
      extension_total: 1120,
      security_deposit: 2000,
      payment_required_before_return: false,
      recurring_addons: [{
        name: 'Peace of Mind Cover',
        daily_rate: 95,
        extension_days: 2,
        extension_total: 190,
      }],
    });
    expect(res.body.customer_message).toContain('PHP 1,120');
    expect(res.body.customer_message).toContain('Peace of Mind Cover');
    expect(res.body.payment_guidance).toContain('may settle when returning');
  });

  it('requires store or Wise settlement when the extension exceeds the deposit', async () => {
    mocks.getSupabaseClient.mockReturnValue(makeSupabaseForSingleVehicleExtensionWithPom(1000));
    configRepo.getModelPricing.mockResolvedValue([
      { minDays: 1, maxDays: 99, dailyRate: 465 },
    ]);

    const res = await request(app)
      .get('/api/public/respond/extension/preview')
      .set('X-API-Key', 'respond-test-key')
      .query({
        ref: 'LR-0728-POM1',
        newDropoffDatetime: '2026-07-28T16:45:00+08:00',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      extension_total: 1120,
      security_deposit: 1000,
      payment_required_before_return: true,
    });
    expect(res.body.payment_guidance).toContain('settle at the store');
    expect(res.body.payment_guidance).toContain('Wise payment link');
  });
});
