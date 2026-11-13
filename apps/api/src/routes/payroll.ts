import { Router, type Request, type Response } from 'express';
import type { EmployeeRepository } from '@lolas/domain';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import {
  Permission,
  RunPayrollPreviewRequestSchema,
  RunPayrollRequestSchema,
  VoidPayrollRunRequestSchema,
  ThirteenthMonthRunRequestSchema,
  PublicHolidaySchema,
  AllowanceWithdrawalSchema,
  AllowanceAdjustmentSchema,
  ContributionRemittanceSchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';

const router = Router();
router.use(authenticate);

function alreadyRun(err: unknown, res: Response): boolean {
  if ((err as { code?: string } | null)?.code !== '23505') return false;
  res.status(409).json({
    success: false,
    error: {
      code: 'PAYROLL_ALREADY_RUN',
      message: 'Payroll has already been posted for this period. Void the existing run on the Runs tab before running it again.',
    },
  });
  return true;
}

function engineDeps(req: Request): { employees: EmployeeRepository } {
  return { employees: req.app.locals.deps.employeeRepo };
}

const yearParam = (v: unknown) => {
  const y = Number(v);
  return Number.isInteger(y) && y > 2000 && y < 2100 ? y : new Date().getFullYear();
};

// ── Regular runs ────────────────────────────────────────────────────────────

router.post('/preview', requirePermission(Permission.ViewPayroll), validateBody(RunPayrollPreviewRequestSchema), async (req, res, next) => {
  try {
    const { buildPayrollPreview } = await import('../use-cases/payroll/payroll-engine.js');
    const { preview } = await buildPayrollPreview(req.body, engineDeps(req));
    res.json({ success: true, data: preview });
  } catch (err) { next(err); }
});

router.post('/run', requirePermission(Permission.RunPayroll), validateBody(RunPayrollRequestSchema), async (req, res, next) => {
  try {
    const { postPayrollRun } = await import('../use-cases/payroll/payroll-engine.js');
    const result = await postPayrollRun(req.body, req.user!.employeeId, engineDeps(req));
    res.json({ success: true, data: result });
  } catch (err) {
    if (alreadyRun(err, res)) return;
    next(err);
  }
});

router.get('/runs', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const { listPayrollRuns } = await import('../use-cases/payroll/payroll-history.js');
    const storeId = typeof req.query.storeId === 'string' && req.query.storeId !== 'all' ? req.query.storeId : undefined;
    const year = req.query.year ? yearParam(req.query.year) : undefined;
    res.json({ success: true, data: await listPayrollRuns(storeId, year) });
  } catch (err) { next(err); }
});

router.get('/runs/:id', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const { getPayrollRun } = await import('../use-cases/payroll/payroll-history.js');
    res.json({ success: true, data: await getPayrollRun(String(req.params.id)) });
  } catch (err) { next(err); }
});

router.post('/runs/:id/void', requirePermission(Permission.RunPayroll), validateBody(VoidPayrollRunRequestSchema), async (req, res, next) => {
  try {
    const { voidPayrollRun } = await import('../use-cases/payroll/payroll-history.js');
    await voidPayrollRun(String(req.params.id), req.user!.employeeId, req.body.reason, req.body.reversalDate);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

router.get('/payslips', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const employeeId = String(req.query.employeeId ?? '');
    if (!employeeId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employeeId is required' } });
      return;
    }
    const { listEmployeePayslips } = await import('../use-cases/payroll/payroll-history.js');
    res.json({ success: true, data: await listEmployeePayslips(employeeId) });
  } catch (err) { next(err); }
});

router.get('/payment-accounts', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const storeId = String(req.query.storeId ?? '');
    const { loadPaymentAccounts } = await import('../use-cases/payroll/payroll-engine.js');
    res.json({ success: true, data: await loadPaymentAccounts(storeId) });
  } catch (err) { next(err); }
});

// ── 13th month ──────────────────────────────────────────────────────────────

router.get('/thirteenth-month', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const { getThirteenthMonthOverview } = await import('../use-cases/payroll/thirteenth-month.js');
    const storeId = String(req.query.storeId ?? '');
    res.json({ success: true, data: await getThirteenthMonthOverview(storeId, yearParam(req.query.year), engineDeps(req)) });
  } catch (err) { next(err); }
});

router.post('/thirteenth-month/run', requirePermission(Permission.RunPayroll), validateBody(ThirteenthMonthRunRequestSchema), async (req, res, next) => {
  try {
    const { runThirteenthMonth } = await import('../use-cases/payroll/thirteenth-month.js');
    res.json({ success: true, data: await runThirteenthMonth(req.body, req.user!.employeeId, engineDeps(req)) });
  } catch (err) {
    if (alreadyRun(err, res)) return;
    next(err);
  }
});

// ── Public holidays ─────────────────────────────────────────────────────────

router.get('/holidays', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const year = yearParam(req.query.year);
    const { data, error } = await getSupabaseClient()
      .from('public_holidays')
      .select('id, holiday_date, name, premium_pct, store_id')
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`)
      .order('holiday_date');
    if (error) throw new Error(error.message);
    res.json({
      success: true,
      data: (data ?? []).map((h) => ({
        id: h.id,
        holidayDate: h.holiday_date,
        name: h.name,
        premiumPct: Number(h.premium_pct),
        storeId: h.store_id,
      })),
    });
  } catch (err) { next(err); }
});

router.post('/holidays', requirePermission(Permission.RunPayroll), validateBody(PublicHolidaySchema), async (req, res, next) => {
  try {
    const { holidayDate, name, premiumPct, storeId } = req.body;
    const { data, error } = await getSupabaseClient()
      .from('public_holidays')
      .insert({ holiday_date: holidayDate, name, premium_pct: premiumPct, store_id: storeId ?? null, created_by: req.user!.employeeId })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'That date already has a holiday for this store.' } });
        return;
      }
      throw new Error(error.message);
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/holidays/:id', requirePermission(Permission.RunPayroll), validateBody(PublicHolidaySchema), async (req, res, next) => {
  try {
    const { holidayDate, name, premiumPct, storeId } = req.body;
    const { error } = await getSupabaseClient()
      .from('public_holidays')
      .update({ holiday_date: holidayDate, name, premium_pct: premiumPct, store_id: storeId ?? null })
      .eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

router.delete('/holidays/:id', requirePermission(Permission.RunPayroll), async (req, res, next) => {
  try {
    const { error } = await getSupabaseClient().from('public_holidays').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

// ── Vehicle allowance ───────────────────────────────────────────────────────

router.get('/allowance', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const { listAllowanceBalances } = await import('../use-cases/payroll/vehicle-allowance.js');
    res.json({ success: true, data: await listAllowanceBalances(String(req.query.storeId ?? '')) });
  } catch (err) { next(err); }
});

router.get('/allowance/:employeeId', async (req, res, next) => {
  try {
    const self = req.user!.employeeId === req.params.employeeId;
    if (!self && !req.user!.permissions.includes(Permission.ViewPayroll)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Missing required permissions: can_view_payroll' } });
      return;
    }
    const { getAllowanceLedger } = await import('../use-cases/payroll/vehicle-allowance.js');
    res.json({ success: true, data: await getAllowanceLedger(String(req.params.employeeId)) });
  } catch (err) { next(err); }
});

// Withdrawals are made at the till by whoever runs it, so expense rights are enough.
router.post('/allowance/withdraw', requirePermission(Permission.EditExpenses), validateBody(AllowanceWithdrawalSchema), async (req, res, next) => {
  try {
    const { withdrawAllowance } = await import('../use-cases/payroll/vehicle-allowance.js');
    res.json({ success: true, data: await withdrawAllowance(req.body, req.user!.employeeId) });
  } catch (err) { next(err); }
});

router.post('/allowance/adjust', requirePermission(Permission.RunPayroll), validateBody(AllowanceAdjustmentSchema), async (req, res, next) => {
  try {
    const { adjustAllowance } = await import('../use-cases/payroll/vehicle-allowance.js');
    await adjustAllowance(req.body, req.user!.employeeId);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// ── Contribution remittances ────────────────────────────────────────────────

router.get('/remittances', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const { getRemittanceOverview } = await import('../use-cases/payroll/remittances.js');
    res.json({ success: true, data: await getRemittanceOverview(yearParam(req.query.year)) });
  } catch (err) { next(err); }
});

router.post('/remittances', requirePermission(Permission.RunPayroll), validateBody(ContributionRemittanceSchema), async (req, res, next) => {
  try {
    const { recordRemittance } = await import('../use-cases/payroll/remittances.js');
    res.json({ success: true, data: await recordRemittance(req.body, req.user!.employeeId) });
  } catch (err) { next(err); }
});

// ── Rate history ────────────────────────────────────────────────────────────

router.get('/rate-history/:employeeId', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('employee_rate_history')
      .select('id, effective_from, rate_type, basic_rate, overtime_rate, nine_pm_bonus_rate, commission_rate, note, created_by, created_at')
      .eq('employee_id', req.params.employeeId)
      .order('effective_from', { ascending: false });
    if (error) throw new Error(error.message);
    const today = formatManilaDate();
    let currentMarked = false;
    res.json({
      success: true,
      data: (data ?? []).map((r) => {
        const isCurrent = !currentMarked && String(r.effective_from) <= today;
        if (isCurrent) currentMarked = true;
        return {
          id: r.id,
          effectiveFrom: r.effective_from,
          rateType: r.rate_type,
          basicRate: Number(r.basic_rate),
          overtimeRate: Number(r.overtime_rate),
          ninePmBonusRate: Number(r.nine_pm_bonus_rate),
          commissionRate: Number(r.commission_rate),
          note: r.note,
          createdAt: r.created_at,
          isCurrent,
          isFuture: String(r.effective_from) > today,
        };
      }),
    });
  } catch (err) { next(err); }
});

router.delete('/rate-history/:id', requirePermission(Permission.RunPayroll), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data: row, error: rErr } = await sb.from('employee_rate_history').select('employee_id').eq('id', req.params.id).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rate entry not found' } });
      return;
    }
    const { count } = await sb.from('employee_rate_history').select('id', { count: 'exact', head: true }).eq('employee_id', row.employee_id);
    if ((count ?? 0) <= 1) {
      res.status(400).json({ success: false, error: { code: 'LAST_RATE', message: 'An employee needs at least one rate.' } });
      return;
    }
    const { error } = await sb.from('employee_rate_history').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

export { router as payrollRoutes };
