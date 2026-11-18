import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Permission } from '@lolas/shared';

const mocks = vi.hoisted(() => ({
  permissions: ['can_use_counter'] as string[],
  checkAvailability: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => {
  const from = () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    insert: mocks.insert,
  });
  return { supabase: { from }, getSupabaseClient: () => ({ from }) };
});
vi.mock('../src/middleware/authenticate.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'tablet', username: 'counter', employeeId: 'e', roleId: 'role-counter', storeIds: ['store-lolas'], permissions: mocks.permissions };
    next();
  },
}));

const { counterRoutes, counterWindow } = await import('../src/routes/counter.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

const configRepo = {
  getLocations: async () => [
    { id: 7, name: 'General Luna', deliveryCost: 200, collectionCost: 200, locationType: 'delivery', storeId: 'store-lolas', isActive: true },
    { id: 1, name: "Lola's store", deliveryCost: 0, collectionCost: 0, locationType: 'store', storeId: 'store-lolas', isActive: true },
  ],
  getVehicleModelById: async (id: string) => ({ id, securityDeposit: 1000 }),
  getModelPricing: async () => [{ minDays: 1, maxDays: 30, dailyRate: 500 }],
  getAddons: async () => [],
};

function app() {
  const a = express();
  a.use(express.json());
  a.locals.deps = { bookingPort: { checkAvailability: mocks.checkAvailability }, configRepo };
  a.use('/counter', counterRoutes);
  a.use(errorHandler);
  return a;
}

const booking = { vehicleModelId: 'beat', days: 2, customerName: 'Robin', customerMobile: '+33626558584', customerEmail: 'robin@example.com' };

describe('counter tablet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = [Permission.UseCounter];
    mocks.checkAvailability.mockResolvedValue([
      { modelId: 'beat', modelName: 'Honda Beat', availableCount: 2 },
      { modelId: 'click', modelName: 'Honda Click', availableCount: 0 },
    ]);
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('starts the rental now and runs whole days, with no minimum notice', () => {
    const now = Date.parse('2026-11-17T08:35:42Z');
    expect(counterWindow(1, now)).toEqual({
      pickupDatetime: '2026-11-17T08:35:00.000Z',
      dropoffDatetime: '2026-11-18T08:35:00.000Z',
    });
  });

  it('lists only bikes free right now, priced from the store with no delivery fee', async () => {
    const res = await request(app()).get('/counter/options').query({ days: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.models).toEqual([
      { modelId: 'beat', modelName: 'Honda Beat', availableCount: 2, dailyRate: 500, total: 1000, securityDeposit: 1000 },
    ]);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({ storeId: 'store-lolas' }), expect.anything());
  });

  it('puts the booking in the inbox as an unprocessed counter walk-in', async () => {
    const res = await request(app()).post('/counter/bookings').send(booking);
    expect(res.status).toBe(201);
    expect(res.body.data.orderReference).toMatch(/^LR-\d{4}-[0-9A-F]{4}$/);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      booking_channel: 'walk_in',
      via_counter: true,
      status: 'unprocessed',
      store_id: 'store-lolas',
      vehicle_model_id: 'beat',
      pickup_location_id: 1,
      dropoff_location_id: 1,
      web_quote_raw: 1000,
      customer_mobile: '+33626558584',
    }));
  });

  it('refuses a bike that was taken in the meantime', async () => {
    const res = await request(app()).post('/counter/bookings').send({ ...booking, vehicleModelId: 'click' });
    expect(res.status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('requires an email so the waiver and confirmation can reach the customer', async () => {
    const res = await request(app()).post('/counter/bookings').send({ ...booking, customerEmail: '' });
    expect(res.status).toBe(400);
  });

  it('is closed to logins without the counter permission', async () => {
    mocks.permissions = [Permission.EditOrders];
    const res = await request(app()).get('/counter/options').query({ days: 1 });
    expect(res.status).toBe(403);
  });
});
