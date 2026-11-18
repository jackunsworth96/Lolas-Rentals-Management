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
import { publicWebOriginFromEnv } from '../lib/public-web-url.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { sendEmail, walkInReservationConfirmationHtml, escapeHtml } from '../services/email.js';
import { sendBookingConfirmationWhatsApp } from '../services/booking-confirmation-whatsapp.js';
import { formatManilaDateTime } from '../utils/manila-date.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const MANILA_OFFSET_MS = 8 * 60 * MS_PER_MINUTE;
/** Pickup/return slots: 9:15 AM to 4:45 PM every 30 minutes, Manila time (same as the walk-in modal). */
const FIRST_SLOT_MIN = 9 * 60 + 15;
const LAST_SLOT_MIN = 16 * 60 + 45;
const SLOT_STEP_MIN = 30;
export const MAX_COUNTER_DAYS = 30;
/** Fully booked models get one follow-up availability check each; this caps the extra queries. */
const MAX_NEXT_FREE_CHECKS = 8;

const router = Router();
router.use(authenticate, requirePermission(Permission.UseCounter));

/** The tablet is signed in to one store; it always books for that store. */
function counterStoreId(req: Request): string | null {
  return req.user?.storeIds[0] ?? null;
}

function manilaDay(ms: number) {
  const local = ms + MANILA_OFFSET_MS;
  const dayStartMs = Math.floor(local / MS_PER_DAY) * MS_PER_DAY - MANILA_OFFSET_MS;
  return { dayStartMs, minutes: (local - (dayStartMs + MANILA_OFFSET_MS)) / MS_PER_MINUTE };
}

/** The slot closest to `ms` on the same Manila day (clamped to opening hours). */
export function nearestSlot(ms: number): number {
  const { dayStartMs, minutes } = manilaDay(ms);
  const clamped = Math.min(Math.max(minutes, FIRST_SLOT_MIN), LAST_SLOT_MIN);
  const slot = FIRST_SLOT_MIN + Math.round((clamped - FIRST_SLOT_MIN) / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  return dayStartMs + slot * MS_PER_MINUTE;
}

/** The first slot at or after `ms`, rolling to 9:15 the next morning after closing. */
export function nextSlotFrom(ms: number): number {
  const { dayStartMs, minutes } = manilaDay(ms);
  if (minutes <= FIRST_SLOT_MIN) return dayStartMs + FIRST_SLOT_MIN * MS_PER_MINUTE;
  const slot = FIRST_SLOT_MIN + Math.ceil((minutes - FIRST_SLOT_MIN) / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  if (slot > LAST_SLOT_MIN) return dayStartMs + MS_PER_DAY + FIRST_SLOT_MIN * MS_PER_MINUTE;
  return dayStartMs + slot * MS_PER_MINUTE;
}

function windowFrom(pickupMs: number, days: number) {
  return {
    pickupDatetime: new Date(pickupMs).toISOString(),
    dropoffDatetime: new Date(pickupMs + days * MS_PER_DAY).toISOString(),
  };
}

/** Walk-ins start at the nearest time slot and return in the same slot whole days later. */
export function counterWindow(days: number, nowMs = Date.now()) {
  return windowFrom(nearestSlot(nowMs), days);
}

function storeLocation(locations: Location[]): Location | null {
  const active = locations.filter((l) => l.isActive !== false);
  const store = active.find((l) => (l.locationType === 'store' || l.locationType === null)
    && Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0);
  return store ?? active[0] ?? null;
}

/**
 * For each fully booked model, the earliest slot from which it is free for the whole
 * requested length. Availability only gives a hint (when the blocking booking clears),
 * so each hint is re-checked for the full duration before it is shown.
 */
async function nextFreeStarts(
  deps: { bookingPort: unknown },
  storeId: string,
  days: number,
  fullyBooked: AvailableModel[],
): Promise<Map<string, string>> {
  const byStart = new Map<number, string[]>();
  for (const m of fullyBooked) {
    if (!m.nextAvailablePickup) continue;
    const startMs = nextSlotFrom(Date.parse(m.nextAvailablePickup));
    if (!Number.isFinite(startMs)) continue;
    byStart.set(startMs, [...(byStart.get(startMs) ?? []), m.modelId]);
  }
  const result = new Map<string, string>();
  const checks = [...byStart.entries()].slice(0, MAX_NEXT_FREE_CHECKS);
  await Promise.all(checks.map(async ([startMs, modelIds]) => {
    const later = (await checkAvailability(
      deps as Parameters<typeof checkAvailability>[0],
      { storeId, ...windowFrom(startMs, days) },
    ).catch(() => [])) as AvailableModel[];
    for (const id of modelIds) {
      if ((later.find((l) => l.modelId === id)?.availableCount ?? 0) > 0) {
        result.set(id, new Date(startMs).toISOString());
      }
    }
  }));
  return result;
}

const UNAVAILABLE = {
  success: false,
  error: { code: 'VEHICLE_UNAVAILABLE', message: 'Sorry, that vehicle was just taken. Please choose another one.' },
};

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
    const [models, locations] = await Promise.all([
      checkAvailability({ bookingPort }, { storeId, ...window }) as Promise<AvailableModel[]>,
      configRepo.getLocations(storeId) as Promise<Location[]>,
    ]);
    const location = storeLocation(locations);
    const nextFree = await nextFreeStarts({ bookingPort }, storeId, rentalDays, models.filter((m) => m.availableCount < 1));

    const options = await Promise.all(models.map(async (m) => {
      const quote = location === null ? null : await computeQuote(
        { configRepo },
        { storeId, vehicleModelId: m.modelId, ...window, pickupLocationId: Number(location.id), dropoffLocationId: Number(location.id) },
      ).catch(() => null);
      return {
        modelId: m.modelId,
        modelName: m.modelName,
        availableCount: m.availableCount,
        nextFreePickup: m.availableCount > 0 ? null : nextFree.get(m.modelId) ?? null,
        dailyRate: quote?.dailyRate ?? null,
        total: quote?.grandTotal ?? null,
        securityDeposit: quote?.securityDeposit ?? null,
      };
    }));
    options.sort((a, b) => Number(b.availableCount > 0) - Number(a.availableCount > 0));

    res.json({ success: true, data: { storeId, rentalDays, ...window, models: options } });
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
      res.status(409).json(UNAVAILABLE);
      return;
    }

    const location = storeLocation((await configRepo.getLocations(storeId)) as Location[]);
    const locationId = location === null ? null : Number(location.id);
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
        res.status(409).json(UNAVAILABLE);
        return;
      }
      throw new Error(error.message);
    }

    const locationName = location?.name ?? 'Store';
    const pickup = formatManilaDateTime(window.pickupDatetime);
    const dropoff = formatManilaDateTime(window.dropoffDatetime);

    void sendTelegramAlert(
      `📋 <b>Counter booking (in store)</b>\n` +
        `Reference: ${escapeHtml(orderReference)}\n` +
        `Customer: ${escapeHtml(body.customerName)} · ${escapeHtml(body.customerMobile)}\n` +
        `Vehicle: ${escapeHtml(model.modelName)}\n` +
        `Pickup: ${escapeHtml(pickup)}\n` +
        `Return: ${escapeHtml(dropoff)}` +
        (quote ? `\n💰 <b>Est. Total:</b> ₱${quote.grandTotal.toLocaleString('en-PH')}` : '') +
        `\nStore: ${escapeHtml(storeId)}`,
      getTelegramChatId('ops'),
    );

    void sendEmail({
      to: body.customerEmail,
      subject: `Reservation Confirmed — ${orderReference} | Lola's Rentals`,
      html: walkInReservationConfirmationHtml({
        customerName: body.customerName,
        orderReference,
        vehicleName: model.modelName,
        pickupDatetime: pickup,
        dropoffDatetime: dropoff,
        pickupLocation: locationName,
        dropoffLocation: locationName,
        rentalDays: quote?.rentalDays,
        dailyRate: quote?.dailyRate,
        rentalSubtotal: quote?.rentalSubtotal,
        pickupFee: undefined,
        dropoffFee: undefined,
        discount: undefined,
        estimatedTotal: quote?.grandTotal,
        depositAmount: undefined,
        depositMethod: undefined,
        whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639694443413',
      }),
    });

    sendBookingConfirmationWhatsApp({
      customerName: body.customerName,
      customerMobile: body.customerMobile,
      orderReference,
      vehicleName: model.modelName,
      pickupDatetime: pickup,
      dropoffDatetime: dropoff,
      pickupLocation: locationName,
      dropoffLocation: locationName,
      waiverUrl: `${publicWebOriginFromEnv(process.env.WEB_URL)}/waiver/${orderReference}`,
      source: 'counter-confirmation',
    });

    res.status(201).json({ success: true, data: { orderReference } });
  } catch (err) {
    next(err);
  }
});

export { router as counterRoutes };
