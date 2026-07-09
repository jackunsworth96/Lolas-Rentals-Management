import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { SubmitDirectBookingRequestSchema, type SubmitDirectBookingInput } from '@lolas/shared';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticatePartner } from '../middleware/authenticate-partner.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { createHold } from '../use-cases/booking/create-hold.js';
import { submitDirectBooking } from '../use-cases/booking/submit-direct-booking.js';
import { getPartnerCommissionStats } from '../lib/partner-commission.js';

const router = Router();

router.use(authenticatePartner);

const AvailabilityQuerySchema = z.object({
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
});

const MonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

const PartnerBookSchema = SubmitDirectBookingRequestSchema
  .omit({ sessionToken: true, storeId: true, partnerRef: true, holdId: true })
  .extend({
    roomReference: z.string().max(120).optional(),
  });

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
    const data = await checkAvailability(
      { bookingPort: req.app.locals.deps.bookingPort },
      { storeId: req.partnerUser!.storeId, pickupDatetime, dropoffDatetime },
    );
    res.json({ success: true, data });
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
    const { roomReference, ...body } = req.body as z.infer<typeof PartnerBookSchema>;
    const sessionToken = `partner-${randomBytes(24).toString('hex')}`;

    const hold = await createHold(
      { bookingPort: req.app.locals.deps.bookingPort },
      {
        vehicleModelId: body.vehicleModelId,
        storeId: partner.storeId,
        pickupDatetime: body.pickupDatetime,
        dropoffDatetime: body.dropoffDatetime,
        sessionToken,
      },
    );

    const extraComments = [
      body.extraComments?.trim() || null,
      roomReference?.trim() ? `Partner room/reference: ${roomReference.trim()}` : null,
      `Booked by partner portal: ${partner.partnerSlug}`,
    ].filter(Boolean).join('\n');

    const input: SubmitDirectBookingInput = {
      ...body,
      sessionToken,
      holdId: hold.id,
      storeId: partner.storeId,
      partnerRef: partner.partnerSlug,
      extraComments,
    };

    const result = await submitDirectBooking(
      {
        bookingPort: req.app.locals.deps.bookingPort,
        configRepo: req.app.locals.deps.configRepo,
        transferRepo: req.app.locals.deps.transferRepo,
        accountingPort: req.app.locals.deps.accountingPort,
      },
      input,
      { deviceType: 'desktop' },
    );

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as partnerPortalRoutes };
