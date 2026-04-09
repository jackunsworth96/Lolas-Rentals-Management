import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import type { Store, ConfigRepository } from '@lolas/domain';
import { PublicTransferBookingSchema } from '@lolas/shared';

const flightLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many flight lookups' },
  },
});

const router = Router();

const PublicBookingSchema = z.object({
  serviceDate: z.string().min(1),
  customerName: z.string().min(1),
  contactNumber: z.string().nullable().default(null),
  customerEmail: z.union([z.string().email(), z.literal(''), z.null()]).default(null).transform((v) => v || null),
  route: z.string().min(1),
  flightTime: z.string().nullable().default(null),
  paxCount: z.number().int().positive().default(1),
  vanType: z.string().nullable().default(null),
  accommodation: z.string().nullable().default(null),
  totalPrice: z.number().positive(),
  opsNotes: z.string().nullable().default(null),
  token: z.string().min(1),
});

async function resolveToken(
  configRepo: ConfigRepository,
  token: string,
): Promise<Store | null> {
  const store = await configRepo.getStoreByBookingToken(token);
  if (!store || !store.publicBookingEnabled) return null;
  return store;
}

router.get('/transfer-routes', async (req, res, next) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'MISSING_TOKEN', message: 'token is required' } });
      return;
    }
    const store = await resolveToken(req.app.locals.deps.configRepo, token);
    if (!store) {
      res.status(404).json({ success: false, error: { code: 'INVALID_LINK', message: 'This booking link is not valid or has been disabled.' } });
      return;
    }
    const routes = await req.app.locals.deps.configRepo.getTransferRoutes(store.id);
    res.json({ success: true, data: routes });
  } catch (err) { next(err); }
});

router.get('/store-info', async (req, res, next) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'MISSING_TOKEN', message: 'token is required' } });
      return;
    }
    const store = await resolveToken(req.app.locals.deps.configRepo, token);
    if (!store) {
      res.status(404).json({ success: false, error: { code: 'INVALID_LINK', message: 'This booking link is not valid or has been disabled.' } });
      return;
    }
    res.json({ success: true, data: { id: store.id, name: store.name } });
  } catch (err) { next(err); }
});

router.post('/transfer-booking', validateBody(PublicBookingSchema), async (req, res, next) => {
  try {
    const store = await resolveToken(req.app.locals.deps.configRepo, req.body.token);
    if (!store) {
      res.status(404).json({ success: false, error: { code: 'INVALID_LINK', message: 'This booking link is not valid or has been disabled.' } });
      return;
    }

    const routes = await req.app.locals.deps.configRepo.getTransferRoutes(store.id);
    const matchedRoute = routes.find((r: { route: string; vanType: string | null; price: number }) =>
      r.route === req.body.route && (!req.body.vanType || r.vanType === req.body.vanType),
    );
    if (matchedRoute) {
      const expectedPrice = (matchedRoute as { pricingType?: string; price: number }).pricingType === 'per_head'
        ? matchedRoute.price * (req.body.paxCount ?? 1)
        : matchedRoute.price;
      if (req.body.totalPrice < expectedPrice) {
        res.status(400).json({ success: false, error: { code: 'PRICE_MISMATCH', message: 'Submitted price is below the configured rate' } });
        return;
      }
    }

    const { createTransfer } = await import('../use-cases/transfers/create-transfer.js');
    const result = await createTransfer(
      {
        ...req.body,
        customerType: 'Online',
        paymentMethod: null,
        bookingSource: 'online',
        bookingToken: req.body.token,
        orderId: null,
        storeId: store.id,
      },
      { transfers: req.app.locals.deps.transferRepo },
    );
    res.status(201).json({ success: true, data: { id: result.id } });
  } catch (err) { next(err); }
});

router.post('/public-transfer-booking', validateBody(PublicTransferBookingSchema), async (req, res, next) => {
  try {
    const token = req.body.token as string | undefined;
    if (!token) {
      res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN', message: 'Booking token is required' } });
      return;
    }
    const store = await resolveToken(req.app.locals.deps.configRepo, token);
    if (!store) {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or disabled booking token' } });
      return;
    }
    const routes = await req.app.locals.deps.configRepo.getTransferRoutes(store.id);
    const matchedRoute = routes.find((r: { route: string; vanType: string | null; price: number }) =>
      r.route === req.body.route && (!req.body.vanType || r.vanType === req.body.vanType),
    );
    if (matchedRoute) {
      const expectedPrice = (matchedRoute as { pricingType?: string; price: number }).pricingType === 'per_head'
        ? matchedRoute.price * (req.body.paxCount ?? 1)
        : matchedRoute.price;
      if (req.body.totalPrice < expectedPrice) {
        res.status(400).json({ success: false, error: { code: 'PRICE_MISMATCH', message: 'Submitted price is below the configured rate' } });
        return;
      }
    }

    const { createTransfer } = await import('../use-cases/transfers/create-transfer.js');
    const result = await createTransfer(
      {
        serviceDate:    req.body.serviceDate,
        customerName:   req.body.customerName,
        contactNumber:  req.body.contactNumber,
        customerEmail:  null,
        customerType:   'Online',
        route:          req.body.route,
        flightTime:     req.body.flightTime,
        paxCount:       req.body.paxCount,
        vanType:        req.body.vanType,
        accommodation:  null,
        opsNotes:       req.body.opsNotes,
        totalPrice:     req.body.totalPrice,
        paymentMethod:  null,
        bookingSource:  'Online',
        bookingToken:   token,
        storeId:        store.id,
        orderId:        null,
      },
      { transfers: req.app.locals.deps.transferRepo },
    );
    res.status(201).json({ success: true, reference: result.id });
  } catch (err) { next(err); }
});

router.get('/flight-lookup', flightLimiter, async (req, res, next) => {
  // Requires AERODATABOX_API_KEY in environment variables
  // Free tier: 100 calls/day via RapidAPI
  // https://rapidapi.com/aedbx-aedbx/api/aerodatabox
  try {
    const flightNumber = req.query.flightNumber as string | undefined;
    if (!flightNumber) {
      res.status(400).json({ error: 'flightNumber query parameter is required' });
      return;
    }

    const apiKey = process.env.AERODATABOX_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Flight lookup unavailable.' });
      return;
    }

    let raw: globalThis.Response;
    try {
      raw = await fetch(
        `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}`,
        {
          headers: {
            'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
            'x-rapidapi-key': apiKey,
          },
        },
      );
    } catch {
      res.status(503).json({ error: 'Flight lookup service unavailable. Please enter time manually.' });
      return;
    }

    if (!raw.ok) {
      res.status(404).json({ error: 'Flight not found. Please enter date and time manually.' });
      return;
    }

    const data = await raw.json() as unknown[];
    if (!Array.isArray(data) || data.length === 0) {
      res.status(404).json({ error: 'Flight not found. Please enter date and time manually.' });
      return;
    }

    const result  = data[0] as Record<string, unknown>;
    const dep     = result.departure as Record<string, unknown> | undefined;
    const arr     = result.arrival   as Record<string, unknown> | undefined;
    const depTime = dep?.scheduledTime as Record<string, unknown> | undefined;
    const arrTime = arr?.scheduledTime as Record<string, unknown> | undefined;
    const airline = result.airline    as Record<string, unknown> | undefined;
    const depApt  = dep?.airport      as Record<string, unknown> | undefined;
    const arrApt  = arr?.airport      as Record<string, unknown> | undefined;

    res.json({
      flightNumber,
      scheduledDeparture: depTime?.local   ?? null,
      scheduledArrival:   arrTime?.local   ?? null,
      flightStatus:       result.status    ?? null,
      airline:            airline?.name    ?? null,
      origin:             depApt?.iata     ?? null,
      destination:        arrApt?.iata     ?? null,
    });
  } catch (err) { next(err); }
});

export { router as publicTransferRoutes };
