import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  RecordMiscSaleRequestSchema,
  UpdateMiscSaleRequestSchema,
  MiscSaleQuerySchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';

const router = Router();
router.use(authenticate);

const perm = requirePermission(Permission.ViewMiscSales);

router.get('/', perm, validateQuery(MiscSaleQuerySchema), async (req, res, next) => {
  try {
    const { storeId, date } = req.query as { storeId: string; date?: string };
    const effectiveDate = date ?? formatManilaDate();

    const sb = getSupabaseClient();

    const [salesRes, accountsRes, employeesRes] = await Promise.all([
      sb
        .from('misc_sales')
        .select('*')
        .eq('store_id', storeId)
        .eq('date', effectiveDate)
        .order('created_at', { ascending: true }),
      sb
        .from('chart_of_accounts')
        .select('id, name, account_type')
        .in('store_id', [storeId, 'company']),
      sb
        .from('employees')
        .select('id, full_name')
        .eq('store_id', storeId),
    ]);

    if (salesRes.error) throw new Error(`Failed to fetch misc sales: ${salesRes.error.message}`);

    const accountMap = new Map(
      ((accountsRes.data ?? []) as { id: string; name: string; account_type: string }[]).map(
        (a) => [a.id, a],
      ),
    );
    const empMap = new Map(
      ((employeesRes.data ?? []) as { id: string; full_name: string }[]).map(
        (e) => [e.id, e],
      ),
    );

    const rows = ((salesRes.data ?? []) as Record<string, unknown>[]).map((r) => {
      const receivedAcct = accountMap.get(r.received_into as string);
      const incomeAcct = accountMap.get(r.income_account_id as string);
      const employee = empMap.get(r.employee_id as string);

      return {
        id: r.id,
        storeId: r.store_id,
        date: r.date,
        description: r.description,
        category: r.category,
        amount: Number(r.amount ?? 0),
        receivedInto: r.received_into,
        receivedIntoName: receivedAcct?.name ?? null,
        incomeAccountId: r.income_account_id,
        incomeAccountName: incomeAcct?.name ?? null,
        employeeId: r.employee_id,
        employeeName: employee?.full_name ?? null,
        createdAt: r.created_at,
      };
    });

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', perm, validateBody(RecordMiscSaleRequestSchema), async (req, res, next) => {
  try {
    const { recordSale } = await import('../use-cases/misc-sales/record-sale.js');
    const result = await recordSale(req.body, {
      miscSales: req.app.locals.deps.miscSaleRepo,
      accounting: req.app.locals.deps.accountingPort,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', perm, validateBody(UpdateMiscSaleRequestSchema), async (req, res, next) => {
  try {
    const { updateSale } = await import('../use-cases/misc-sales/update-sale.js');
    const result = await updateSale(
      { saleId: req.params.id as string, ...req.body },
      {
        miscSales: req.app.locals.deps.miscSaleRepo,
        accounting: req.app.locals.deps.accountingPort,
      },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/:id', perm, async (req, res, next) => {
  try {
    const { deleteSale } = await import('../use-cases/misc-sales/delete-sale.js');
    await deleteSale(
      { saleId: req.params.id as string },
      {
        miscSales: req.app.locals.deps.miscSaleRepo,
        accounting: req.app.locals.deps.accountingPort,
      },
    );
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

export { router as miscSalesRoutes };
