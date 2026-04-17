import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateTransferRequestSchema,
  RecordTransferPaymentRequestSchema,
  RecordDriverPaymentRequestSchema,
  TransferQuerySchema,
  CollectTransferBodySchema,
} from '@lolas/shared';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(Permission.ViewTransfers), validateQuery(TransferQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, ...filters } = req.query as Record<string, string>;
    const transfers = await req.app.locals.deps.transferRepo.findByStore(storeId, filters);
    res.json({ success: true, data: transfers });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission(Permission.ViewTransfers), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transfer = await req.app.locals.deps.transferRepo.findById(req.params.id);
    if (!transfer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } }); return; }
    res.json({ success: true, data: transfer });
  } catch (err) { next(err); }
});

router.post('/', requirePermission(Permission.EditTransfers), validateBody(CreateTransferRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { createTransfer } = await import('../use-cases/transfers/create-transfer.js');
    const result = await createTransfer(req.body, { transfers: req.app.locals.deps.transferRepo });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/payment', requirePermission(Permission.EditTransfers), validateBody(RecordTransferPaymentRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recordTransferPayment } = await import('../use-cases/transfers/record-payment.js');
    const result = await recordTransferPayment(req.body, {
      transfers: req.app.locals.deps.transferRepo,
      accounting: req.app.locals.deps.accountingPort,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/driver-payment', requirePermission(Permission.EditTransfers), validateBody(RecordDriverPaymentRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recordDriverPayment } = await import('../use-cases/transfers/record-driver-payment.js');
    const result = await recordDriverPayment(req.body, {
      transfers: req.app.locals.deps.transferRepo,
      accounting: req.app.locals.deps.accountingPort,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/notify-driver', requirePermission(Permission.EditTransfers), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const transfer = await req.app.locals.deps.transferRepo.findById(id);
    if (!transfer) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
      return;
    }

    const driverEmail = process.env.DRIVER_EMAIL;
    if (!driverEmail) {
      res.status(500).json({ success: false, error: { code: 'CONFIG_ERROR', message: 'DRIVER_EMAIL not configured' } });
      return;
    }

    const { sendEmail, driverNotificationHtml } = await import('../services/email.js');

    const cut = transfer.routeDriverCut ?? 0;
    const driverCut = transfer.routePricingType === 'per_head'
      ? cut * transfer.paxCount
      : cut;

    const html = driverNotificationHtml({
      customerName: transfer.customerName,
      route: transfer.route,
      pickupLocation: transfer.accommodation,
      pickupTime: transfer.serviceDate,
      flightNumber: null,
      flightArrivalTime: transfer.flightTime,
      paxCount: transfer.paxCount,
      totalPrice: transfer.totalPrice.toNumber(),
      driverCut,
    });

    await sendEmail({
      to: driverEmail,
      subject: `Transfer job — ${transfer.customerName} — ${transfer.route}`,
      html,
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/:id/collect', requirePermission(Permission.EditTransfers), validateBody(CollectTransferBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { collectedAmount } = req.body as { collectedAmount: number };
    const existing = await req.app.locals.deps.transferRepo.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
      return;
    }
    const updated = existing.withCollected(new Date(), collectedAmount);
    await req.app.locals.deps.transferRepo.save(updated);
    const refreshed = await req.app.locals.deps.transferRepo.findById(id);
    res.json({ success: true, data: refreshed });
  } catch (err) { next(err); }
});

export { router as transferRoutes };
