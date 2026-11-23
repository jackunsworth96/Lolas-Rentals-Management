import { Router, type Request } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateExpenseRequestSchema,
  UpdateExpenseRequestSchema,
  ExpenseQuerySchema,
  ExpenseCheckQuerySchema,
  PayExpensesSchema,
  type ExpenseQuery,
  type ExpenseCheckQuery,
} from '@lolas/shared';
import { EntryRejectedError } from '@lolas/domain';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { randomUUID } from 'node:crypto';
import { formatManilaDate } from '../utils/manila-date.js';
import type { ExpenseActor } from '../use-cases/expenses/expense-context.js';

const router = Router();
router.use(authenticate);

const actorOf = (req: Request): ExpenseActor => ({
  employeeId: req.user?.employeeId ?? null,
  permissions: req.user?.permissions ?? [],
});

function assertStoreAccess(req: Request, storeId: string): void {
  const stores = req.user?.storeIds ?? [];
  if (!stores.includes(storeId) && !stores.includes('company')) {
    throw Object.assign(new Error('You do not have access to this store'), { statusCode: 403 });
  }
}

type Row = Record<string, unknown>;

// ── GET / — list expenses with enriched data ──
router.get(
  '/',
  requirePermission(Permission.ViewExpenses),
  validateQuery(ExpenseQuerySchema),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as ExpenseQuery;
      const sb = getSupabaseClient();

      let expensesQuery = sb
        .from('expenses')
        .select('*')
        .eq('store_id', q.storeId)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      if (q.dateFrom && q.dateTo) {
        expensesQuery = expensesQuery.gte('date', q.dateFrom).lte('date', q.dateTo);
      } else {
        expensesQuery = expensesQuery.eq('date', q.date ?? formatManilaDate());
      }
      if (q.categoryId) expensesQuery = expensesQuery.eq('category_id', q.categoryId);
      if (q.employeeId) expensesQuery = expensesQuery.eq('employee_id', q.employeeId);
      if (q.vehicleId) expensesQuery = expensesQuery.eq('vehicle_id', q.vehicleId);

      const [expensesRes, accountsRes, fleetRes, employeesRes, categoriesRes] = await Promise.all([
        expensesQuery,
        sb.from('chart_of_accounts').select('id, name, account_type'),
        sb.from('fleet').select('id, plate_number, vehicle_name').eq('store_id', q.storeId),
        sb.from('employees').select('id, full_name'),
        sb.from('expense_categories').select('id, kind, group_name'),
      ]);
      if (expensesRes.error) throw new Error(`Failed to fetch expenses: ${expensesRes.error.message}`);

      const accountMap = new Map(((accountsRes.data ?? []) as Row[]).map((a) => [String(a.id), a]));
      const fleetMap = new Map(((fleetRes.data ?? []) as Row[]).map((v) => [String(v.id), v]));
      const empMap = new Map(((employeesRes.data ?? []) as Row[]).map((e) => [String(e.id), String(e.full_name ?? '')]));
      const catMap = new Map(((categoriesRes.data ?? []) as Row[]).map((c) => [Number(c.id), c]));

      const actor = actorOf(req);
      const manager = actor.permissions.includes(Permission.EditAccounts);
      const canEdit = actor.permissions.includes(Permission.EditExpenses);
      const today = formatManilaDate();

      const rows = ((expensesRes.data ?? []) as Row[]).map((r) => {
        const vehicle = fleetMap.get(String(r.vehicle_id));
        const cat = r.category_id == null ? undefined : catMap.get(Number(r.category_id));
        const createdBy = (r.created_by as string | null) ?? null;
        const ownToday = createdBy === actor.employeeId && formatManilaDate(new Date(String(r.created_at))) === today;
        return {
          id: r.id,
          storeId: r.store_id,
          date: r.date,
          category: r.category,
          categoryId: r.category_id ?? null,
          kind: (cat?.kind as string | undefined) ?? 'standard',
          groupName: (cat?.group_name as string | undefined) ?? null,
          description: r.description,
          amount: Number(r.amount ?? 0),
          paidFrom: r.paid_from,
          paidFromName: (accountMap.get(String(r.paid_from))?.name as string | undefined) ?? null,
          vehicleId: r.vehicle_id,
          vehicleName: vehicle ? `${String(vehicle.vehicle_name)} (${String(vehicle.plate_number)})` : null,
          employeeId: r.employee_id,
          employeeName: r.employee_id ? empMap.get(String(r.employee_id)) ?? null : null,
          accountId: r.account_id,
          accountName: (accountMap.get(String(r.account_id))?.name as string | undefined) ?? null,
          status: (r.status as string) ?? 'paid',
          paidAt: (r.paid_at as string) ?? null,
          linkedTo: r.timesheet_id ? 'timesheet' : r.maintenance_id ? 'maintenance' : null,
          createdAt: r.created_at,
          createdBy,
          createdByName: createdBy ? empMap.get(createdBy) ?? null : null,
          updatedAt: r.updated_at ?? null,
          updatedByName: r.updated_by ? empMap.get(String(r.updated_by)) ?? null : null,
          canChange: canEdit && (manager || ownToday),
        };
      });

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /check — warnings to show before saving (duplicate, over the usual amount) ──
router.get(
  '/check',
  requirePermission(Permission.EditExpenses),
  validateQuery(ExpenseCheckQuerySchema),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as ExpenseCheckQuery;
      const { loadCategory, countDuplicates } = await import('../use-cases/expenses/expense-context.js');
      const category = await loadCategory(req.app.locals.deps.configRepo, q.storeId, q.categoryId);
      if (!category) throw new EntryRejectedError(['That expense type is no longer available.']);
      const duplicates = await countDuplicates({
        storeId: q.storeId,
        categoryId: q.categoryId,
        date: q.date,
        amount: q.amount,
        employeeId: q.employeeId,
        vehicleId: q.vehicleId,
        excludeId: q.excludeId,
      });
      res.json({
        success: true,
        data: {
          duplicates,
          overLimit: category.softLimit != null && q.amount > category.softLimit,
          softLimit: category.softLimit,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /staff-payouts — staff list with allowance balance and advances owed ──
router.get('/staff-payouts', requirePermission(Permission.EditExpenses), async (req, res, next) => {
  try {
    const storeId = String(req.query.storeId ?? '');
    if (!storeId) throw new EntryRejectedError(['storeId is required']);
    assertStoreAccess(req, storeId);
    const { listStaffPayoutContext } = await import('../use-cases/expenses/expense-context.js');
    res.json({ success: true, data: await listStaffPayoutContext(storeId) });
  } catch (err) {
    next(err);
  }
});

// ── POST / — create expense ──
router.post(
  '/',
  requirePermission(Permission.EditExpenses),
  validateBody(CreateExpenseRequestSchema),
  async (req, res, next) => {
    try {
      assertStoreAccess(req, req.body.storeId);
      const { createExpense } = await import('../use-cases/expenses/create-expense.js');
      const result = await createExpense(req.body, actorOf(req), {
        expenses: req.app.locals.deps.expenseRepo,
        config: req.app.locals.deps.configRepo,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /:id — update expense ──
router.put(
  '/:id',
  requirePermission(Permission.EditExpenses),
  validateBody(UpdateExpenseRequestSchema),
  async (req, res, next) => {
    try {
      const { updateExpense } = await import('../use-cases/expenses/update-expense.js');
      const result = await updateExpense(req.params.id as string, req.body, actorOf(req), {
        config: req.app.locals.deps.configRepo,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /:id — delete expense and its journal entries ──
router.delete('/:id', requirePermission(Permission.EditExpenses), async (req, res, next) => {
  try {
    const { deleteExpense } = await import('../use-cases/expenses/delete-expense.js');
    await deleteExpense(req.params.id as string, actorOf(req), {
      expenses: req.app.locals.deps.expenseRepo,
    });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// ── POST /pay — batch-pay unpaid expenses ──
router.post(
  '/pay',
  requirePermission(Permission.EditExpenses),
  validateBody(PayExpensesSchema),
  async (req, res, next) => {
    try {
      const { expenseIds, paymentMethodId, storeId } = req.body as {
        expenseIds: string[];
        paymentMethodId: string;
        storeId: string;
      };
      assertStoreAccess(req, storeId);

      const sb = getSupabaseClient();
      const { data: expenseRows, error: expErr } = await sb
        .from('expenses')
        .select('id, amount, account_id, category, status, store_id')
        .in('id', expenseIds);
      if (expErr) throw new Error(`Failed to fetch expenses: ${expErr.message}`);
      const rows = (expenseRows ?? []) as Row[];
      if (rows.length !== new Set(expenseIds).size) {
        throw new EntryRejectedError(['Some of the selected expenses no longer exist. Refresh and try again.']);
      }
      if (rows.some((r) => r.store_id !== storeId)) {
        throw new EntryRejectedError(['All selected expenses must belong to this store.']);
      }
      if (rows.some((r) => r.status !== 'unpaid')) {
        throw new EntryRejectedError(['Some of the selected expenses are already paid. Refresh and try again.']);
      }
      if (rows.some((r) => !r.account_id)) {
        throw new EntryRejectedError(['An expense without an account can’t be paid. Edit it first.']);
      }

      const { assertCanPayFrom, resolvePaidFrom } = await import('../use-cases/expenses/expense-context.js');
      assertCanPayFrom(paymentMethodId, actorOf(req));
      const resolvedAccountId = await resolvePaidFrom(storeId, paymentMethodId);

      const now = new Date();
      const todayDate = formatManilaDate(now);
      const period = todayDate.slice(0, 7);
      const txId = randomUUID();

      const legs: Row[] = [];
      for (const row of rows) {
        const amt = Number(row.amount ?? 0);
        const base = {
          transaction_id: txId,
          period,
          date: todayDate,
          store_id: storeId,
          description: `Batch payment - ${String(row.category)}`,
          reference_type: 'expense',
          reference_id: row.id as string,
        };
        legs.push({ ...base, id: randomUUID(), account_id: row.account_id as string, debit: amt, credit: 0 });
        legs.push({ ...base, id: randomUUID(), account_id: resolvedAccountId, debit: 0, credit: amt });
      }

      const { error: payErr } = await sb.rpc('pay_expenses_atomic', {
        p_expense_ids: expenseIds,
        p_paid_at: now.toISOString(),
        p_paid_from: resolvedAccountId,
        p_legs: legs,
      });
      if (payErr) throw new Error(`pay_expenses_atomic failed: ${payErr.message}`);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as expenseRoutes };
