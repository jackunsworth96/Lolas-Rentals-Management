import { Router, type Request } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateLeaveRequestSchema,
  CreateAdvanceRequestSchema,
  AcknowledgePayslipSchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';

// Everything here is scoped to the logged-in employee; no permission beyond being signed in.
const router = Router();
router.use(authenticate);

function me(req: Request): string {
  const id = req.user?.employeeId;
  if (!id) throw Object.assign(new Error('Your login is not linked to an employee profile'), { statusCode: 403 });
  return id;
}

const isoDate = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

router.get('/summary', async (req, res, next) => {
  try {
    const { portalSummary } = await import('../use-cases/hr/staff-requests.js');
    res.json({ success: true, data: await portalSummary(me(req)) });
  } catch (err) { next(err); }
});

// ── Payslips ────────────────────────────────────────────────────────────────

router.get('/payslips', async (req, res, next) => {
  try {
    const employeeId = me(req);
    const { listEmployeePayslips } = await import('../use-cases/payroll/payroll-history.js');
    const { listAcknowledgements, SIGN_OFF_FROM } = await import('../use-cases/hr/staff-requests.js');
    const [payslips, acks] = await Promise.all([listEmployeePayslips(employeeId), listAcknowledgements({ employeeId })]);
    const byPayslip = new Map(acks.map((a) => [a.payslipId, a]));
    res.json({
      success: true,
      data: payslips.map((p) => ({
        ...p,
        acknowledgement: byPayslip.get(p.id) ?? null,
        requiresSignOff: p.runStatus !== 'voided' && p.periodEnd >= SIGN_OFF_FROM,
      })),
    });
  } catch (err) { next(err); }
});

router.post('/payslips/:id/acknowledge', validateBody(AcknowledgePayslipSchema), async (req, res, next) => {
  try {
    const { acknowledgePayslip } = await import('../use-cases/hr/staff-requests.js');
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.ip || null;
    const data = await acknowledgePayslip(me(req), String(req.params.id), req.body, {
      ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Timesheets ──────────────────────────────────────────────────────────────

router.get('/timesheets', async (req, res, next) => {
  try {
    const today = formatManilaDate();
    const from = isoDate(req.query.from) ?? `${today.slice(0, 7)}-01`;
    const to = isoDate(req.query.to) ?? today;
    const { data, error } = await getSupabaseClient()
      .from('timesheets')
      .select('id, date, day_type, time_in, time_out, regular_hours, overtime_hours, nine_pm_returns_count, daily_notes, payroll_status')
      .eq('employee_id', me(req))
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw new Error(`Failed to load timesheets: ${error.message}`);
    res.json({
      success: true,
      data: (data ?? []).map((t) => ({
        id: t.id,
        date: t.date,
        dayType: t.day_type,
        timeIn: t.time_in,
        timeOut: t.time_out,
        regularHours: Number(t.regular_hours ?? 0),
        overtimeHours: Number(t.overtime_hours ?? 0),
        ninePmReturnsCount: Number(t.nine_pm_returns_count ?? 0),
        notes: t.daily_notes,
        payrollStatus: t.payroll_status,
      })),
    });
  } catch (err) { next(err); }
});

// ── Leave requests ──────────────────────────────────────────────────────────

router.get('/leave-requests', async (req, res, next) => {
  try {
    const { listLeaveRequests } = await import('../use-cases/hr/staff-requests.js');
    res.json({ success: true, data: await listLeaveRequests({ employeeId: me(req) }) });
  } catch (err) { next(err); }
});

router.post('/leave-requests', validateBody(CreateLeaveRequestSchema), async (req, res, next) => {
  try {
    const { createLeaveRequest } = await import('../use-cases/hr/staff-requests.js');
    res.status(201).json({ success: true, data: await createLeaveRequest(me(req), req.body) });
  } catch (err) { next(err); }
});

router.post('/leave-requests/:id/cancel', async (req, res, next) => {
  try {
    const { cancelOwnRequest } = await import('../use-cases/hr/staff-requests.js');
    await cancelOwnRequest('leave_requests', String(req.params.id), me(req));
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

// ── Advance requests ────────────────────────────────────────────────────────

router.get('/advance-requests', async (req, res, next) => {
  try {
    const { listAdvanceRequests } = await import('../use-cases/hr/staff-requests.js');
    res.json({ success: true, data: await listAdvanceRequests({ employeeId: me(req) }) });
  } catch (err) { next(err); }
});

router.post('/advance-requests', validateBody(CreateAdvanceRequestSchema), async (req, res, next) => {
  try {
    const { createAdvanceRequest } = await import('../use-cases/hr/staff-requests.js');
    res.status(201).json({ success: true, data: await createAdvanceRequest(me(req), req.body) });
  } catch (err) { next(err); }
});

router.post('/advance-requests/:id/cancel', async (req, res, next) => {
  try {
    const { cancelOwnRequest } = await import('../use-cases/hr/staff-requests.js');
    await cancelOwnRequest('advance_requests', String(req.params.id), me(req));
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

export { router as meRoutes };
