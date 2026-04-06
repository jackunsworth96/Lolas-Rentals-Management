import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  GetBudgetQuerySchema,
  UpsertBudgetLinesSchema,
  AutoFillQuerySchema,
} from '@lolas/shared';
import type { BudgetPort } from '@lolas/domain';

const router = Router();
router.use(authenticate);

// ── GET / — fetch budget lines + actuals for a store/year ──
router.get(
  '/',
  requirePermission(Permission.ViewAccounts),
  validateQuery(GetBudgetQuerySchema),
  async (req, res, next) => {
    try {
      const { storeId, year, month } = req.query as {
        storeId?: string | null;
        year: number;
        month?: number;
      };
      const resolvedStoreId = storeId ?? null;
      const budget: BudgetPort = req.app.locals.deps.budget;

      const [period, expenses, journals, revenue] = await Promise.all([
        budget.getBudgetLines(resolvedStoreId, year),
        budget.getExpenseActuals(resolvedStoreId, year, month),
        budget.getJournalActuals(resolvedStoreId, year, month),
        budget.getRevenueActuals(resolvedStoreId, year, month),
      ]);

      res.json({
        success: true,
        data: { period, actuals: { expenses, journals, revenue } },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /lines — upsert budget lines for a period ──
router.post(
  '/lines',
  requirePermission(Permission.ViewAccounts),
  validateBody(UpsertBudgetLinesSchema),
  async (req, res, next) => {
    try {
      const { storeId, year, lines } = req.body as {
        storeId: string | null;
        year: number;
        lines: Array<{
          lineType: string;
          categoryLabel: string;
          coaAccountId?: string | null;
          expenseCategoryId?: number | null;
          month: number;
          amount: number;
        }>;
      };
      const budget: BudgetPort = req.app.locals.deps.budget;

      await budget.upsertBudgetLines(
        storeId,
        year,
        req.user!.userId,
        lines,
      );

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /autofill — return last year's actuals shaped as budget lines ──
router.get(
  '/autofill',
  requirePermission(Permission.ViewAccounts),
  validateQuery(AutoFillQuerySchema),
  async (req, res, next) => {
    try {
      const { storeId, year } = req.query as {
        storeId?: string | null;
        year: number;
      };
      const budget: BudgetPort = req.app.locals.deps.budget;

      const lines = await budget.getLastYearActuals(storeId ?? null, year);

      res.json({ success: true, data: { lines } });
    } catch (err) {
      next(err);
    }
  },
);

export { router as budgetRoutes };
