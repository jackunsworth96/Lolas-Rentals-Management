import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Permission } from '@lolas/shared';

const mocks = vi.hoisted(() => ({
  permissions: ['can_use_counter'] as string[],
  checkAvailability: vi.fn(),
  insert: vi.fn(),
  insertHold: vi.fn(),
  deleteHold: vi.fn(),
  findActiveHoldsBySession: vi.fn(),
  rackAvailability: vi.fn(),
  assertRacks: vi.fn(),
  whatsapp: vi.fn(),
  email: vi.fn(),
  telegram: vi.fn(),
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
vi.mock('../src/use-cases/surf-racks/get-surf-rack-availability.js', () => ({
  getSurfRackAvailability: mocks.rackAvailability,
  assertSurfRacksAvailable: mocks.assertRacks,
  countRackAddons: (ids: number[], rackIds: number[]) => ids.filter((id) => rackIds.includes(id)).length,
}));
vi.mock('../src/services/booking-confirmation-whatsapp.js', () => ({ sendBookingConfirmationWhatsApp: mocks.whatsapp }));
vi.mock('../src/lib/telegram.js', () => ({ sendTelegramAlert: mocks.telegram, getTelegramChatId: () => 'ops' }));
vi.mock('../src/services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/email.js')>()),
  sendEmail: mocks.email,
}));

const { counterRoutes, counterWindow, nextSlotFrom } = await import('../src/routes/counter.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

const addon = (id: number, name: string, addonType: 'per_day' | 'one_time', price: number, extra: Record<string, unknown> = {}) => ({
  id, name, addonType, pricePerDay: addonType === 'per_day' ? price : 0, priceOneTime: addonType === 'one_time' ? price : 0,
  storeId: 'store-lolas', mutualExclusivityGroup: null, isActive: true, applicableModelIds: null, ...extra,
});

const configRepo = {
  getLocations: async () => [
    { id: 2, name: 'General Luna', deliveryCost: 100, collectionCost: 100, locationType: null, storeId: null, isActive: true },
    { id: 7, name: 'Santa Fe', deliveryCost: 200, collectionCost: 200, locationType: null, storeId: null, isActive: true },
    { id: 15, name: 'IAO Airport', deliveryCost: 1800, collectionCost: 1800, locationType: null, storeId: 'store-lolas', isActive: true },
    { id: 10, name: "Lola's Rentals Store", deliveryCost: 0, collectionCost: 0, locationType: 'store', storeId: 'store-lolas', isActive: true },
  ],
  getVehicleModelById: async (id: string) => ({ id, name: id === 'beat' ? 'Honda Beat' : id, securityDeposit: 1000 }),
  getModelPricing: async () => [{ minDays: 1, maxDays: 30, dailyRate: 500 }],
  getAddons: async () => [
    addon(1, 'Peace of Mind Cover (Scooter)', 'per_day', 95),
    addon(8, 'Peace of Mind Cover (TukTuk)', 'per_day', 200),
    addon(7, 'Surf Rack', 'one_time', 250, { inventoryType: 'surf_rack' }),
    addon(4, 'Bungee Cord', 'one_time', 25),
    addon(9, '9PM Return', 'one_time', 100),
  ],
};

function app() {
  const a = express();
  a.use(express.json());
  a.locals.deps = {
    bookingPort: {
      checkAvailability: mocks.checkAvailability,
      insertHold: mocks.insertHold,
      deleteHold: mocks.deleteHold,
      findActiveHoldsBySession: mocks.findActiveHoldsBySession,
    },
    configRepo,
  };
  a.use('/counter', counterRoutes);
  a.use(errorHandler);
  return a;
}

const SESSION = 'counter-11111111-2222-3333-4444-555555555555';
const HOLD_ID = '9b2f7c1e-1d2a-4c3b-8e4f-123456789abc';
const booking = { vehicleModelId: 'beat', days: 2, customerName: 'Robin', customerMobile: '+33626558584', customerEmail: 'robin@example.com' };
/** 11:20 AM Manila on 19 Nov: the Click's blocking booking clears then. */
const CLICK_CLEARS = '2026-11-19T03:20:00.000Z';
/** The next slot after that, 11:45 AM Manila. */
const CLICK_NEXT_SLOT = '2026-11-19T03:45:00.000Z';

describe('counter tablet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = [Permission.UseCounter];
    mocks.checkAvailability.mockImplementation(async (input: { pickupDatetime: string }) => (
      input.pickupDatetime === CLICK_NEXT_SLOT
        ? [{ modelId: 'click', modelName: 'Honda Click', availableCount: 1 }]
        : [
          { modelId: 'click', modelName: 'Honda Click', availableCount: 0, nextAvailablePickup: CLICK_CLEARS },
          { modelId: 'beat', modelName: 'Honda Beat', availableCount: 2 },
          { modelId: 'adv', modelName: 'Honda ADV', availableCount: 0 },
        ]
    ));
    mocks.insert.mockResolvedValue({ error: null });
    mocks.rackAvailability.mockResolvedValue({ tracked: true, soldOut: false, remaining: 3 });
    mocks.assertRacks.mockResolvedValue(undefined);
    mocks.deleteHold.mockResolvedValue(true);
    mocks.findActiveHoldsBySession.mockResolvedValue([]);
    mocks.insertHold.mockImplementation(async (h: Record<string, string>) => ({
      id: HOLD_ID, vehicleModelId: h.vehicleModelId, storeId: h.storeId, pickupDatetime: h.pickupDatetime,
      dropoffDatetime: h.dropoffDatetime, sessionToken: h.sessionToken, expiresAt: h.expiresAt, createdAt: h.expiresAt,
    }));
  });

  it('starts at the nearest time slot and returns in the same slot whole days later', () => {
    expect(counterWindow(2, Date.parse('2026-11-19T02:10:00Z'))).toEqual({
      pickupDatetime: '2026-11-19T02:15:00.000Z',
      dropoffDatetime: '2026-11-21T02:15:00.000Z',
    });
    expect(counterWindow(1, Date.parse('2026-11-19T00:30:00Z')).pickupDatetime).toBe('2026-11-19T01:15:00.000Z');
    expect(counterWindow(1, Date.parse('2026-11-19T09:30:00Z')).pickupDatetime).toBe('2026-11-19T08:45:00.000Z');
  });

  it('rolls the next free slot to 9:15 the next morning after closing', () => {
    expect(nextSlotFrom(Date.parse(CLICK_CLEARS))).toBe(Date.parse(CLICK_NEXT_SLOT));
    expect(nextSlotFrom(Date.parse('2026-11-19T09:00:00Z'))).toBe(Date.parse('2026-11-20T01:15:00Z'));
  });

  it('lists free vehicles first and keeps fully booked ones with when they are next free', async () => {
    const res = await request(app()).get('/counter/options').query({ days: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.models.map((m: { modelId: string; nextFreePickup: string | null; total: number }) => [m.modelId, m.nextFreePickup, m.total])).toEqual([
      ['beat', null, 1000],
      ['click', CLICK_NEXT_SLOT, 1000],
      ['adv', null, 1000],
    ]);
  });

  it('does not count the customer’s own hold against them', async () => {
    await request(app()).get('/counter/options').query({ days: 2, sessionToken: SESSION });
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({ excludeSessionToken: SESSION }), expect.anything());
  });

  it('offers Peace of Mind for the right vehicle type, surf rack, bungee and collection areas', async () => {
    const res = await request(app()).get('/counter/extras').query({ days: 2, modelId: 'beat' });
    expect(res.status).toBe(200);
    expect(res.body.data.addons).toEqual([
      expect.objectContaining({ id: 1, kind: 'peace_of_mind', unitPrice: 95, total: 190 }),
      expect.objectContaining({ id: 7, kind: 'surf_rack', total: 250, soldOut: false }),
      expect.objectContaining({ id: 4, kind: 'bungee', total: 25 }),
    ]);
    expect(res.body.data.collectionAreas).toEqual([
      { id: 2, name: 'General Luna', fee: 100 },
      { id: 7, name: 'Santa Fe', fee: 200 },
    ]);
  });

  it('marks the surf rack sold out when every rack is taken', async () => {
    mocks.rackAvailability.mockResolvedValue({ tracked: true, soldOut: true, remaining: 0 });
    const res = await request(app()).get('/counter/extras').query({ days: 2, modelId: 'beat' });
    expect(res.body.data.addons.find((a: { kind: string }) => a.kind === 'surf_rack').soldOut).toBe(true);
  });

  it('holds the chosen vehicle for the customer and releases it on request', async () => {
    const held = await request(app()).post('/counter/holds').send({ modelId: 'beat', days: 2, pickupDatetime: null, sessionToken: SESSION });
    expect(held.status).toBe(201);
    expect(held.body.data.holdId).toBe(HOLD_ID);
    expect(mocks.insertHold).toHaveBeenCalledWith(expect.objectContaining({ vehicleModelId: 'beat', storeId: 'store-lolas', sessionToken: SESSION }));

    const released = await request(app()).delete(`/counter/holds/${HOLD_ID}`).send({ sessionToken: SESSION });
    expect(released.status).toBe(200);
    expect(mocks.deleteHold).toHaveBeenCalledWith(HOLD_ID, SESSION);
  });

  it('refuses to hold a vehicle that is fully booked', async () => {
    const res = await request(app()).post('/counter/holds').send({ modelId: 'click', days: 2, sessionToken: SESSION });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
  });

  it('puts the booking in the inbox with extras, collection and the full total', async () => {
    const res = await request(app()).post('/counter/bookings').send({
      ...booking, addonIds: [1, 4], collectionLocationId: 7, stayingAt: 'Villa Mar',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.orderReference).toMatch(/^LR-\d{4}-[0-9A-F]{4}$/);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      booking_channel: 'walk_in',
      via_counter: true,
      status: 'unprocessed',
      store_id: 'store-lolas',
      partner_ref: null,
      vehicle_model_id: 'beat',
      pickup_location_id: 10,
      dropoff_location_id: 7,
      dropoff_location_address: 'Villa Mar',
      addon_ids: [1, 4],
      // 2 days × 500 + Peace of Mind 2 × 95 + bungee 25 + Santa Fe collection 200
      web_quote_raw: 1415,
      rental_value_raw: 1000,
    }));
  });

  it('uses and then clears the customer’s hold when they book', async () => {
    const window = counterWindow(2);
    mocks.findActiveHoldsBySession.mockResolvedValue([{
      id: HOLD_ID, vehicleModelId: 'beat', storeId: 'store-lolas', ...window, sessionToken: SESSION, expiresAt: '', createdAt: '',
    }]);
    const res = await request(app()).post('/counter/bookings').send({
      ...booking, pickupDatetime: null, stayingAt: null, collectionLocationId: null, addonIds: [], holdId: HOLD_ID, sessionToken: SESSION,
    });
    expect(res.status).toBe(201);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({ excludeSessionToken: SESSION }), expect.anything());
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ booking_hold_id: HOLD_ID, booking_session_token: SESSION,
      pickup_datetime: window.pickupDatetime,
      dropoff_datetime: window.dropoffDatetime,
    }));
    expect(mocks.deleteHold).toHaveBeenCalledWith(HOLD_ID, SESSION);
  });

  it('rejects an extra that is not offered for the vehicle, and an area we do not collect from', async () => {
    const wrongPom = await request(app()).post('/counter/bookings').send({ ...booking, addonIds: [8] });
    expect(wrongPom.status).toBe(422);
    const airport = await request(app()).post('/counter/bookings').send({ ...booking, collectionLocationId: 15 });
    expect(airport.status).toBe(422);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('sends the WhatsApp and email confirmations with the waiver link and extras', async () => {
    const res = await request(app()).post('/counter/bookings').send({ ...booking, addonIds: [1] });
    const ref = res.body.data.orderReference as string;
    expect(mocks.whatsapp).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Robin',
      customerMobile: '+33626558584',
      orderReference: ref,
      vehicleName: 'Honda Beat',
      pickupLocation: "Lola's Rentals Store",
      waiverUrl: expect.stringMatching(new RegExp(`/waiver/${ref}$`)),
      source: 'counter-confirmation',
    }));
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ to: 'robin@example.com', html: expect.stringContaining('Peace of Mind Cover (Scooter)') }));
    expect(mocks.telegram).toHaveBeenCalledWith(expect.stringContaining('Add-ons: Peace of Mind Cover (Scooter)'), 'ops');
  });

  it('refuses a vehicle that was taken in the meantime, without confirming anything', async () => {
    const res = await request(app()).post('/counter/bookings').send({ ...booking, vehicleModelId: 'click' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.whatsapp).not.toHaveBeenCalled();
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
