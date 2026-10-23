import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Permission } from '@lolas/shared';

const mocks = vi.hoisted(() => ({ evaluateAvailability: vi.fn(), from: vi.fn(), checkAvailability: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => ({ from: mocks.from }), supabase: { from: mocks.from },
}));
vi.mock('../src/adapters/supabase/booking-adapter.js', () => ({ evaluateAvailability: mocks.evaluateAvailability }));
vi.mock('../src/middleware/authenticate.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'test', username: 'test', employeeId: 'test', roleId: 'test', storeIds: ['test', 'store-lolas'], permissions: [Permission.ViewFleet] };
    next();
  },
}));
const { fleetRoutes } = await import('../src/routes/fleet.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

const dates = { storeId: 'test', pickupDatetime: '2026-11-01T09:00:00+08:00', dropoffDatetime: '2026-11-03T09:00:00+08:00' };
const fleet = ['busy', 'free', 'retired'].map((id) => ({ id, name: id, model_id: 'beat', store_id: 'test', status: 'Available' }));

function app() {
  const app = express();
  app.locals.deps = { bookingPort: { checkAvailability: mocks.checkAvailability } };
  app.use('/fleet', fleetRoutes);
  app.use(errorHandler);
  return app;
}

describe('staff vehicle availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evaluateAvailability.mockResolvedValue({
      models: [{ modelId: 'beat', availableCount: 0 }],
      explanation: {
        configurationExclusions: [{ vehicleId: 'retired' }],
        models: [{ exactVehicleExclusions: [{ vehicleId: 'busy' }] }],
      },
    });
    mocks.checkAvailability.mockResolvedValue([{ modelId: 'beat', availableCount: 1 }]);
    mocks.from.mockImplementation((table: string) => {
      const result = { data: table === 'fleet' ? fleet : { id: 'own', store_id: 'test' }, error: null };
      const query = {
        select: () => query, eq: () => query, maybeSingle: async () => result,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    });
  });

  it('uses shared exact conflicts and model capacity for a new walk-in', async () => {
    const response = await request(app()).get('/fleet/available').query(dates);
    expect(response.status).toBe(200);
    expect(response.body.data.map((vehicle: { id: string }) => vehicle.id)).toEqual(['free']);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining(dates));
  });

  it('assigns an existing reservation without making it consume capacity twice', async () => {
    mocks.checkAvailability.mockResolvedValue([{ modelId: 'beat', availableCount: 0 }]);
    const response = await request(app()).get('/fleet/available').query({ ...dates, excludeRawOrderId: 'own' });
    expect(response.status).toBe(200);
    expect(response.body.data.map((vehicle: { id: string }) => vehicle.id)).toEqual(['free']);
    expect(mocks.evaluateAvailability).toHaveBeenCalledWith(expect.objectContaining({ excludeRawOrderId: 'own' }), expect.anything());
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it('does not expose another store', async () => {
    const response = await request(app()).get('/fleet/available').query({ ...dates, storeId: 'other' });
    expect(response.status).toBe(403);
    expect(mocks.evaluateAvailability).not.toHaveBeenCalled();
  });

  it('accepts legacy WooCommerce reservations that identify the store by source', async () => {
    mocks.from.mockImplementation((table: string) => {
      const result = { data: table === 'fleet' ? fleet : { id: 'own', store_id: null, source: 'lolas' }, error: null };
      const query = {
        select: () => query, eq: () => query, maybeSingle: async () => result,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    });
    const response = await request(app()).get('/fleet/available').query({ ...dates, storeId: 'store-lolas', excludeRawOrderId: 'own' });
    expect(response.status).toBe(200);
  });

  it('requires offset-aware pickup and return times', async () => {
    const response = await request(app()).get('/fleet/available').query({ ...dates, pickupDatetime: '2026-11-01T09:00' });
    expect(response.status).toBe(400);
  });

  it('reports a database assignment conflict as a conflict response', async () => {
    mocks.evaluateAvailability.mockRejectedValue(new Error('VEHICLE_UNAVAILABLE: motorcycle is already booked'));
    const response = await request(app()).get('/fleet/available').query(dates);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VEHICLE_UNAVAILABLE');
  });
});
