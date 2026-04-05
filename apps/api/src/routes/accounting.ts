import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateJournalEntryRequestSchema,
  TransferFundsRequestSchema,
} from '@lolas/shared';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const BalancesQuerySchema = z.object({ storeId: z.string(), period: z.string() });

router.get('/balances', requirePermission(Permission.ViewAccounts), validateQuery(BalancesQuerySchema), async (req, res, next) => {
  try {
    const { calculateBalances } = await import('../use-cases/accounting/calculate-balances.js');
    const result = await calculateBalances(
      { storeId: req.query.storeId as string, period: req.query.period as string },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

function halfMonthRange(month: string, half: '1' | '2'): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number);
  if (half === '1') {
    return { from: `${month}-01`, to: `${month}-15` };
  }
  const lastDay = new Date(year, m, 0).getDate();
  return { from: `${month}-16`, to: `${month}-${lastDay}` };
}

const BalancesV2QuerySchema = z.object({
  storeId: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  half: z.enum(['1', '2']),
});

router.get('/balances-v2', requirePermission(Permission.ViewAccounts), validateQuery(BalancesV2QuerySchema), async (req, res, next) => {
  try {
    const { storeId, month, half } = req.query as { storeId: string; month: string; half: '1' | '2' };
    const { from, to } = halfMonthRange(month, half);

    const configRepo = req.app.locals.deps.configRepo;
    let storeIds: string[];
    if (storeId === 'all') {
      const stores = await configRepo.getStores();
      storeIds = stores.map((s: { id: string }) => s.id);
    } else {
      storeIds = [storeId];
    }

    const summary = await req.app.locals.deps.accountingPort.calculateBalancesByDateRange(storeIds, from, to);
    res.json({ success: true, data: { storeId, month, half, from, to, summary } });
  } catch (err) { next(err); }
});

router.get('/account-ledger', requirePermission(Permission.ViewAccounts), validateQuery(z.object({
  accountId: z.string(),
  from: z.string(),
  to: z.string(),
})), async (req, res, next) => {
  try {
    const { accountId, from, to } = req.query as { accountId: string; from: string; to: string };
    const entries = await req.app.locals.deps.accountingPort.findByAccountDateRange(accountId, from, to);
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
});

router.get('/entries', requirePermission(Permission.ViewAccounts), validateQuery(z.object({
  storeId: z.string(), period: z.string(),
})), async (req, res, next) => {
  try {
    const entries = await req.app.locals.deps.accountingPort.findByStore(
      req.query.storeId as string, req.query.period as string,
    );
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
});

router.post('/journal', requirePermission(Permission.EditAccounts), validateBody(CreateJournalEntryRequestSchema), async (req, res, next) => {
  try {
    const { createJournalEntry } = await import('../use-cases/accounting/create-journal-entry.js');
    const result = await createJournalEntry(
      { ...req.body, createdBy: req.user!.employeeId, storeId: req.body.locationId ?? req.user!.storeIds[0] },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

const OwnerDrawingsRequestSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'gcash', 'bank_transfer']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
});

const DRAWINGS_CREDIT_ACCOUNTS: Record<string, string> = {
  cash: 'CASH-LOLA',
  gcash: 'GCASH-store-lolas',
  bank_transfer: 'BANK-UNION-BANK-store-lolas',
};

router.post('/drawings', requirePermission(Permission.EditAccounts), validateBody(OwnerDrawingsRequestSchema), async (req, res, next) => {
  try {
    const { amount, paymentMethod, date, note } = req.body as z.infer<typeof OwnerDrawingsRequestSchema>;
    const creditAccountId = DRAWINGS_CREDIT_ACCOUNTS[paymentMethod];
    const description = note?.trim() ? `Owner Drawings — ${note.trim()}` : 'Owner Drawings';
    const period = date.slice(0, 7);

    const { createJournalEntry } = await import('../use-cases/accounting/create-journal-entry.js');
    const result = await createJournalEntry(
      {
        storeId: 'company',
        date,
        period,
        createdBy: req.user!.employeeId,
        legs: [
          { accountId: 'OWNER-DRAWINGS-store-lolas', debit: amount, credit: 0, description, referenceType: 'owner_drawings', referenceId: null },
          { accountId: creditAccountId, debit: 0, credit: amount, description, referenceType: 'owner_drawings', referenceId: null },
        ],
      },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/transfer', requirePermission(Permission.EditAccounts), validateBody(TransferFundsRequestSchema), async (req, res, next) => {
  try {
    const { transferFunds } = await import('../use-cases/accounting/transfer-funds.js');
    const result = await transferFunds(
      { ...req.body, createdBy: req.user!.employeeId, storeId: req.body.locationId ?? req.user!.storeIds[0], period: req.body.date.slice(0, 7) },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as accountingRoutes };
