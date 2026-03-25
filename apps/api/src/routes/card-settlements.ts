import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/pending', requirePermission(Permission.ViewCardSettlements), validateQuery(z.object({
  storeId: z.string().optional(),
})), async (req, res, next) => {
  try {
    const storeId = req.query.storeId as string | undefined;
    const data = await req.app.locals.deps.cardSettlementRepo.findPending(storeId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/settled', requirePermission(Permission.ViewCardSettlements), validateQuery(z.object({
  storeId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})), async (req, res, next) => {
  try {
    const { storeId, from, to } = req.query as { storeId?: string; from?: string; to?: string };
    const data = await req.app.locals.deps.cardSettlementRepo.findSettled(storeId, from, to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/balance', requirePermission(Permission.ViewCardSettlements), async (req, res, next) => {
  try {
    const data = await req.app.locals.deps.cardSettlementRepo.pendingTotals();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/match', requirePermission(Permission.ViewCardSettlements), validateBody(z.object({
  settlementIds: z.array(z.string()).min(1),
  settlementDate: z.string().min(1),
  bankReference: z.string().min(1),
  netAmount: z.number().nonnegative(),
  feeAmount: z.number().nonnegative(),
  bankAccountId: z.string().min(1),
  cardFeeAccountId: z.string().min(1),
  cardReceivableAccountId: z.string().min(1),
})), async (req, res, next) => {
  try {
    const { matchSettlement } = await import('../use-cases/card-settlements/match-settlement.js');
    const result = await matchSettlement(
      {
        cardSettlementRepo: req.app.locals.deps.cardSettlementRepo,
        accountingPort: req.app.locals.deps.accountingPort,
      },
      req.body,
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/batch-edit', requirePermission(Permission.ViewCardSettlements), validateBody(z.object({
  ids: z.array(z.string()).min(1),
  forecastedDate: z.string().optional(),
  settlementRef: z.string().optional(),
})), async (req, res, next) => {
  try {
    const { ids, forecastedDate, settlementRef } = req.body;
    await req.app.locals.deps.cardSettlementRepo.batchUpdate(ids, { forecastedDate, settlementRef });
    res.json({ success: true, data: { updated: ids.length } });
  } catch (err) { next(err); }
});

router.post('/combine', requirePermission(Permission.ViewCardSettlements), validateBody(z.object({
  ids: z.array(z.string()).min(2),
  batchNo: z.string().min(1),
})), async (req, res, next) => {
  try {
    const { ids, batchNo } = req.body;
    await req.app.locals.deps.cardSettlementRepo.assignBatch(ids, batchNo);
    res.json({ success: true, data: { combined: ids.length, batchNo } });
  } catch (err) { next(err); }
});

export { router as cardSettlementRoutes };
