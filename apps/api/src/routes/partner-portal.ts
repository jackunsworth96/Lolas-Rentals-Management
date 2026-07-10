import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { SubmitDirectBookingRequestSchema, type SubmitDirectBookingInput } from '@lolas/shared';
import type { HoldRow } from '@lolas/domain';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticatePartner } from '../middleware/authenticate-partner.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { createHold } from '../use-cases/booking/create-hold.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { submitDirectBooking } from '../use-cases/booking/submit-direct-booking.js';
import { getPartnerCommissionStats } from '../lib/partner-commission.js';
import {
  applyPartnerBenefit,
  isBenefitEligibleForPickup,
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
  })
  .refine((body) => Boolean(body.vehicleModelId || (body.vehicles && body.vehicles.length > 0)), {
    message: 'Select at least one vehicle',
    path: ['vehicles'],
  });

const MIN_PARTNER_LEAD_MS = 2 * 60 * 60 * 1000;

function assertPartnerLeadTime(pickupDatetime: string): void {
  const pickup = new Date(pickupDatetime);
  if (Number.isNaN(pickup.getTime())) {
    const err = new Error('Invalid pickup datetime');
    (err as Error & { statusCode?: number }).statusCode = 422;
    throw err;
  }
  if (pickup.getTime() - Date.now() < MIN_PARTNER_LEAD_MS) {
    const err = new Error('Partner portal bookings need at least 2 hours notice from the pickup time.');
    (err as Error & { statusCode?: number }).statusCode = 422;
    throw err;
  }
}

function partnerGroupRef(slug: string): string {
  return `PG-${slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PARTNER'}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function activeAddonIds(configRepo: { getAddons(storeId: string): Promise<Array<{ id: number | string; isActive?: boolean }>> }, storeId: string, addonIds?: number[]): Promise<number[] | undefined> {
  if (!addonIds || addonIds.length === 0) return undefined;
  const addons = await configRepo.getAddons(storeId);
  const activeIds = new Set(
    addons
      .filter((addon) => addon.isActive !== false)
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
      .select('id, slug, name, store_id, deal_type, commission_type, commission_value, advance_booking_days, commission_includes_extensions, discount_type, discount_value, free_delivery, portal_enabled, portal_subdomain, logo_url, welcome_message, logo_display_width, logo_display_height')
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
      { storeId: req.partnerUser!.storeId, pickupDatetime, dropoffDatetime },
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
    const validAddonIds = await activeAddonIds(req.app.locals.deps.configRepo, partner.storeId, addonIds);
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
    const eligible = validatedPartner
      ? isBenefitEligibleForPickup(validatedPartner, pickupDatetime, new Date(), vehicleModelId)
      : false;
    const benefit = validatedPartner && eligible
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
    const { roomReference, vehicles: requestedVehicles, ...body } = req.body as z.infer<typeof PartnerBookSchema>;
    assertPartnerLeadTime(body.pickupDatetime);
    const sessionToken = `partner-${randomBytes(24).toString('hex')}`;
    const vehicles = requestedVehicles && requestedVehicles.length > 0
      ? requestedVehicles
      : [{ vehicleModelId: body.vehicleModelId as string, driverName: body.customerName }];
    const groupRef = partnerGroupRef(partner.partnerSlug);

    const extraComments = [
      body.extraComments?.trim() || null,
      roomReference?.trim() ? `Partner room/reference: ${roomReference.trim()}` : null,
      `Booked by partner portal: ${partner.partnerSlug}`,
    ].filter(Boolean).join('\n');

    const commonInput = {
      ...body,
      addonIds: await activeAddonIds(req.app.locals.deps.configRepo, partner.storeId, body.addonIds),
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
    for (const vehicle of vehicles) {
      const hold = await createHold(
        { bookingPort: req.app.locals.deps.bookingPort },
        {
          vehicleModelId: vehicle.vehicleModelId,
          storeId: partner.storeId,
          pickupDatetime: body.pickupDatetime,
          dropoffDatetime: body.dropoffDatetime,
          sessionToken,
        },
      );
      holds.push({ vehicle, hold });
    }

    const results: Array<{
      id: string;
      orderReference: string;
      cancellationToken: string;
      serverQuote: number | null;
      charityDonation: number;
      vehicleModelId: string;
      driverName: string;
    }> = [];
    for (const { vehicle, hold } of holds) {
      const driverName = vehicle.driverName?.trim() || body.customerName;
      const input: SubmitDirectBookingInput = {
        ...commonInput,
        vehicleModelId: vehicle.vehicleModelId,
        holdId: hold.id,
      } as SubmitDirectBookingInput;

      const result = await submitDirectBooking(
        {
          bookingPort: req.app.locals.deps.bookingPort,
          configRepo: req.app.locals.deps.configRepo,
          transferRepo: req.app.locals.deps.transferRepo,
          accountingPort: req.app.locals.deps.accountingPort,
        },
        input,
        { deviceType: 'desktop', partnerBookingGroupRef: groupRef, driverName },
      );

      results.push({ ...result, vehicleModelId: vehicle.vehicleModelId, driverName });
    }

    res.status(201).json({
      success: true,
      data: {
        id: results[0]?.id,
        orderReference: results[0]?.orderReference,
        groupRef,
        bookings: results,
      },
    });
  } catch (err) { next(err); }
});

export { router as partnerPortalRoutes };
