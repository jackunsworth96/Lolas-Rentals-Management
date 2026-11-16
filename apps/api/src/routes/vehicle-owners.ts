import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@lolas/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get('/', requirePermission(Permission.ViewAccounts), async (_req, res, next) => {
  try {
    const { listOwnerAgreements } = await import('../use-cases/vehicle-owners/owner-statement.js');
    res.json({ success: true, data: await listOwnerAgreements() });
  } catch (err) { next(err); }
});

router.get('/:id/statement', requirePermission(Permission.ViewAccounts), async (req, res, next) => {
  try {
    const { getOwnerStatement } = await import('../use-cases/vehicle-owners/owner-statement.js');
    res.json({ success: true, data: await getOwnerStatement(req.params.id as string) });
  } catch (err) { next(err); }
});

router.post('/:id/close-month', requirePermission(Permission.EditAccounts), validateBody(z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
})), async (req, res, next) => {
  try {
    const { closeOwnerMonth } = await import('../use-cases/vehicle-owners/owner-statement.js');
    const result = await closeOwnerMonth({
      agreementId: req.params.id as string,
      period: req.body.period,
      createdBy: req.user!.employeeId ?? null,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/payout', requirePermission(Permission.EditAccounts), validateBody(z.object({
  amount: z.number().positive(),
  fromAccountId: z.string().min(1),
  date: IsoDate,
  note: z.string().trim().max(500).default(''),
})), async (req, res, next) => {
  try {
    const { recordOwnerPayout } = await import('../use-cases/vehicle-owners/owner-statement.js');
    const result = await recordOwnerPayout(
      { agreementId: req.params.id as string, ...req.body, createdBy: req.user!.employeeId },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as vehicleOwnerRoutes };
