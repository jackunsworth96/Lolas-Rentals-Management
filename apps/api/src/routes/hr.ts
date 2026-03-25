import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  SubmitTimesheetRequestSchema,
  ApproveTimesheetsRequestSchema,
  SubmitLeaveRequestSchema,
  TimesheetQuerySchema,
} from '@lolas/shared';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/timesheets', requirePermission(Permission.ViewTimesheets), validateQuery(TimesheetQuerySchema), async (req, res, next) => {
  try {
    const { storeId, periodStart, periodEnd } = req.query as Record<string, string>;
    const period = { start: new Date(periodStart), end: new Date(periodEnd) };
    const timesheets = await req.app.locals.deps.timesheetRepo.findByPeriod(storeId, period);
    res.json({ success: true, data: timesheets });
  } catch (err) { next(err); }
});

router.get('/timesheets/check-duplicates', requirePermission(Permission.ViewTimesheets), validateQuery(z.object({
  storeId: z.string(),
  date: z.string(),
  employeeIds: z.string(),
})), async (req, res, next) => {
  try {
    const { storeId, date, employeeIds } = req.query as Record<string, string>;
    const ids = employeeIds.split(',').filter(Boolean);
    const dayDate = new Date(date);
    const period = { start: dayDate, end: dayDate };
    const existing = await req.app.locals.deps.timesheetRepo.findByPeriod(storeId, period);
    const duplicates = existing
      .filter((t: { employeeId: string }) => ids.includes(t.employeeId))
      .map((t: { employeeId: string; date: string }) => ({ employeeId: t.employeeId, date: t.date }));
    res.json({ success: true, data: duplicates });
  } catch (err) { next(err); }
});

router.post('/timesheets', requirePermission(Permission.SubmitTimesheets), validateBody(SubmitTimesheetRequestSchema), async (req, res, next) => {
  try {
    const { submitTimesheet } = await import('../use-cases/hr/submit-timesheet.js');
    const result = await submitTimesheet(req.body, { timesheets: req.app.locals.deps.timesheetRepo });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/timesheets/approve', requirePermission(Permission.ApproveTimesheets), validateBody(ApproveTimesheetsRequestSchema), async (req, res, next) => {
  try {
    const { approveTimesheets } = await import('../use-cases/hr/approve-timesheets.js');
    const result = await approveTimesheets(req.body, { timesheets: req.app.locals.deps.timesheetRepo });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/leave', requirePermission(Permission.SubmitTimesheets), validateBody(SubmitLeaveRequestSchema), async (req, res, next) => {
  try {
    const { submitLeave } = await import('../use-cases/hr/submit-leave.js');
    const result = await submitLeave(req.body, {
      employees: req.app.locals.deps.employeeRepo,
      timesheets: req.app.locals.deps.timesheetRepo,
      leaveBalance: req.app.locals.deps.leaveBalancePort,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/employees', requirePermission(Permission.ViewTimesheets), async (req, res, next) => {
  try {
    const storeId = req.query.storeId as string;
    const employees = storeId
      ? await req.app.locals.deps.employeeRepo.findByStore(storeId)
      : await req.app.locals.deps.employeeRepo.findActive(req.user!.storeIds[0]);
    res.json({ success: true, data: employees });
  } catch (err) { next(err); }
});

export { router as hrRoutes };
