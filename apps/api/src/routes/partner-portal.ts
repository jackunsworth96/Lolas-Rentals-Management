import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { SubmitDirectBookingRequestSchema, type SubmitDirectBookingInput } from '@lolas/shared';
import type { HoldRow } from '@lolas/domain';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticatePartner } from '../middleware/authenticate-partner.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { createBookingPaymentSession } from './xendit.js';
import { publicWebOriginFromEnv } from '../lib/public-web-url.js';
import { escapeHtml, sendEmailChecked } from '../services/email.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { createHold } from '../use-cases/booking/create-hold.js';
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
  .omit({ sessionToken: true, storeId: true, partnerRef: true, holdId: true, webPaymentMethod: true })
  .extend({
    paymentMode: z.enum(['at_lolas', 'remote_card']).default('at_lolas'),
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

async function loadPartnerGroup(groupRef: string, partner: { partnerId: string; partnerSlug: string; storeId: string }) {
  const sb = getSupabaseClient();
  const { data: group, error: groupError } = await sb.from('partner_booking_groups')
    .select('status,expected_count,partner_id,store_id').eq('group_ref', groupRef).maybeSingle();
  if (groupError) throw new Error(groupError.message);
  if (!group || group.partner_id !== partner.partnerId || group.store_id !== partner.storeId) return null;
  const { data: rows, error } = await sb.from('orders_raw')
    .select('id,order_reference,cancellation_token,customer_email,store_id,partner_ref,xendit_payment_session_id,web_payment_method')
    .eq('partner_booking_group_ref', groupRef).order('id');
  if (error) throw new Error(error.message);
  if (group.status !== 'complete' || !rows?.length || rows.length !== group.expected_count
    || rows.some((row) => row.partner_ref !== partner.partnerSlug || row.store_id !== partner.storeId
      || row.web_payment_method !== 'xendit' || row.customer_email !== rows[0]!.customer_email)) return null;
  return rows;
}

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

    const effectiveGrandTotal = benefit.rentalSubtotal + benefit.pickupFee + benefit.dropoffFee + quote.addonsTotal;
    const { data: cardMethod, error: cardMethodError } = await getSupabaseClient().from('payment_methods')
      .select('surcharge_percent').eq('id', 'xendit').eq('gateway_provider', 'xendit').eq('is_active', true).maybeSingle();
    if (cardMethodError) throw new Error(cardMethodError.message);
    const cardSurcharge = cardMethod
      ? Math.round((effectiveGrandTotal * Number(cardMethod.surcharge_percent ?? 0) / 100 + Number.EPSILON) * 100) / 100
      : null;
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
        grandTotal: effectiveGrandTotal,
        cardSurcharge,
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
    const { roomReference, vehicles: requestedVehicles, paymentMode, ...body } = req.body as z.infer<typeof PartnerBookSchema>;
    assertPartnerLeadTime(body.pickupDatetime);
    if (paymentMode === 'remote_card') {
      const { data: method, error: methodError } = await getSupabaseClient().from('payment_methods')
        .select('id').eq('id', 'xendit').eq('gateway_provider', 'xendit').eq('is_active', true).maybeSingle();
      if (methodError) throw new Error(methodError.message);
      if (!method) { res.status(409).json({ success: false, error: { code: 'CARD_PAYMENT_UNAVAILABLE', message: 'Card checkout is unavailable' } }); return; }
    }
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
      addonIds: await activeAddonIds(req.app.locals.deps.configRepo, partner.storeId, body.addonIds, body.dropoffDatetime),
      sessionToken,
      storeId: partner.storeId,
      partnerRef: partner.partnerSlug,
      webPaymentMethod: paymentMode === 'remote_card' ? 'xendit' : undefined,
      extraComments,
    };
    delete (commonInput as { vehicles?: unknown }).vehicles;
    delete (commonInput as { vehicleModelId?: unknown }).vehicleModelId;

    if (paymentMode === 'remote_card') {
      for (const vehicle of vehicles) {
        const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
          storeId: partner.storeId,
          vehicleModelId: vehicle.vehicleModelId,
          pickupDatetime: body.pickupDatetime,
          dropoffDatetime: body.dropoffDatetime,
          pickupLocationId: body.pickupLocationId,
          dropoffLocationId: body.dropoffLocationId,
          addonIds: commonInput.addonIds,
        });
        if (!Number.isFinite(quote.grandTotal) || quote.grandTotal <= 0) {
          res.status(409).json({ success: false, error: { code: 'QUOTE_UNAVAILABLE', message: 'A vehicle cannot be priced for card checkout' } });
          return;
        }
      }
    }

    const { error: groupError } = await getSupabaseClient().from('partner_booking_groups').insert({
      group_ref: groupRef, partner_id: partner.partnerId, store_id: partner.storeId,
      expected_count: vehicles.length, status: 'creating',
    });
    if (groupError) throw new Error(`Could not reserve partner booking group: ${groupError.message}`);

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
    try {
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
    } catch (error) {
      await getSupabaseClient().from('partner_booking_groups')
        .update({ status: 'incomplete' }).eq('group_ref', groupRef);
      const { data: created, error: lookupError } = await getSupabaseClient().from('orders_raw')
        .select('id,order_reference,vehicle_model_id,driver_name')
        .eq('partner_booking_group_ref', groupRef).eq('partner_ref', partner.partnerSlug);
      if (lookupError) throw error;
      if (!created?.length) throw error;
      res.status(201).json({ success: true, data: {
        id: created[0]!.id, orderReference: created[0]!.order_reference, groupRef,
        paymentMode, incomplete: true,
        bookings: created.map((row) => ({
          id: row.id, orderReference: row.order_reference, vehicleModelId: row.vehicle_model_id,
          driverName: row.driver_name,
        })),
      } });
      return;
    }

    const { data: completedGroup, error: completeError } = await getSupabaseClient().from('partner_booking_groups')
      .update({ status: 'complete' }).eq('group_ref', groupRef).eq('status', 'creating')
      .select('group_ref').maybeSingle();
    if (completeError || !completedGroup) {
      await getSupabaseClient().from('partner_booking_groups')
        .update({ status: 'incomplete' }).eq('group_ref', groupRef).eq('status', 'creating');
      res.status(201).json({ success: true, data: {
        id: results[0]?.id, orderReference: results[0]?.orderReference,
        groupRef, paymentMode, incomplete: true,
        bookings: results.map(({ cancellationToken: _token, ...booking }) => booking),
      } });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        id: results[0]?.id,
        orderReference: results[0]?.orderReference,
        groupRef,
        paymentMode,
        incomplete: false,
        bookings: results.map(({ cancellationToken: _token, ...booking }) => booking),
      },
    });
  } catch (err) { next(err); }
});

router.get('/book/:groupRef/checkout', async (req, res, next) => {
  try {
    const rows = await loadPartnerGroup(req.params.groupRef as string, req.partnerUser!);
    if (!rows) { res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking group not found' } }); return; }
    const sessionId = rows[0]!.xendit_payment_session_id;
    if (sessionId && rows.some((row) => row.xendit_payment_session_id !== sessionId)) {
      res.status(409).json({ success: false, error: { code: 'INCOMPLETE_CHECKOUT', message: 'Booking group checkout needs staff review' } });
      return;
    }
    const { data: session, error } = sessionId
      ? await getSupabaseClient().from('xendit_payment_sessions')
        .select('id,status,payment_link_url,expires_at,amount_php,link_email_sent_at,link_email_attempts')
        .eq('id', sessionId).maybeSingle()
      : { data: null, error: null };
    if (error) throw new Error(error.message);
    const waiverLinks = rows.map((row) => ({ reference: row.order_reference,
      url: `${publicWebOriginFromEnv(process.env.WEB_URL)}/waiver/${encodeURIComponent(row.order_reference)}` }));
    res.json({ success: true, data: { sessionId: session?.id ?? null, status: session?.status ?? 'unpaid',
      checkoutUrl: session?.status === 'active' && session.expires_at && new Date(session.expires_at).getTime() > Date.now() ? session.payment_link_url : null,
      expiresAt: session?.expires_at ?? null, amountPHP: session ? Number(session.amount_php) : null,
      emailAcceptedAt: session?.link_email_sent_at ?? null, emailAttempts: session?.link_email_attempts ?? 0, waiverLinks } });
  } catch (error) { next(error); }
});

router.post('/book/:groupRef/checkout', async (req, res, next) => {
  try {
    const rows = await loadPartnerGroup(req.params.groupRef as string, req.partnerUser!);
    if (!rows) { res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking group not found or incomplete' } }); return; }
    await createBookingPaymentSession(rows.map((row) => ({ id: row.id, cancellationToken: row.cancellation_token })), res, next);
  } catch (error) { next(error); }
});

router.post('/book/:groupRef/send-links', validateBody(z.object({ sessionId: z.string().uuid(), resend: z.boolean().default(false) })), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const rows = await loadPartnerGroup(req.params.groupRef as string, req.partnerUser!);
    if (!rows || rows.some((row) => row.xendit_payment_session_id !== req.body.sessionId)) {
      res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking group not found' } });
      return;
    }
    const { data: allocations, error: allocationError } = await sb.from('xendit_payment_session_orders')
      .select('raw_order_id').eq('session_id', req.body.sessionId);
    if (allocationError) throw new Error(allocationError.message);
    const bookedIds = new Set(rows.map((row) => row.id));
    if (allocations?.length !== rows.length || allocations.some((row) => !bookedIds.has(row.raw_order_id))) {
      res.status(409).json({ success: false, error: { code: 'INCOMPLETE_CHECKOUT', message: 'Checkout does not cover the whole booking group' } });
      return;
    }
    const { data: session, error: sessionError } = await sb.from('xendit_payment_sessions')
      .select('status, payment_link_url, expires_at').eq('id', req.body.sessionId).eq('store_id', req.partnerUser!.storeId).maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session || session.status !== 'active' || !session.payment_link_url
      || !session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
      res.status(409).json({ success: false, error: { code: 'CHECKOUT_UNAVAILABLE', message: 'Checkout is no longer active' } });
      return;
    }
    const origin = publicWebOriginFromEnv(process.env.WEB_URL);
    const waiverLinks = rows.map((row) => ({
      reference: row.order_reference,
      url: `${origin}/waiver/${encodeURIComponent(row.order_reference)}`,
    }));
    const links = { checkoutUrl: session.payment_link_url, waiverLinks };
    const { data: claimed, error: claimError } = await sb.rpc('claim_xendit_link_email', {
      p_session_id: req.body.sessionId, p_resend: req.body.resend,
    });
    if (claimError) throw new Error(claimError.message);
    if (!claimed) { res.status(409).json({ success: false, error: { code: 'EMAIL_NOT_AVAILABLE', message: 'Link is expired, already sent, or a send is in progress' } }); return; }
    try {
      await sendEmailChecked({
        to: rows[0]!.customer_email,
        subject: `Your Lola's Rentals booking ${req.params.groupRef}`,
        html: `<p>Your booking references: ${waiverLinks.map((link) => escapeHtml(link.reference)).join(', ')}</p>`
          + `<p><a href="${escapeHtml(links.checkoutUrl)}">Pay rental online</a></p>`
          + waiverLinks.map((link) => `<p><a href="${escapeHtml(link.url)}">Sign waiver for ${escapeHtml(link.reference)}</a></p>`).join(''),
      });
    } catch (error) {
      console.error('[partner-book] Link email failed:', error);
      await sb.from('xendit_payment_sessions').update({ link_email_claimed_at: null }).eq('id', req.body.sessionId);
      res.status(502).json({ success: false, error: { code: 'EMAIL_NOT_ACCEPTED', message: 'Email was not accepted. The booking and payment link remain available.' } });
      return;
    }
    const { error: markError } = await sb.from('xendit_payment_sessions')
      .update({ link_email_sent_at: new Date().toISOString(), link_email_claimed_at: null }).eq('id', req.body.sessionId);
    if (markError) throw new Error(`Email was accepted but send status could not be recorded: ${markError.message}`);
    res.json({ success: true, data: { ...links, accepted: true } });
  } catch (error) { next(error); }
});

export { router as partnerPortalRoutes };
