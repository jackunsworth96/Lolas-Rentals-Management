import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateExpenseRequestSchema,
  UpdateExpenseRequestSchema,
  ExpenseQuerySchema,
  PayExpensesSchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { randomUUID } from 'node:crypto';

const router = Router();
router.use(authenticate);

// ── GET / — list expenses with enriched data ──
router.get(
  '/',
  requirePermission(Permission.ViewExpenses),
  validateQuery(ExpenseQuerySchema),
  async (req, res, next) => {
    try {
      const { storeId, date, dateFrom, dateTo } = req.query as {
        storeId: string;
        date?: string;
        dateFrom?: string;
        dateTo?: string;
      };

      const sb = getSupabaseClient();

      let expensesQuery = sb
        .from('expenses')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true });

      if (dateFrom && dateTo) {
        expensesQuery = expensesQuery.gte('date', dateFrom).lte('date', dateTo);
      } else {
        const effectiveDate = date ?? new Date().toISOString().split('T')[0];
        expensesQuery = expensesQuery.eq('date', effectiveDate);
      }

      const [expensesRes, accountsRes, fleetRes, employeesRes] =
        await Promise.all([
          expensesQuery,
          sb
            .from('chart_of_accounts')
            .select('id, name, account_type')
            .in('store_id', [storeId, 'company']),
          sb
            .from('fleet')
            .select('id, plate_number, vehicle_name')
            .eq('store_id', storeId),
          sb
            .from('employees')
            .select('id, first_name, last_name')
            .eq('store_id', storeId),
        ]);

      if (expensesRes.error)
        throw new Error(`Failed to fetch expenses: ${expensesRes.error.message}`);

      const accountMap = new Map(
        ((accountsRes.data ?? []) as { id: string; name: string; account_type: string }[]).map(
          (a) => [a.id, a],
        ),
      );
      const fleetMap = new Map(
        ((fleetRes.data ?? []) as { id: string; plate_number: string; vehicle_name: string }[]).map(
          (v) => [v.id, v],
        ),
      );
      const empMap = new Map(
        ((employeesRes.data ?? []) as { id: string; first_name: string; last_name: string }[]).map(
          (e) => [e.id, e],
        ),
      );

      const rows = ((expensesRes.data ?? []) as Record<string, unknown>[]).map(
        (r) => {
          const paidFromAcct = accountMap.get(r.paid_from as string);
          const expenseAcct = accountMap.get(r.account_id as string);
          const vehicle = fleetMap.get(r.vehicle_id as string);
          const employee = empMap.get(r.employee_id as string);

          return {
            id: r.id,
            storeId: r.store_id,
            date: r.date,
            category: r.category,
            description: r.description,
            amount: Number(r.amount ?? 0),
            paidFrom: r.paid_from,
            paidFromName: paidFromAcct?.name ?? null,
            vehicleId: r.vehicle_id,
            vehicleName: vehicle
              ? `${vehicle.vehicle_name} (${vehicle.plate_number})`
              : null,
            employeeId: r.employee_id,
            employeeName: employee
              ? `${employee.first_name} ${employee.last_name}`
              : null,
            accountId: r.account_id,
            accountName: expenseAcct?.name ?? null,
            status: (r.status as string) ?? 'paid',
            paidAt: (r.paid_at as string) ?? null,
            createdAt: r.created_at,
          };
        },
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST / — create expense ──
router.post(
  '/',
  requirePermission(Permission.EditExpenses),
  validateBody(CreateExpenseRequestSchema),
  async (req, res, next) => {
    try {
      const { createExpense } = await import(
        '../use-cases/expenses/create-expense.js'
      );
      const result = await createExpense(req.body, {
        expenses: req.app.locals.deps.expenseRepo,
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
      const { updateExpense } = await import(
        '../use-cases/expenses/update-expense.js'
      );
      const result = await updateExpense(
        { expenseId: req.params.id as string, ...req.body },
        {
          expenses: req.app.locals.deps.expenseRepo,
          accounting: req.app.locals.deps.accountingPort,
        },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /:id — delete expense and reverse journal entries ──
router.delete(
  '/:id',
  requirePermission(Permission.EditExpenses),
  async (req, res, next) => {
    try {
      const { deleteExpense } = await import(
        '../use-cases/expenses/delete-expense.js'
      );
      await deleteExpense(
        { expenseId: req.params.id as string },
        {
          expenses: req.app.locals.deps.expenseRepo,
        },
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

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

      const sb = getSupabaseClient();

      const { data: expenseRows, error: expErr } = await sb
        .from('expenses')
        .select('id, amount, account_id, category')
        .in('id', expenseIds);
      if (expErr) throw new Error(`Failed to fetch expenses: ${expErr.message}`);

      const { data: routingRows, error: routeErr } = await sb
        .from('payment_routing_rules')
        .select('received_into_account_id')
        .eq('store_id', storeId)
        .eq('payment_method_id', paymentMethodId)
        .limit(1);
      if (routeErr)
        throw new Error(`Failed to fetch routing rules: ${routeErr.message}`);

      const resolvedAccountId = (routingRows?.[0] as Record<string, unknown> | undefined)
        ?.received_into_account_id as string | undefined;
      if (!resolvedAccountId)
        throw new Error('No payment routing rule found for the selected method');

      const now = new Date();
      const todayDate = now.toISOString().slice(0, 10);
      const period = todayDate.slice(0, 7);
      const txId = randomUUID();

      const legs: Record<string, unknown>[] = [];
      for (const row of (expenseRows ?? []) as Record<string, unknown>[]) {
        const amt = Number(row.amount ?? 0);
        legs.push({
          id: randomUUID(),
          transaction_id: txId,
          period,
          date: todayDate,
          store_id: storeId,
          account_id: row.account_id as string,
          debit: amt,
          credit: 0,
          description: `Batch payment - ${row.category as string}`,
          reference_type: 'expense',
          reference_id: row.id as string,
        });
        legs.push({
          id: randomUUID(),
          transaction_id: txId,
          period,
          date: todayDate,
          store_id: storeId,
          account_id: resolvedAccountId,
          debit: 0,
          credit: amt,
          description: `Batch payment - ${row.category as string}`,
          reference_type: 'expense',
          reference_id: row.id as string,
        });
      }

      const { error: payErr } = await sb.rpc('pay_expenses_atomic', {
        p_expense_ids: expenseIds,
        p_paid_at: now.toISOString(),
        p_paid_from: resolvedAccountId,
        p_legs: legs,
      });
      if (payErr)
        throw new Error(`pay_expenses_atomic failed: ${payErr.message}`);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as expenseRoutes };
