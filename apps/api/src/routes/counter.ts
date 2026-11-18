import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, WhatsAppNumberSchema, resolveSourceFromStore } from '@lolas/shared';
import type { AvailableModel, Location } from '@lolas/domain';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { supabase } from '../adapters/supabase/client.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { uniqueWalkInReference } from '../lib/walk-in-reference.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MAX_COUNTER_DAYS = 30;

const router = Router();
router.use(authenticate, requirePermission(Permission.UseCounter));

/** The tablet is signed in to one store; it always books for that store. */
function counterStoreId(req: Request): string | null {
  return req.user?.storeIds[0] ?? null;
}

/** Walk-ins start now (to the minute) and run whole days from there. */
export function counterWindow(days: number, nowMs = Date.now()) {
  const pickupMs = Math.floor(nowMs / 60_000) * 60_000;
  return {
    pickupDatetime: new Date(pickupMs).toISOString(),
    dropoffDatetime: new Date(pickupMs + days * MS_PER_DAY).toISOString(),
  };
}

function storeLocationId(locations: Location[]): number | null {
  const active = locations.filter((l) => l.isActive !== false);
  const store = active.find((l) => (l.locationType === 'store' || l.locationType === null)
    && Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0);
  const pick = store ?? active[0];
  return pick ? Number(pick.id) : null;
}

const days = z.coerce.number().int().min(1).max(MAX_COUNTER_DAYS);

router.get('/options', validateQuery(z.object({ days })), async (req, res, next) => {
  try {
    const storeId = counterStoreId(req);
    if (!storeId) {
      res.status(403).json({ success: false, error: { message: 'This tablet has no store assigned' } });
      return;
    }
    const rentalDays = Number(req.query.days);
    const window = counterWindow(rentalDays);
    const { bookingPort, configRepo } = req.app.locals.deps;
    const [available, locations] = await Promise.all([
      checkAvailability({ bookingPort }, { storeId, ...window }) as Promise<AvailableModel[]>,
      configRepo.getLocations(storeId) as Promise<Location[]>,
    ]);
    const locationId = storeLocationId(locations);

    const models = await Promise.all(
      available
        .filter((m) => m.availableCount > 0)
        .map(async (m) => {
          const quote = locationId === null ? null : await computeQuote(
            { configRepo },
            { storeId, vehicleModelId: m.modelId, ...window, pickupLocationId: locationId, dropoffLocationId: locationId },
          ).catch(() => null);
          return {
            modelId: m.modelId,
            modelName: m.modelName,
            availableCount: m.availableCount,
            dailyRate: quote?.dailyRate ?? null,
            total: quote?.grandTotal ?? null,
            securityDeposit: quote?.securityDeposit ?? null,
          };
        }),
    );

    res.json({ success: true, data: { storeId, rentalDays, ...window, models } });
  } catch (err) {
    next(err);
  }
});

const CounterBookingSchema = z.object({
  vehicleModelId: z.string().min(1),
  days,
  customerName: z.string().trim().min(1).max(120),
  customerMobile: WhatsAppNumberSchema,
  customerEmail: z.string().trim().email(),
});

router.post('/bookings', validateBody(CounterBookingSchema), async (req, res, next) => {
  try {
    const storeId = counterStoreId(req);
    if (!storeId) {
      res.status(403).json({ success: false, error: { message: 'This tablet has no store assigned' } });
      return;
    }
    const body = req.body as z.infer<typeof CounterBookingSchema>;
    const window = counterWindow(body.days);
    const { bookingPort, configRepo } = req.app.locals.deps;

    const available = (await checkAvailability({ bookingPort }, { storeId, ...window })) as AvailableModel[];
    const model = available.find((m) => m.modelId === body.vehicleModelId);
    if (!model || model.availableCount < 1) {
      res.status(409).json({
        success: false,
        error: { code: 'VEHICLE_UNAVAILABLE', message: 'Sorry, that bike was just taken. Please choose another one.' },
      });
      return;
    }

    const locationId = storeLocationId((await configRepo.getLocations(storeId)) as Location[]);
    const quote = locationId === null ? null : await computeQuote(
      { configRepo },
      { storeId, vehicleModelId: body.vehicleModelId, ...window, pickupLocationId: locationId, dropoffLocationId: locationId },
    ).catch(() => null);

    const source = resolveSourceFromStore(storeId);
    const orderReference = await uniqueWalkInReference(source);
    const { error } = await supabase.from('orders_raw').insert({
      source,
      booking_channel: 'walk_in',
      via_counter: true,
      status: 'unprocessed',
      store_id: storeId,
      customer_name: body.customerName,
      customer_email: body.customerEmail,
      customer_mobile: body.customerMobile,
      vehicle_model_id: body.vehicleModelId,
      pickup_datetime: window.pickupDatetime,
      dropoff_datetime: window.dropoffDatetime,
      pickup_location_id: locationId,
      dropoff_location_id: locationId,
      web_quote_raw: quote?.grandTotal ?? null,
      rental_value_raw: quote?.rentalSubtotal ?? null,
      order_reference: orderReference,
    });
    if (error) {
      if (/ALLOCATION_CONFLICT|VEHICLE_UNAVAILABLE/.test(error.message)) {
        res.status(409).json({
          success: false,
          error: { code: 'VEHICLE_UNAVAILABLE', message: 'Sorry, that bike was just taken. Please choose another one.' },
        });
        return;
      }
      throw new Error(error.message);
    }

    res.status(201).json({ success: true, data: { orderReference } });
  } catch (err) {
    next(err);
  }
});

export { router as counterRoutes };
