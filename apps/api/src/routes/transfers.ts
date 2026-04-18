import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateTransferRequestSchema,
  RecordTransferPaymentRequestSchema,
  RecordDriverPaymentRequestSchema,
  TransferQuerySchema,
  TransferSummaryQuerySchema,
  CollectTransferBodySchema,
} from '@lolas/shared';

const PickupTimeBodySchema = z.object({
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(Permission.ViewTransfers), validateQuery(TransferQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, ...filters } = req.query as Record<string, string>;
    const transfers = await req.app.locals.deps.transferRepo.findByStore(storeId, filters);
    res.json({ success: true, data: transfers });
  } catch (err) { next(err); }
});

router.get('/summary', requirePermission(Permission.ViewTransfers), validateQuery(TransferSummaryQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const summary = await req.app.locals.deps.transferRepo.getSummary(storeId!, { dateFrom, dateTo });
    res.json({ success: true, data: summary });
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

    // Derive direction from the route string.
    // If the first segment contains 'iao' or 'airport' the journey originates at the
    // airport (IAO→GL inbound). Otherwise it originates in General Luna (GL→IAO outbound).
    const routeFirstSegment = transfer.route.split(/→|->/).map((s: string) => s.trim().toLowerCase())[0] ?? '';
    const direction: 'iao-to-gl' | 'gl-to-iao' =
      routeFirstSegment.includes('iao') || routeFirstSegment.includes('airport')
        ? 'iao-to-gl'
        : 'gl-to-iao';

    const html = driverNotificationHtml({
      customerName: transfer.customerName,
      route: transfer.route,
      pickupLocation: transfer.accommodation,
      pickupTime: transfer.pickupTime ?? null,
      flightNumber: null,
      flightArrivalTime: transfer.flightTime,
      paxCount: transfer.paxCount,
      totalPrice: transfer.totalPrice.toNumber(),
      driverCut,
      direction,
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
    const id = String(req.params.id);
    const body = req.body as {
      collectedAmount: number;
      paymentMethod: string;
      cashAccountId: string;
      transferIncomeAccountId: string;
      date: string;
    };
    const transferRepo = req.app.locals.deps.transferRepo;
    const accountingPort = req.app.locals.deps.accountingPort;

    const existing = await transferRepo.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
      return;
    }
    if (existing.collectedAt) {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_COLLECTED', message: 'Transfer payment has already been collected' },
      });
      return;
    }

    const { recordTransferPayment } = await import('../use-cases/transfers/record-payment.js');
    await recordTransferPayment(
      {
        transferId: id,
        amount: body.collectedAmount,
        paymentMethod: body.paymentMethod,
        date: body.date,
        cashAccountId: body.cashAccountId,
        transferIncomeAccountId: body.transferIncomeAccountId,
      },
      { transfers: transferRepo, accounting: accountingPort },
    );

    await transferRepo.save(existing.withCollected(new Date(), body.collectedAmount));
    const refreshed = await transferRepo.findById(id);
    res.json({ success: true, data: refreshed });
  } catch (err) { next(err); }
});

router.patch('/:id/pickup-time', requirePermission(Permission.EditTransfers), validateBody(PickupTimeBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { pickupTime } = req.body as { pickupTime: string | null };
    const transferRepo = req.app.locals.deps.transferRepo;

    const existing = await transferRepo.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
      return;
    }

    const updated = existing.withPickupTime(pickupTime);
    await transferRepo.save(updated);
    const refreshed = await transferRepo.findById(id);
    res.json({ success: true, data: refreshed });
  } catch (err) { next(err); }
});

export { router as transferRoutes };
