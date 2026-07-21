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
