import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import {
  Permission,
  CalculatePayslipRequestSchema,
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

router.post('/run', requirePermission(Permission.ViewPayroll), validateBody(RunPayrollRequestSchema), async (req, res, next) => {
  try {
    const { runPayroll } = await import('../use-cases/payroll/run-payroll.js');
    const result = await runPayroll(
      { ...req.body, approvedBy: req.user!.employeeId },
      {
        employees: req.app.locals.deps.employeeRepo,
        timesheets: req.app.locals.deps.timesheetRepo,
        payroll: req.app.locals.deps.payrollPort,
        accounting: req.app.locals.deps.accountingPort,
      },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as payrollRoutes };
