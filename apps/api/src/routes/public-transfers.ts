import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import type { Store, ConfigRepository } from '@lolas/domain';

const router = Router();

const PublicBookingSchema = z.object({
  serviceDate: z.string().min(1),
  customerName: z.string().min(1),
  contactNumber: z.string().nullable().default(null),
  customerEmail: z.union([z.string().email(), z.literal(''), z.null()]).default(null).transform((v) => v || null),
  route: z.string().min(1),
  flightTime: z.string().nullable().default(null),
  paxCount: z.number().int().positive().default(1),
  vanType: z.string().nullable().default(null),
  accommodation: z.string().nullable().default(null),
  totalPrice: z.number().positive(),
  opsNotes: z.string().nullable().default(null),
  token: z.string().min(1),
});

async function resolveToken(
  configRepo: ConfigRepository,
  token: string,
): Promise<Store | null> {
  const store = await configRepo.getStoreByBookingToken(token);
  if (!store || !store.publicBookingEnabled) return null;
  return store;
}

router.get('/transfer-routes', async (req, res, next) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'MISSING_TOKEN', message: 'token is required' } });
      return;
    }
    const store = await resolveToken(req.app.locals.deps.configRepo, token);
    if (!store) {
      res.status(404).json({ success: false, error: { code: 'INVALID_LINK', message: 'This booking link is not valid or has been disabled.' } });
      return;
    }
    const routes = await req.app.locals.deps.configRepo.getTransferRoutes(store.id);
    res.json({ success: true, data: routes });
  } catch (err) { next(err); }
});

router.get('/store-info', async (req, res, next) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'MISSING_TOKEN', message: 'token is required' } });
      return;
    }
    const store = await resolveToken(req.app.locals.deps.configRepo, token);
    if (!store) {
      res.status(404).json({ success: false, error: { code: 'INVALID_LINK', message: 'This booking link is not valid or has been disabled.' } });
      return;
    }
    res.json({ success: true, data: { id: store.id, name: store.name } });
  } catch (err) { next(err); }
});

router.post('/transfer-booking', validateBody(PublicBookingSchema), async (req, res, next) => {
  try {
    const store = await resolveToken(req.app.locals.deps.configRepo, req.body.token);
    if (!store) {
      res.status(404).json({ success: false, error: { code: 'INVALID_LINK', message: 'This booking link is not valid or has been disabled.' } });
      return;
    }
    const { createTransfer } = await import('../use-cases/transfers/create-transfer.js');
    const result = await createTransfer(
      {
        ...req.body,
        customerType: 'Online',
        paymentMethod: null,
        bookingSource: 'online',
        bookingToken: req.body.token,
        orderId: null,
        storeId: store.id,
      },
      { transfers: req.app.locals.deps.transferRepo },
    );
    res.status(201).json({ success: true, data: { id: result.id } });
  } catch (err) { next(err); }
});

export { router as publicTransferRoutes };
