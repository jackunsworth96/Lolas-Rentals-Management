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
const fleet = ['busy', 'free', 'retired'].map((id) => ({
  id, name: id, model_id: 'beat', store_id: 'test', status: 'Available', vehicle_models: { type: 'scooter', is_active: true },
}));

/** Chainable PostgREST stand-in: every filter returns the same query; awaiting it yields `tables[table]`. */
function mockTables(tables: Record<string, unknown>, fallback: unknown) {
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table in tables ? tables[table] : fallback, error: null };
    const query: Record<string, unknown> = {
      maybeSingle: async () => result,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    for (const method of ['select', 'eq', 'in', 'not', 'is', 'gt', 'gte', 'lt', 'lte', 'or']) query[method] = () => query;
    return query;
  });
}

const sharedSegment = {
  starts_at: '2026-10-31T00:00:00Z', ends_at: '2026-11-05T00:00:00Z', pool: 'shared',
  capacity_reservations: { partner_id: null, vehicle_type: 'bike', released_at: null, expires_at: null },
};
const bravoAllocation = {
  partner_allocation_settings: { enabled: true },
  partner_allocation_type_map: [{ model_type: 'scooter', vehicle_type: 'bike' }],
  partner_allocations: [{ partner_id: 'bravo', vehicle_type: 'bike', effective_month: '2026-11-01', scheduled_qty: 1 }],
  partner_allocation_overrides: [],
  fleet_unavailability: [],
  accommodation_partners: [{ id: 'bravo', name: 'Bravo Beach Resort', slug: 'bravo', portal_subdomain: null }],
  order_items: [],
  orders_raw: [],
  capacity_reservations: [],
};

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
    mocks.from.mockReset();
    mockTables({ fleet, capacity_reservations: [], partner_allocation_type_map: [], partner_allocation_settings: null }, { id: 'own', store_id: 'test' });
  });

  it('labels the only free bike as protected when walk-ins would eat into a partner allocation', async () => {
    mockTables({ ...bravoAllocation, fleet, capacity_reservation_segments: [sharedSegment, sharedSegment] }, null);
    const response = await request(app()).get('/fleet/available').query(dates);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({ id: 'free', protectedFor: { partnerId: 'bravo', partnerName: 'Bravo Beach Resort', vehicleType: 'bike' } }),
    ]);
  });

  it('lets the partner\'s own booking use its protected bike', async () => {
    mockTables({ ...bravoAllocation, fleet, capacity_reservation_segments: [sharedSegment, sharedSegment] }, null);
    const response = await request(app()).get('/fleet/available').query({ ...dates, partnerRef: 'bravo' });
    expect(response.body.data).toEqual([expect.objectContaining({ id: 'free', protectedFor: null })]);
  });

  it('uses shared exact conflicts for a new walk-in, without re-clamping by pooled model capacity', async () => {
    const response = await request(app()).get('/fleet/available').query(dates);
    expect(response.status).toBe(200);
    expect(response.body.data.map((vehicle: { id: string }) => vehicle.id)).toEqual(['free']);
    // The per-vehicle exact-conflict check (from evaluateAvailability) is the only gate here.
    // bookingPort.checkAvailability() is a pooled, model-level sales cap unrelated to whether
    // this specific vehicle is free, and must not be used to hide conflict-free vehicles from
    // staff tools (see docs/AVAILABILITY_INVENTORY_BUG_FIX.md, Bug #2).
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it('assigns an existing reservation without making it consume capacity twice', async () => {
    mocks.checkAvailability.mockResolvedValue([{ modelId: 'beat', availableCount: 0 }]);
    const response = await request(app()).get('/fleet/available').query({ ...dates, excludeRawOrderId: 'own' });
    expect(response.status).toBe(200);
    expect(response.body.data.map((vehicle: { id: string }) => vehicle.id)).toEqual(['free']);
    expect(mocks.evaluateAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ excludeRawOrderId: 'own' }), expect.anything(),
      { vehicleAssignments: true, includeHiddenFromWebsite: true },
    );
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it('holds back a free vehicle that a pending booking needs', async () => {
    mocks.evaluateAvailability.mockResolvedValue({
      models: [{ modelId: 'beat', availableCount: 0 }],
      explanation: {
        configurationExclusions: [],
        models: [{ exactVehicleExclusions: [], reservedForBookings: [{ vehicleId: 'busy', vehicleName: 'busy' }] }],
      },
    });
    const response = await request(app()).get('/fleet/available').query(dates);
    expect(response.body.data.map((vehicle: { id: string }) => vehicle.id)).toEqual(['free', 'retired']);
  });

  it('does not expose another store', async () => {
    const response = await request(app()).get('/fleet/available').query({ ...dates, storeId: 'other' });
    expect(response.status).toBe(403);
    expect(mocks.evaluateAvailability).not.toHaveBeenCalled();
  });

  it('accepts legacy WooCommerce reservations that identify the store by source', async () => {
    mockTables(
      { fleet, capacity_reservations: [], partner_allocation_type_map: [], partner_allocation_settings: null },
      { id: 'own', store_id: null, source: 'lolas' },
    );
    const response = await request(app()).get('/fleet/available').query({ ...dates, storeId: 'store-lolas', excludeRawOrderId: 'own' });
    expect(response.status).toBe(200);
  });

  it('requires offset-aware pickup and return times', async () => {
    const response = await request(app()).get('/fleet/available').query({ ...dates, pickupDatetime: '2026-11-01T09:00' });
    expect(response.status).toBe(400);
  });

  it('explains an allocation conflict in plain words, naming the partner', async () => {
    mockTables({ ...bravoAllocation, fleet, capacity_reservation_segments: [sharedSegment, sharedSegment] }, null);
    mocks.evaluateAvailability.mockRejectedValue(new Error('ALLOCATION_CONFLICT: bike at 2026-11-01 01:00:00+00, booking raw:abc'));
    const response = await request(app()).get('/fleet/available').query(dates);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALLOCATION_CONFLICT');
    expect(response.body.error.message).toContain('protected for Bravo Beach Resort');
    expect(response.body.error.details).toMatchObject({ reason: 'partner_protected', vehicleType: 'bike', partners: [{ partnerId: 'bravo' }] });
  });

  it('reports a database assignment conflict as a conflict response', async () => {
    mocks.evaluateAvailability.mockRejectedValue(new Error('VEHICLE_UNAVAILABLE: motorcycle is already booked'));
    const response = await request(app()).get('/fleet/available').query(dates);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VEHICLE_UNAVAILABLE');
  });
});
