import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Permission } from '@lolas/shared';

const mocks = vi.hoisted(() => ({
  permissions: ['can_use_counter'] as string[],
  checkAvailability: vi.fn(),
  insert: vi.fn(),
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
vi.mock('../src/services/booking-confirmation-whatsapp.js', () => ({ sendBookingConfirmationWhatsApp: mocks.whatsapp }));
vi.mock('../src/lib/telegram.js', () => ({ sendTelegramAlert: mocks.telegram, getTelegramChatId: () => 'ops' }));
vi.mock('../src/services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/email.js')>()),
  sendEmail: mocks.email,
}));

const { counterRoutes, counterWindow, nextSlotFrom } = await import('../src/routes/counter.js');
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
  });

  it('starts at the nearest time slot and returns in the same slot whole days later', () => {
    // 10:10 AM Manila
    expect(counterWindow(2, Date.parse('2026-11-19T02:10:00Z'))).toEqual({
      pickupDatetime: '2026-11-19T02:15:00.000Z',
      dropoffDatetime: '2026-11-21T02:15:00.000Z',
    });
    // 8:30 AM Manila, before opening, starts at 9:15
    expect(counterWindow(1, Date.parse('2026-11-19T00:30:00Z')).pickupDatetime).toBe('2026-11-19T01:15:00.000Z');
    // 5:30 PM Manila, after the last slot, stays on 4:45
    expect(counterWindow(1, Date.parse('2026-11-19T09:30:00Z')).pickupDatetime).toBe('2026-11-19T08:45:00.000Z');
  });

  it('rolls the next free slot to 9:15 the next morning after closing', () => {
    expect(nextSlotFrom(Date.parse(CLICK_CLEARS))).toBe(Date.parse(CLICK_NEXT_SLOT));
    expect(nextSlotFrom(Date.parse('2026-11-19T09:00:00Z'))).toBe(Date.parse('2026-11-20T01:15:00Z'));
  });

  it('lists free vehicles first and keeps fully booked ones with when they are next free', async () => {
    const res = await request(app()).get('/counter/options').query({ days: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.models).toEqual([
      { modelId: 'beat', modelName: 'Honda Beat', availableCount: 2, nextFreePickup: null, dailyRate: 500, total: 1000, securityDeposit: 1000 },
      { modelId: 'click', modelName: 'Honda Click', availableCount: 0, nextFreePickup: CLICK_NEXT_SLOT, dailyRate: 500, total: 1000, securityDeposit: 1000 },
      { modelId: 'adv', modelName: 'Honda ADV', availableCount: 0, nextFreePickup: null, dailyRate: 500, total: 1000, securityDeposit: 1000 },
    ]);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'store-lolas', pickupDatetime: CLICK_NEXT_SLOT, dropoffDatetime: '2026-11-21T03:45:00.000Z' }),
      expect.anything(),
    );
  });

  it('only shows a next free date that covers the whole requested length', async () => {
    mocks.checkAvailability.mockImplementation(async (input: { pickupDatetime: string }) => (
      input.pickupDatetime === CLICK_NEXT_SLOT
        ? [{ modelId: 'click', modelName: 'Honda Click', availableCount: 0 }]
        : [{ modelId: 'click', modelName: 'Honda Click', availableCount: 0, nextAvailablePickup: CLICK_CLEARS }]
    ));
    const res = await request(app()).get('/counter/options').query({ days: 5 });
    expect(res.body.data.models[0].nextFreePickup).toBeNull();
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

  it('sends the WhatsApp and email confirmations with the waiver link', async () => {
    const res = await request(app()).post('/counter/bookings').send(booking);
    const ref = res.body.data.orderReference as string;
    expect(mocks.whatsapp).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Robin',
      customerMobile: '+33626558584',
      orderReference: ref,
      vehicleName: 'Honda Beat',
      pickupLocation: "Lola's store",
      waiverUrl: expect.stringMatching(new RegExp(`/waiver/${ref}$`)),
      source: 'counter-confirmation',
    }));
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ to: 'robin@example.com' }));
    expect(mocks.telegram).toHaveBeenCalledTimes(1);
  });

  it('refuses a vehicle that was taken in the meantime, without confirming anything', async () => {
    const res = await request(app()).post('/counter/bookings').send({ ...booking, vehicleModelId: 'click' });
    expect(res.status).toBe(409);
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
