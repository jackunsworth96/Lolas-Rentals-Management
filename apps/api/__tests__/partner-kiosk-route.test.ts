import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET ??= 'test-secret';

const mocks = vi.hoisted(() => ({
  partner: null as Record<string, unknown> | null,
  user: null as Record<string, unknown> | null,
  pins: [] as Array<{ pin_hash: string }>,
  benefit: null as Record<string, unknown> | null,
  checkAvailability: vi.fn(),
  insert: vi.fn(),
  insertHold: vi.fn(),
  whatsapp: vi.fn(),
  telegram: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => {
  const from = (table: string) => {
    const single = () => {
      if (table === 'accommodation_partners') return mocks.partner;
      if (table === 'partner_users') return mocks.user;
      return null;
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      maybeSingle: async () => ({ data: single(), error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: table === 'partner_users' ? mocks.pins : [], error: null }),
      insert: mocks.insert,
    };
    return chain;
  };
  return { supabase: { from }, getSupabaseClient: () => ({ from }) };
});
vi.mock('../src/adapters/auth/password.js', () => ({
  verifyPin: async (pin: string, hash: string) => hash === `hash:${pin}`,
}));
vi.mock('../src/lib/partner-benefit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/partner-benefit.js')>()),
  lookupActivePartnerBySlug: async () => mocks.benefit,
}));
vi.mock('../src/use-cases/surf-racks/get-surf-rack-availability.js', () => ({
  getSurfRackAvailability: async () => ({ tracked: true, soldOut: false, remaining: 3 }),
  assertSurfRacksAvailable: async () => undefined,
  countRackAddons: () => 0,
}));
vi.mock('../src/services/booking-confirmation-whatsapp.js', () => ({ sendBookingConfirmationWhatsApp: mocks.whatsapp }));
vi.mock('../src/lib/telegram.js', () => ({ sendTelegramAlert: mocks.telegram, getTelegramChatId: () => 'ops' }));
vi.mock('../src/services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/email.js')>()),
  sendEmail: vi.fn(),
}));

const { partnerKioskRoutes } = await import('../src/routes/partner-kiosk.js');
const { nextSlotFrom } = await import('../src/routes/counter.js');
const { generatePartnerToken, generatePartnerKioskToken } = await import('../src/adapters/auth/partner-jwt.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

const configRepo = {
  getLocations: async () => [
    { id: 2, name: 'General Luna', deliveryCost: 100, collectionCost: 100, locationType: null, storeId: null, isActive: true },
    { id: 10, name: "Lola's Rentals Store", deliveryCost: 0, collectionCost: 0, locationType: 'store', storeId: 'store-lolas', isActive: true },
  ],
  getVehicleModelById: async (id: string) => ({ id, name: 'Honda Beat', securityDeposit: 1000 }),
  getModelPricing: async () => [{ minDays: 1, maxDays: 30, dailyRate: 500 }],
  getAddons: async () => [],
};

function app() {
  const a = express();
  a.use(express.json());
  a.locals.deps = {
    bookingPort: {
      checkAvailability: mocks.checkAvailability,
      insertHold: mocks.insertHold,
      deleteHold: vi.fn().mockResolvedValue(true),
      findActiveHoldsBySession: vi.fn().mockResolvedValue([]),
    },
    configRepo,
  };
  a.use('/partner/kiosk', partnerKioskRoutes);
  a.use(errorHandler);
  return a;
}

const ids = { partnerUserId: 'user-1', partnerId: 'partner-1', partnerSlug: 'harana', storeId: 'store-lolas' };
const kioskToken = () => `Bearer ${generatePartnerKioskToken({ scope: 'partner_kiosk', ...ids })}`;
const portalToken = () => `Bearer ${generatePartnerToken({ scope: 'partner', ...ids, username: 'desk', name: 'Front desk' })}`;
const pickup = new Date(nextSlotFrom(Date.now() + 2 * 86_400_000)).toISOString();

describe('partner front-desk tablet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.partner = {
      id: 'partner-1', name: 'Harana Surf Resort', logo_url: 'https://cdn/harana.png', welcome_message: null,
      kiosk_location_id: 2, portal_enabled: true, active: true, status: 'active',
    };
    mocks.user = { id: 'user-1', is_active: true };
    mocks.pins = [{ pin_hash: 'hash:1111' }, { pin_hash: 'hash:2468' }];
    mocks.benefit = {
      id: 'partner-1', slug: 'harana', name: 'Harana Surf Resort', storeId: 'store-lolas',
      dealType: 'discount', discountType: 'percentage', discountValue: 10, freeDelivery: false,
      freeDeliveryLocationIds: null, advanceDiscountDays: null, earlyBirdDays: null, earlyBirdDiscountValue: null, vehicleTerms: [],
    };
    mocks.checkAvailability.mockResolvedValue([{ modelId: 'beat', modelName: 'Honda Beat', availableCount: 1 }]);
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('launches from a signed-in portal user once the delivery area is set', async () => {
    const res = await request(app()).post('/partner/kiosk/start').set('Authorization', portalToken());
    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');

    mocks.partner = { ...mocks.partner, kiosk_location_id: null };
    const notSetUp = await request(app()).post('/partner/kiosk/start').set('Authorization', portalToken());
    expect(notSetUp.status).toBe(409);
    expect(notSetUp.body.error.code).toBe('KIOSK_NOT_SET_UP');
  });

  it('will not accept a portal token as a tablet token, or the reverse', async () => {
    expect((await request(app()).get('/partner/kiosk/me').set('Authorization', portalToken())).status).toBe(401);
    expect((await request(app()).post('/partner/kiosk/start').set('Authorization', kioskToken())).status).toBe(401);
  });

  it('shows the partner branding on the tablet', async () => {
    const res = await request(app()).get('/partner/kiosk/me').set('Authorization', kioskToken());
    expect(res.body.data).toEqual({ partnerName: 'Harana Surf Resort', logoUrl: 'https://cdn/harana.png', welcomeMessage: null, ready: true });
  });

  it('signs the tablet out as soon as the portal or the user is switched off', async () => {
    mocks.partner = { ...mocks.partner, portal_enabled: false };
    const portalOff = await request(app()).get('/partner/kiosk/me').set('Authorization', kioskToken());
    expect(portalOff.status).toBe(401);
    expect(portalOff.body.error.code).toBe('KIOSK_SIGNED_OUT');

    mocks.partner = { ...mocks.partner, portal_enabled: true };
    mocks.user = { id: 'user-1', is_active: false };
    expect((await request(app()).get('/partner/kiosk/me').set('Authorization', kioskToken())).status).toBe(401);
  });

  it('prices with the partner discount and delivery to the hotel area', async () => {
    const res = await request(app()).get('/partner/kiosk/options').set('Authorization', kioskToken()).query({ days: 2, pickupDatetime: pickup });
    expect(res.status).toBe(200);
    expect(res.body.data.models[0]).toEqual(expect.objectContaining({
      modelId: 'beat', rentalSubtotal: 900, rentalDiscount: 100, deliveryFee: 200, total: 1100,
    }));
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({ pickupDatetime: pickup }), expect.anything());
  });

  it('gives free delivery and collection when the deal includes it', async () => {
    mocks.benefit = { ...mocks.benefit, dealType: 'discount_delivery', freeDelivery: true };
    const res = await request(app()).get('/partner/kiosk/options').set('Authorization', kioskToken()).query({ days: 2, pickupDatetime: pickup });
    expect(res.body.data.models[0]).toEqual(expect.objectContaining({ deliveryFee: 0, total: 900 }));
  });

  it('only accepts one of our pickup slots in the future', async () => {
    const offSlot = new Date(Date.parse(pickup) + 10 * 60_000).toISOString();
    const res = await request(app()).get('/partner/kiosk/options').set('Authorization', kioskToken()).query({ days: 2, pickupDatetime: offSlot });
    expect(res.status).toBe(422);
  });

  it('books for the partner: linked to their ref, delivered to the hotel', async () => {
    const res = await request(app()).post('/partner/kiosk/bookings').set('Authorization', kioskToken()).send({
      vehicleModelId: 'beat', days: 2, pickupDatetime: pickup,
      customerName: 'Robin', customerMobile: '+33626558584', customerEmail: 'robin@example.com',
    });
    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      booking_channel: 'direct',
      via_counter: true,
      partner_ref: 'harana',
      pickup_location_id: 2,
      dropoff_location_id: 2,
      pickup_location_address: 'Harana Surf Resort',
      dropoff_location_address: 'Harana Surf Resort',
      pickup_datetime: pickup,
      web_quote_raw: 1100,
      rental_value_raw: 900,
    }));
    expect(mocks.whatsapp).toHaveBeenCalledWith(expect.objectContaining({
      pickupLocation: 'General Luna — Harana Surf Resort', source: 'partner-kiosk-confirmation',
    }));
    expect(mocks.telegram).toHaveBeenCalledWith(expect.stringContaining('Partner tablet · Harana Surf Resort'), 'ops');
  });

  it('closes with the PIN of any active portal user, and refuses a wrong one', async () => {
    const ok = await request(app()).post('/partner/kiosk/exit').set('Authorization', kioskToken()).send({ pin: '2468' });
    expect(ok.status).toBe(200);
    const wrong = await request(app()).post('/partner/kiosk/exit').set('Authorization', kioskToken()).send({ pin: '0000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('WRONG_PIN');
  });
});
