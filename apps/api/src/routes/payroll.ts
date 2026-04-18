import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import {
  Permission,
  CalculatePayslipRequestSchema,
  RunPayrollPreviewRequestSchema,
  RunPayrollRequestSchema,
} from '@lolas/shared';

const router = Router();
router.use(authenticate);

router.post('/payslip', requirePermission(Permission.ViewPayroll), validateBody(CalculatePayslipRequestSchema), async (req, res, next) => {
  try {
    const { calculatePayslip } = await import('../use-cases/payroll/calculate-payslip.js');
    const result = await calculatePayslip(req.body, {
      employees: req.app.locals.deps.employeeRepo,
      timesheets: req.app.locals.deps.timesheetRepo,
      payroll: req.app.locals.deps.payrollPort,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/preview', requirePermission(Permission.ViewPayroll), validateBody(RunPayrollPreviewRequestSchema), async (req, res, next) => {
  try {
    const { storeId, periodStart, periodEnd, isEndOfMonth, workingDaysInMonth } = req.body;
    const { calculatePayslip } = await import('../use-cases/payroll/calculate-payslip.js');
    const employees = await req.app.locals.deps.employeeRepo.findActive(storeId);
    const payslips = await Promise.all(
      employees.map((emp: { id: string }) =>
        calculatePayslip(
          { employeeId: emp.id, storeId, periodStart, periodEnd, isEndOfMonth, workingDaysInMonth },
          {
            employees: req.app.locals.deps.employeeRepo,
            timesheets: req.app.locals.deps.timesheetRepo,
            payroll: req.app.locals.deps.payrollPort,
          },
        ),
      ),
    );
    res.json({ success: true, data: payslips });
  } catch (err) { next(err); }
});

router.post('/run', requirePermission(Permission.ViewPayroll), validateBody(RunPayrollRequestSchema), async (req, res, next) => {
  try {
    const { runPayroll } = await import('../use-cases/payroll/run-payroll.js');
    const result = await runPayroll(
      { ...req.body, approvedBy: req.user!.employeeId },
      {
        employees: req.app.locals.deps.employeeRepo,
        timesheets: req.app.locals.deps.timesheetRepo,
        payroll: req.app.locals.deps.payrollPort,
      },
    );
    res.json({ success: true, data: result });
  } catch (err) {
    // AC-06: the payroll_runs header has UNIQUE (store_id, period_start,
    // period_end). A second run for the same period surfaces as Postgres
    // SQLSTATE 23505, re-thrown from the timesheet-repo wrapper with the
    // code preserved. Map it to a 409 so the UI can surface a clear message.
    const code = (err as { code?: string } | null)?.code;
    if (code === '23505') {
      res.status(409).json({
        success: false,
        error: {
          code: 'PAYROLL_ALREADY_RUN',
          message: 'Payroll has already been run for this period. Check existing payroll records before re-running.',
        },
      });
      return;
    }
    next(err);
  }
});

export { router as payrollRoutes };
