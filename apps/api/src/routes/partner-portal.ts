import { createBookingAdapter } from '../adapters/supabase/booking-adapter.js';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { SubmitDirectBookingRequestSchema, type SubmitDirectBookingInput } from '@lolas/shared';
import type { HoldRow } from '@lolas/domain';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticatePartner } from '../middleware/authenticate-partner.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { submitDirectBooking } from '../use-cases/booking/submit-direct-booking.js';
import { getPartnerCommissionStats } from '../lib/partner-commission.js';
import {
  applyPartnerBenefit,
  lookupActivePartnerBySlug,
} from '../lib/partner-benefit.js';

const router = Router();

router.use(authenticatePartner);

const AvailabilityQuerySchema = z.object({
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
});

const QuoteQuerySchema = z.object({
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

const MonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

const PartnerBookSchema = SubmitDirectBookingRequestSchema
  .omit({ sessionToken: true, storeId: true, partnerRef: true, holdId: true })
  .extend({
    vehicleModelId: z.string().min(1).optional(),
    vehicles: z.array(z.object({
      vehicleModelId: z.string().min(1),
      driverName: z.string().max(160).optional().nullable(),
    })).min(1).max(12).optional(),
    roomReference: z.string().max(120).optional(),
    requestKey: z.string().uuid().optional(),
  })
  .refine((body) => Boolean(body.vehicleModelId || (body.vehicles && body.vehicles.length > 0)), {
    message: 'Select at least one vehicle',
    path: ['vehicles'],
  });

const MIN_PARTNER_LEAD_MS = 15 * 60 * 1000;

/** Manila-time "9:15 AM" style label for a given instant. */
function manilaTimeLabel(date: Date): string {
  return date.toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function assertPartnerLeadTime(pickupDatetime: string): void {
  const pickup = new Date(pickupDatetime);
  if (Number.isNaN(pickup.getTime())) {
    const err = new Error('Invalid pickup datetime');
    (err as Error & { statusCode?: number }).statusCode = 422;
    throw err;
  }
  if (pickup.getTime() - Date.now() < MIN_PARTNER_LEAD_MS) {
    const earliestLabel = manilaTimeLabel(new Date(Date.now() + MIN_PARTNER_LEAD_MS));
    const err = new Error(
      `We need at least 15 minutes' notice, but it's likely we can get to you sooner than that — ` +
      `go ahead and book for ${earliestLabel} or later and we'll aim to be there by then. ` +
      `Need us there ASAP? Send us a message so we can make you a priority.`,
    );
    (err as Error & { statusCode?: number }).statusCode = 422;
    throw err;
  }
}

function partnerGroupRef(slug: string): string {
  return `PG-${slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PARTNER'}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function isNinePmReturnAddonName(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.includes('return') && (
    /\b9\s*pm\b/i.test(name) ||
    normalized.includes('9pm') ||
    normalized.includes('21:00') ||
    normalized.includes('ninepm')
  );
}

function allowsNinePmReturn(dropoffDatetime: string): boolean {
  return dropoffDatetime.includes('T16:45');
}

async function activeAddonIds(
  configRepo: { getAddons(storeId: string): Promise<Array<{ id: number | string; name?: string; isActive?: boolean }>> },
  storeId: string,
  addonIds?: number[],
  dropoffDatetime?: string,
): Promise<number[] | undefined> {
  if (!addonIds || addonIds.length === 0) return undefined;
  const addons = await configRepo.getAddons(storeId);
  const activeIds = new Set(
    addons
      .filter((addon) => addon.isActive !== false)
      .filter((addon) => !dropoffDatetime || allowsNinePmReturn(dropoffDatetime) || !isNinePmReturnAddonName(addon.name ?? ''))
      .map((addon) => Number(addon.id))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
  const filtered = Array.from(new Set(addonIds)).filter((id) => activeIds.has(id));
  return filtered.length > 0 ? filtered : undefined;
}

router.get('/me', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data: partner, error } = await sb
      .from('accommodation_partners')
      .select('id, slug, name, store_id, deal_type, commission_type, commission_value, advance_booking_days, commission_includes_extensions, discount_type, discount_value, free_delivery, free_delivery_location_ids, portal_enabled, portal_subdomain, logo_url, welcome_message, logo_display_width, logo_display_height')
      .eq('id', req.partnerUser!.partnerId)
      .single();
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { user: req.partnerUser, partner } });
  } catch (err) { next(err); }
});

router.get('/availability', validateQuery(AvailabilityQuerySchema), async (req, res, next) => {
  try {
    const { pickupDatetime, dropoffDatetime } = req.query as { pickupDatetime: string; dropoffDatetime: string };
    assertPartnerLeadTime(pickupDatetime);
    const data = await checkAvailability(
      { bookingPort: req.app.locals.deps.bookingPort },
      { storeId: req.partnerUser!.storeId, pickupDatetime, dropoffDatetime, partnerRef: req.partnerUser!.partnerSlug },
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/quote', validateQuery(QuoteQuerySchema), async (req, res, next) => {
  try {
    const partner = req.partnerUser!;
    const {
      vehicleModelId,
      pickupDatetime,
      dropoffDatetime,
      pickupLocationId,
      dropoffLocationId,
      addonIds,
    } = req.query as unknown as {
      vehicleModelId: string;
      pickupDatetime: string;
      dropoffDatetime: string;
      pickupLocationId: number;
      dropoffLocationId: number;
      addonIds?: number[];
    };

    assertPartnerLeadTime(pickupDatetime);
    const validAddonIds = await activeAddonIds(req.app.locals.deps.configRepo, partner.storeId, addonIds, dropoffDatetime);
    const quote = await computeQuote(
      { configRepo: req.app.locals.deps.configRepo },
      {
        storeId: partner.storeId,
        vehicleModelId,
        pickupDatetime,
        dropoffDatetime,
        pickupLocationId,
        dropoffLocationId,
        addonIds: validAddonIds,
      },
    );

    const validatedPartner = await lookupActivePartnerBySlug(partner.partnerSlug);
    const benefit = validatedPartner
      ? applyPartnerBenefit({
          partner: validatedPartner,
          rentalSubtotal: quote.rentalSubtotal,
          pickupFee: quote.pickupFee,
          dropoffFee: quote.dropoffFee,
          advanceDaysFromNow: (new Date(pickupDatetime).getTime() - Date.now()) / 86_400_000,
          vehicleModelId,
          pickupLocationId,
          dropoffLocationId,
        })
      : {
          rentalSubtotal: quote.rentalSubtotal,
          pickupFee: quote.pickupFee,
          dropoffFee: quote.dropoffFee,
          rentalDiscount: 0,
          deliveryDiscount: 0,
        };

    res.json({
      success: true,
      data: {
        ...quote,
        originalRentalSubtotal: quote.rentalSubtotal,
        originalPickupFee: quote.pickupFee,
        originalDropoffFee: quote.dropoffFee,
        rentalDiscount: benefit.rentalDiscount,
        deliveryDiscount: benefit.deliveryDiscount,
        effectiveRentalSubtotal: benefit.rentalSubtotal,
        effectivePickupFee: benefit.pickupFee,
        effectiveDropoffFee: benefit.dropoffFee,
        grandTotal:
          benefit.rentalSubtotal + benefit.pickupFee + benefit.dropoffFee + quote.addonsTotal,
      },
    });
  } catch (err) { next(err); }
});

router.get('/reports', validateQuery(MonthQuerySchema), async (req, res, next) => {
  try {
    const { month } = req.query as { month?: string };
    const data = await getPartnerCommissionStats(req.partnerUser!.partnerId, month);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/book', validateBody(PartnerBookSchema), async (req, res, next) => {
  try {
    const partner = req.partnerUser!;
    const { roomReference, requestKey, vehicles: requestedVehicles, ...body } = req.body as z.infer<typeof PartnerBookSchema>;
    assertPartnerLeadTime(body.pickupDatetime);
    const sessionToken = `partner-${randomBytes(24).toString('hex')}`;
    const vehicles = requestedVehicles && requestedVehicles.length > 0
      ? requestedVehicles
      : [{ vehicleModelId: body.vehicleModelId as string, driverName: body.customerName }];
    const groupRef = partnerGroupRef(partner.partnerSlug);
    const bookingRequestKey = requestKey ?? crypto.randomUUID();
    const findPriorGroup = async () => {
      const { data, error } = await getSupabaseClient().from('orders_raw')
        .select('id,order_reference,vehicle_model_id,driver_name,partner_booking_group_ref,booking_request_index')
        .eq('store_id', partner.storeId).eq('partner_ref', partner.partnerSlug)
        .eq('booking_request_key', bookingRequestKey).order('booking_request_index');
      if (error) throw new Error(error.message);
      if (!data?.length) return null;
      if (data.length !== vehicles.length) throw new Error('A previous booking request is still completing. Retry shortly.');
      return { id: data[0].id, orderReference: data[0].order_reference,
        groupRef: data[0].partner_booking_group_ref,
        bookings: data.map((row) => ({ id: row.id, orderReference: row.order_reference,
          vehicleModelId: row.vehicle_model_id, driverName: row.driver_name })) };
    };
    const prior = await findPriorGroup();
    if (prior) { res.status(200).json({ success: true, data: prior }); return; }

    const extraComments = [
      body.extraComments?.trim() || null,
      roomReference?.trim() ? `Partner room/reference: ${roomReference.trim()}` : null,
      `Booked by partner portal: ${partner.partnerSlug}`,
    ].filter(Boolean).join('\n');

    const commonInput = {
      ...body,
      addonIds: await activeAddonIds(req.app.locals.deps.configRepo, partner.storeId, body.addonIds, body.dropoffDatetime),
      sessionToken,
      storeId: partner.storeId,
      partnerRef: partner.partnerSlug,
      extraComments,
    };
    delete (commonInput as { vehicles?: unknown }).vehicles;
    delete (commonInput as { vehicleModelId?: unknown }).vehicleModelId;

    const holds: Array<{
      vehicle: { vehicleModelId: string; driverName?: string | null };
      hold: HoldRow;
    }> = [];
    const { data: holdRows, error: holdError } = await getSupabaseClient().rpc('allocation_insert_holds', {
      p_rows: vehicles.map((vehicle) => ({ vehicle_model_id: vehicle.vehicleModelId,
        store_id: partner.storeId, pickup_datetime: body.pickupDatetime, dropoff_datetime: body.dropoffDatetime,
        session_token: sessionToken, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), partner_ref: partner.partnerSlug })),
    });
    if (holdError) throw new Error(holdError.message);
    for (let i = 0; i < vehicles.length; i++) {
      const row = holdRows[i];
      holds.push({ vehicle: vehicles[i], hold: { id: row.id, vehicleModelId: row.vehicle_model_id,
        storeId: row.store_id, pickupDatetime: row.pickup_datetime, dropoffDatetime: row.dropoff_datetime,
        sessionToken: row.session_token, expiresAt: row.expires_at, createdAt: row.created_at } });
    }
    const pendingRows: Record<string, unknown>[] = [];
    const afterCommit: Array<() => Promise<void>> = [];
    const batchBookingPort = createBookingAdapter(pendingRows);

    const results: Array<{
      id: string;
      orderReference: string;
      cancellationToken: string;
      serverQuote: number | null;
      charityDonation: number;
      vehicleModelId: string;
      driverName: string;
    }> = [];
    try {
    for (const [index, { vehicle, hold }] of holds.entries()) {
      const driverName = vehicle.driverName?.trim() || body.customerName;
      const input: SubmitDirectBookingInput = {
        ...commonInput,
        vehicleModelId: vehicle.vehicleModelId,
        holdId: hold.id,
      } as SubmitDirectBookingInput;

      const result = await submitDirectBooking(
        {
          bookingPort: batchBookingPort,
          afterCommit,
          configRepo: req.app.locals.deps.configRepo,
          transferRepo: req.app.locals.deps.transferRepo,
          accountingPort: req.app.locals.deps.accountingPort,
        },
        input,
        { deviceType: 'desktop', partnerBookingGroupRef: groupRef, driverName, bookingRequestKey, bookingRequestIndex: index },
      );

      results.push({ ...result, vehicleModelId: vehicle.vehicleModelId, driverName });
    }

    const { error: batchError } = await getSupabaseClient().rpc('allocation_insert_bookings', { p_rows: pendingRows });
    if (batchError) {
      const existing = await findPriorGroup();
      if (existing) {
        await Promise.allSettled(holds.map(({ hold }) => getSupabaseClient().from('booking_holds').delete().eq('id', hold.id)));
        res.status(200).json({ success: true, data: existing }); return;
      }
      throw new Error(batchError.message);
    }
    await Promise.all(afterCommit.map((run) => run()));
    res.status(201).json({
      success: true,
      data: {
        id: results[0]?.id,
        orderReference: results[0]?.orderReference,
        groupRef,
        bookings: results,
      },
    });
    } catch (bookingError) {
      await Promise.allSettled(holds.map(({ hold }) => getSupabaseClient().from('booking_holds').delete().eq('id', hold.id)));
      throw bookingError;
    }
  } catch (err) { next(err); }
});

export { router as partnerPortalRoutes };
