import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Permission } from '@lolas/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  CounterError,
  counterExtras,
  createCounterBooking,
  createCounterHold,
  listCounterOptions,
  releaseCounterHold,
  staffCounterContext,
  type CounterContext,
} from '../use-cases/counter/counter-booking.js';
import { CounterBookingSchema, CounterHoldSchema, CounterReleaseSchema, counterQuerySchema } from './counter-schemas.js';

export { MAX_COUNTER_DAYS, counterWindow, nearestSlot, nextSlotFrom } from '../use-cases/counter/counter-slots.js';

/** Sends counter use-case errors with their status and code; anything else goes to the error handler. */
export function counterErrors(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof CounterError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }
  next(err);
}

const router = Router();
router.use(authenticate, requirePermission(Permission.UseCounter));

/** The tablet is signed in to one store; it always books for that store. */
async function context(req: Request, res: Response): Promise<CounterContext | null> {
  const storeId = req.user?.storeIds[0];
  if (!storeId) {
    res.status(403).json({ success: false, error: { message: 'This tablet has no store assigned' } });
    return null;
  }
  return staffCounterContext(req.app.locals.deps.configRepo, storeId);
}

const deps = (req: Request) => ({ bookingPort: req.app.locals.deps.bookingPort, configRepo: req.app.locals.deps.configRepo });

router.get('/options', validateQuery(counterQuerySchema), async (req, res, next) => {
  try {
    const ctx = await context(req, res);
    if (!ctx) return;
    const q = req.query as unknown as z.infer<typeof counterQuerySchema>;
    res.json({ success: true, data: await listCounterOptions(deps(req), ctx, q) });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.get('/extras', validateQuery(counterQuerySchema.extend({ modelId: z.string().min(1) })), async (req, res, next) => {
  try {
    const ctx = await context(req, res);
    if (!ctx) return;
    const q = req.query as unknown as z.infer<typeof counterQuerySchema> & { modelId: string };
    res.json({ success: true, data: await counterExtras(deps(req), ctx, q) });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.post('/holds', validateBody(CounterHoldSchema), async (req, res, next) => {
  try {
    const ctx = await context(req, res);
    if (!ctx) return;
    const hold = await createCounterHold(deps(req), ctx, req.body as z.infer<typeof CounterHoldSchema>);
    res.status(201).json({ success: true, data: { holdId: hold.id, expiresAt: hold.expiresAt } });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.delete('/holds/:holdId', validateBody(CounterReleaseSchema), async (req, res, next) => {
  try {
    await releaseCounterHold(deps(req), req.params.holdId as string, (req.body as z.infer<typeof CounterReleaseSchema>).sessionToken);
    res.json({ success: true, data: null });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

router.post('/bookings', validateBody(CounterBookingSchema), async (req, res, next) => {
  try {
    const ctx = await context(req, res);
    if (!ctx) return;
    const result = await createCounterBooking(deps(req), ctx, req.body as z.infer<typeof CounterBookingSchema>);
    res.status(201).json({ success: true, data: { orderReference: result.orderReference } });
  } catch (err) {
    counterErrors(err, res, next);
  }
});

export { router as counterRoutes };
