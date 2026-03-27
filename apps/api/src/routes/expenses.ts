import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateExpenseRequestSchema,
  UpdateExpenseRequestSchema,
  ExpenseQuerySchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

// ── GET / — list expenses with enriched data ──
router.get(
  '/',
  requirePermission(Permission.ViewExpenses),
  validateQuery(ExpenseQuerySchema),
  async (req, res, next) => {
    try {
      const { storeId, date } = req.query as { storeId: string; date?: string };
      const effectiveDate = date ?? new Date().toISOString().split('T')[0];

      const sb = getSupabaseClient();

      const [expensesRes, accountsRes, fleetRes, employeesRes] =
        await Promise.all([
          sb
            .from('expenses')
            .select('*')
            .eq('store_id', storeId)
            .eq('date', effectiveDate)
            .order('created_at', { ascending: true }),
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
  requirePermission(Permission.ViewExpenses),
  validateBody(CreateExpenseRequestSchema),
  async (req, res, next) => {
    try {
      const { createExpense } = await import(
        '../use-cases/expenses/create-expense.js'
      );
      const result = await createExpense(req.body, {
        expenses: req.app.locals.deps.expenseRepo,
        accounting: req.app.locals.deps.accountingPort,
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
  requirePermission(Permission.ViewExpenses),
  validateBody(UpdateExpenseRequestSchema),
  async (req, res, next) => {
    try {
      const { updateExpense } = await import(
        '../use-cases/expenses/update-expense.js'
      );
      const result = await updateExpense(
        { expenseId: req.params.id, ...req.body },
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
  requirePermission(Permission.ViewExpenses),
  async (req, res, next) => {
    try {
      const { deleteExpense } = await import(
        '../use-cases/expenses/delete-expense.js'
      );
      await deleteExpense(
        { expenseId: req.params.id },
        {
          expenses: req.app.locals.deps.expenseRepo,
          accounting: req.app.locals.deps.accountingPort,
        },
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

export { router as expenseRoutes };
