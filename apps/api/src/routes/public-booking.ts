import { Router } from 'express';
import { z } from 'zod';
import { SubmitDirectBookingRequestSchema, type SubmitDirectBookingInput } from '@lolas/shared';
import { validateQuery, validateBody } from '../middleware/validate.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { createHold } from '../use-cases/booking/create-hold.js';
import { releaseHold } from '../use-cases/booking/release-hold.js';
import { submitDirectBooking, type SubmitDirectBookingResult } from '../use-cases/booking/submit-direct-booking.js';

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

router.post('/submit', validateBody(SubmitDirectBookingRequestSchema), async (req, res, next) => {
  try {
    const result: SubmitDirectBookingResult = await submitDirectBooking(
      { bookingPort: req.app.locals.deps.bookingPort, configRepo: req.app.locals.deps.configRepo },
      req.body as SubmitDirectBookingInput,
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        orderReference: result.orderReference,
        serverQuote: result.serverQuote ?? null,
        charityDonation: result.charityDonation,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Addons (public) ──

const AddonsQuerySchema = z.object({
  storeId: z.string().min(1),
  vehicleModelId: z.string().optional(),
});

router.get('/addons', validateQuery(AddonsQuerySchema), async (req, res, next) => {
  try {
    const { storeId, vehicleModelId } = req.query as { storeId: string; vehicleModelId?: string };
    const allAddons = await req.app.locals.deps.configRepo.getAddons(storeId);
    const filtered = vehicleModelId
      ? allAddons.filter((a: { applicableModelIds?: string[] | null }) => {
          const ids = a.applicableModelIds;
          return !ids || ids.length === 0 || ids.includes(vehicleModelId);
        })
      : allAddons;
    res.json({ success: true, data: filtered });
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

// ── Payment Methods (public — id, name, surcharge only) ──

router.get('/payment-methods', async (req, res, next) => {
  try {
    const methods = await req.app.locals.deps.configRepo.getPaymentMethods();
    const publicMethods = methods.map((m: { id: string; name: string; surchargePercent?: number }) => ({
      id: m.id,
      name: m.name,
      surchargePercent: m.surchargePercent ?? 0,
    }));
    res.json({ success: true, data: publicMethods });
  } catch (err) {
    next(err);
  }
});

// ── Order Lookup (public) ──

router.get('/order/:reference', async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const sb = req.app.locals.deps.bookingPort;
    const configRepo = req.app.locals.deps.configRepo;

    const { getSupabaseClient } = await import('../adapters/supabase/client.js');
    const supabase = getSupabaseClient();

    const { data: rows, error } = await supabase
      .from('orders_raw')
      .select('*')
      .eq('order_reference', reference)
      .eq('booking_channel', 'direct')
      .limit(1);

    if (error) throw new Error(`Order lookup failed: ${error.message}`);
    if (!rows || rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Booking not found' },
      });
      return;
    }

    const row = rows[0] as Record<string, unknown>;

    const pickupDt = row.pickup_datetime as string;
    const dropoffDt = row.dropoff_datetime as string;
    const diffMs = new Date(dropoffDt).getTime() - new Date(pickupDt).getTime();
    const rentalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    let vehicleModelName = '';
    if (row.vehicle_model_id) {
      const { data: vm } = await supabase
        .from('vehicle_models')
        .select('name')
        .eq('id', row.vehicle_model_id as string)
        .single();
      if (vm) vehicleModelName = (vm as { name: string }).name;
    }

    let grandTotal = 0;
    let depositAmount = 0;
    try {
      const storeId = row.store_id as string;
      const modelId = row.vehicle_model_id as string;
      const pickupLocId = row.pickup_location_id as number;
      const dropoffLocId = row.dropoff_location_id as number;
      const quote = await computeQuote(
        { configRepo },
        { storeId, vehicleModelId: modelId, pickupDatetime: pickupDt, dropoffDatetime: dropoffDt, pickupLocationId: pickupLocId, dropoffLocationId: dropoffLocId },
      );
      grandTotal = quote.grandTotal ?? 0;
      depositAmount = quote.securityDeposit ?? 0;
    } catch { /* quote may fail for edge cases */ }

    const addonNames: string[] = [];
    const addonIds = row.addon_ids as number[] | null;
    if (addonIds && addonIds.length > 0) {
      const { data: addons } = await supabase
        .from('addons')
        .select('name')
        .in('id', addonIds);
      if (addons) {
        for (const a of addons as { name: string }[]) addonNames.push(a.name);
      }
    }

    res.json({
      success: true,
      data: {
        orderReferences: [row.order_reference as string],
        customerName: row.customer_name as string,
        customerEmail: row.customer_email as string,
        vehicleModelName,
        pickupDatetime: pickupDt,
        dropoffDatetime: dropoffDt,
        rentalDays,
        grandTotal,
        depositAmount,
        addonNames,
        transferType: row.transfer_type ?? null,
        flightNumber: row.flight_number ?? null,
        transferRoute: row.transfer_route ?? null,
        charityDonation: Number(row.charity_donation ?? 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Transfer Routes (public) ──

const TransferRoutesQuerySchema = z.object({
  storeId: z.string().min(1),
});

router.get('/transfer-routes', validateQuery(TransferRoutesQuerySchema), async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId: string };
    const routes = await req.app.locals.deps.configRepo.getTransferRoutes(storeId);
    res.json({ success: true, data: routes });
  } catch (err) {
    next(err);
  }
});

export { router as publicBookingRoutes };
