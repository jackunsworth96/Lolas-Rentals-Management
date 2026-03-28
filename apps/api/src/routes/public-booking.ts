import { Router } from 'express';
import { z } from 'zod';
import { DirectBookingRequestSchema } from '@lolas/shared';
import { validateQuery, validateBody } from '../middleware/validate.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { createHold } from '../use-cases/booking/create-hold.js';
import { releaseHold } from '../use-cases/booking/release-hold.js';
import { submitDirectBooking } from '../use-cases/booking/submit-direct-booking.js';

const router = Router();

const AvailabilityQuerySchema = z.object({
  storeId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
});

router.get('/availability', validateQuery(AvailabilityQuerySchema), async (req, res, next) => {
  try {
    const { storeId, pickupDatetime, dropoffDatetime } = req.query as {
      storeId: string;
      pickupDatetime: string;
      dropoffDatetime: string;
    };

    const data = await checkAvailability(
      { bookingPort: req.app.locals.deps.bookingPort },
      { storeId, pickupDatetime, dropoffDatetime },
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const QuoteQuerySchema = z.object({
  storeId: z.string().min(1),
  vehicleModelId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  pickupLocationId: z.coerce.number().int().positive(),
  dropoffLocationId: z.coerce.number().int().positive(),
  addonIds: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : undefined,
    ),
});

router.get('/quote', validateQuery(QuoteQuerySchema), async (req, res, next) => {
  try {
    const {
      storeId,
      vehicleModelId,
      pickupDatetime,
      dropoffDatetime,
      pickupLocationId,
      dropoffLocationId,
      addonIds,
    } = req.query as unknown as {
      storeId: string;
      vehicleModelId: string;
      pickupDatetime: string;
      dropoffDatetime: string;
      pickupLocationId: number;
      dropoffLocationId: number;
      addonIds?: number[];
    };

    const data = await computeQuote(
      { configRepo: req.app.locals.deps.configRepo },
      {
        storeId,
        vehicleModelId,
        pickupDatetime,
        dropoffDatetime,
        pickupLocationId,
        dropoffLocationId,
        addonIds,
      },
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── Holds ──

const CreateHoldBodySchema = z.object({
  vehicleModelId: z.string().min(1),
  storeId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  sessionToken: z.string().min(1),
});

router.post('/hold', validateBody(CreateHoldBodySchema), async (req, res, next) => {
  try {
    const hold = await createHold(
      { bookingPort: req.app.locals.deps.bookingPort },
      req.body as {
        vehicleModelId: string;
        storeId: string;
        pickupDatetime: string;
        dropoffDatetime: string;
        sessionToken: string;
      },
    );

    res.status(201).json({
      success: true,
      data: {
        holdId: hold.id,
        sessionToken: hold.sessionToken,
        expiresAt: hold.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

const ReleaseHoldBodySchema = z.object({
  sessionToken: z.string().min(1),
});

router.delete('/hold/:holdId', validateBody(ReleaseHoldBodySchema), async (req, res, next) => {
  try {
    const deleted = await releaseHold(
      { bookingPort: req.app.locals.deps.bookingPort },
      { holdId: req.params.holdId as string, sessionToken: req.body.sessionToken },
    );

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Hold not found or session token mismatch' },
      });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/hold/:sessionToken', async (req, res, next) => {
  try {
    const holds = await req.app.locals.deps.bookingPort.findActiveHoldsBySession(
      req.params.sessionToken,
    );

    res.json({ success: true, data: holds });
  } catch (err) {
    next(err);
  }
});

// ── Submit ──

const SubmitBookingBodySchema = DirectBookingRequestSchema.extend({
  sessionToken: z.string().min(1),
});

router.post('/submit', validateBody(SubmitBookingBodySchema), async (req, res, next) => {
  try {
    const result = await submitDirectBooking(
      { bookingPort: req.app.locals.deps.bookingPort },
      req.body as z.infer<typeof SubmitBookingBodySchema>,
    );

    res.status(201).json({
      success: true,
      data: { id: result.id, orderReference: result.orderReference },
    });
  } catch (err) {
    next(err);
  }
});

// ── Addons (public) ──

const AddonsQuerySchema = z.object({
  storeId: z.string().min(1),
});

router.get('/addons', validateQuery(AddonsQuerySchema), async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId: string };
    const addons = await req.app.locals.deps.configRepo.getAddons(storeId);
    res.json({ success: true, data: addons });
  } catch (err) {
    next(err);
  }
});

// ── Locations (public) ──

const LocationsQuerySchema = z.object({
  storeId: z.string().min(1),
});

router.get('/locations', validateQuery(LocationsQuerySchema), async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId: string };
    const locations = await req.app.locals.deps.configRepo.getLocations(storeId);
    res.json({ success: true, data: locations });
  } catch (err) {
    next(err);
  }
});

export { router as publicBookingRoutes };
