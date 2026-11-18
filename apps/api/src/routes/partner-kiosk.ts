import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticatePartner } from '../middleware/authenticate-partner.js';
import { authenticatePartnerKiosk } from '../middleware/authenticate-partner-kiosk.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { verifyPin } from '../adapters/auth/password.js';
import { generatePartnerKioskToken } from '../adapters/auth/partner-jwt.js';
import {
  counterExtras,
  createCounterBooking,
  createCounterHold,
  deliveryAreas,
  listCounterOptions,
  partnerKioskContext,
  releaseCounterHold,
} from '../use-cases/counter/counter-booking.js';
import { counterErrors } from './counter.js';
import { CounterBookingSchema, CounterHoldSchema, CounterReleaseSchema, counterQuerySchema } from './counter-schemas.js';

const router = Router();

const exitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Please wait a few minutes.' } },
});

const deps = (req: Request) => ({ bookingPort: req.app.locals.deps.bookingPort, configRepo: req.app.locals.deps.configRepo });

/** A signed-in portal user turns this device into the front-desk tablet. */
router.post('/start', authenticatePartner, async (req, res, next) => {
  try {
    const user = req.partnerUser!;
    const token = generatePartnerKioskToken({
      scope: 'partner_kiosk',
      partnerUserId: user.partnerUserId,
      partnerId: user.partnerId,
      partnerSlug: user.partnerSlug,
      storeId: user.storeId,
    });
    res.json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
});

const ExitSchema = z.object({ pin: z.coerce.string().min(1).max(120) });

/** Any active portal user's PIN closes the tablet, so night staff can hand it back. */
router.post('/exit', exitLimiter, authenticatePartnerKiosk, validateBody(ExitSchema), async (req, res, next) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('partner_users')
      .select('pin_hash')
      .eq('partner_id', req.partnerKiosk!.partnerId)
      .eq('is_active', true);
    if (error) throw new Error(`Failed to check PIN: ${error.message}`);
    const pin = (req.body as z.infer<typeof ExitSchema>).pin;
    for (const row of (data ?? []) as Array<{ pin_hash: string }>) {
      if (await verifyPin(pin, row.pin_hash)) {
        res.json({ success: true, data: null });
        return;
      }
    }
    res.status(401).json({ success: false, error: { code: 'WRONG_PIN', message: 'That PIN is not right.' } });
  } catch (err) {
    next(err);
  }
});

router.use(authenticatePartnerKiosk);

router.get('/me', async (req, res, next) => {
  try {
    const session = req.partnerKiosk!;
    res.json({
      success: true,
      data: {
        partnerName: session.partnerName,
        logoUrl: session.logoUrl,
        welcomeMessage: session.welcomeMessage,
        deliveryAreas: session.kioskLocationId == null
          ? await deliveryAreas(req.app.locals.deps.configRepo, session.storeId)
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

const context = (req: Request) => {
  const source = (req.method === 'GET' ? req.query : req.body) as { deliveryAreaId?: number | string | null };
  const areaId = source.deliveryAreaId == null || source.deliveryAreaId === '' ? null : Number(source.deliveryAreaId);
  return partnerKioskContext(req.app.locals.deps.configRepo, req.partnerKiosk!, areaId);
};

router.get('/options', validateQuery(counterQuerySchema), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof counterQuerySchema>;
    res.json({ success: true, data: await listCounterOptions(deps(req), await context(req), q) });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.get('/extras', validateQuery(counterQuerySchema.extend({ modelId: z.string().min(1) })), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof counterQuerySchema> & { modelId: string };
    res.json({ success: true, data: await counterExtras(deps(req), await context(req), q) });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.post('/holds', validateBody(CounterHoldSchema), async (req, res, next) => {
  try {
    const hold = await createCounterHold(deps(req), await context(req), req.body as z.infer<typeof CounterHoldSchema>);
    res.status(201).json({ success: true, data: { holdId: hold.id, expiresAt: hold.expiresAt } });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.delete('/holds/:holdId', validateBody(CounterReleaseSchema), async (req: Request, res: Response, next) => {
  try {
    await releaseCounterHold(deps(req), req.params.holdId as string, (req.body as z.infer<typeof CounterReleaseSchema>).sessionToken);
    res.json({ success: true, data: null });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.post('/bookings', validateBody(CounterBookingSchema), async (req, res, next) => {
  try {
    const result = await createCounterBooking(deps(req), await context(req), req.body as z.infer<typeof CounterBookingSchema>);
    res.status(201).json({ success: true, data: { orderReference: result.orderReference } });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

export { router as partnerKioskRoutes };
