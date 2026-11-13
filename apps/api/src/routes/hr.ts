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
  CreateEmployeeRequestSchema,
  UpdateEmployeeRequestSchema,
  GrantCashAdvanceRequestSchema,
  CashAdvanceQuerySchema,
  EditTimesheetRequestSchema,
  ReviewRequestSchema,
  ApproveAdvanceRequestSchema,
  ResolvePayslipDisputeSchema,
  CommentWorkUpdateSchema,
} from '@lolas/shared';
import { Employee as EmployeeEntity } from '@lolas/domain';
import { supabase } from '../adapters/supabase/client.js';
import { syncUserLoginAccess } from '../auth/staff-login-access.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { formatManilaDate } from '../utils/manila-date.js';

const router = Router();
router.use(authenticate);

async function recordRateChange(
  employee: EmployeeEntity,
  effectiveFrom: string,
  note: string,
  createdBy: string | null,
): Promise<void> {
  const { error } = await supabase.from('employee_rate_history').upsert(
    {
      employee_id: employee.id,
      effective_from: effectiveFrom,
      rate_type: employee.rateType,
      basic_rate: employee.basicRate,
      overtime_rate: employee.overtimeRate,
      nine_pm_bonus_rate: employee.ninePmBonusRate,
      commission_rate: employee.commissionRate,
      note,
      created_by: createdBy,
    },
    { onConflict: 'employee_id,effective_from' },
  );
  if (error) throw new Error(`Failed to record rate change: ${error.message}`);
}

router.get('/timesheets', requirePermission(Permission.ViewTimesheets), validateQuery(TimesheetQuerySchema), async (req, res, next) => {
  try {
    const { storeId, periodStart, periodEnd } = req.query as Record<string, string>;
    const period = { start: new Date(periodStart), end: new Date(periodEnd) };
    const timesheets = await req.app.locals.deps.timesheetRepo.findByPeriod(storeId, period);
    const data = timesheets.map((t) => ({
      id: t.id,
      date: t.date,
      employeeId: t.employeeId,
      name: t.name ?? null,
      dayType: t.dayType,
      timeIn: t.timeIn ?? null,
      timeOut: t.timeOut ?? null,
      regularHours: t.regularHours,
      overtimeHours: t.overtimeHours,
      ninePmReturnsCount: t.ninePmReturnsCount,
      dailyNotes: t.dailyNotes ?? null,
      payrollStatus: t.payrollStatus,
      silInflation: t.silInflation,
      storeId: t.storeId,
      dayFraction: t.dayFraction,
    }));
    res.json({ success: true, data });
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
    const { syncNinePmPayouts } = await import('../use-cases/payroll/nine-pm-payout.js');
    // The payout's journal entry is attributed to the employee who recorded it, not their login account.
    const ninePm = await syncNinePmPayouts(result.timesheetIds, req.user!.employeeId);
    const { recalculateLeaveUsed } = await import('../use-cases/hr/leave-usage.js');
    await recalculateLeaveUsed((req.body.entries as Array<{ employeeId: string }>).map((e) => e.employeeId));
    res.status(201).json({ success: true, data: { ...result, ninePmPayouts: ninePm } });
  } catch (err) { next(err); }
});

router.post('/timesheets/approve', requirePermission(Permission.ApproveTimesheets), validateBody(ApproveTimesheetsRequestSchema), async (req, res, next) => {
  try {
    const { approveTimesheets } = await import('../use-cases/hr/approve-timesheets.js');
    const result = await approveTimesheets(req.body, { timesheets: req.app.locals.deps.timesheetRepo });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.patch('/timesheets/:id', requirePermission(Permission.EditTimesheets), validateBody(EditTimesheetRequestSchema), async (req, res, next) => {
  try {
    const { editTimesheet } = await import('../use-cases/hr/edit-timesheet.js');
    const result = await editTimesheet(String(req.params.id), req.body, req.user!.userId);
    const { syncNinePmPayouts } = await import('../use-cases/payroll/nine-pm-payout.js');
    // The payout's journal entry is attributed to the employee who recorded it, not their login account.
    const ninePm = await syncNinePmPayouts([result.id], req.user!.employeeId);
    const { recalculateLeaveUsed } = await import('../use-cases/hr/leave-usage.js');
    await recalculateLeaveUsed([result.employeeId]);
    res.json({ success: true, data: { ...result, ninePmPayouts: ninePm } });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 404) {
      res.status(404).json({ success: false, error: { code: e.code, message: e.message } });
      return;
    }
    if (e.statusCode === 409) {
      res.status(409).json({ success: false, error: { code: e.code, message: e.message } });
      return;
    }
    next(err);
  }
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
      : await req.app.locals.deps.employeeRepo.findAll();
    res.json({ success: true, data: employees });
  } catch (err) { next(err); }
});

router.get('/employees/:id', requirePermission(Permission.ViewTimesheets), async (req, res, next) => {
  try {
    const employee = await req.app.locals.deps.employeeRepo.findById(req.params.id);
    if (!employee) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }
    res.json({ success: true, data: employee });
  } catch (err) { next(err); }
});

router.post('/employees', requirePermission(Permission.ManageEmployees), validateBody(CreateEmployeeRequestSchema), async (req, res, next) => {
  try {
    const body = req.body;
    const storeIds: string[] = body.storeIds;
    const primaryStoreId: string = storeIds[0];
    const now = new Date();
    const employee = EmployeeEntity.create({
      id: randomUUID(),
      storeId: primaryStoreId,
      storeIds,
      fullName: body.fullName,
      role: body.role ?? null,
      status: body.status ?? 'Active',
      birthday: body.birthday ?? null,
      emergencyContactName: body.emergencyContactName ?? null,
      emergencyContactNumber: body.emergencyContactNumber ?? null,
      startDate: body.startDate ?? null,
      probationEndDate: body.probationEndDate ?? null,
      rateType: body.rateType ?? null,
      basicRate: body.basicRate ?? 0,
      overtimeRate: body.overtimeRate ?? 0,
      ninePmBonusRate: body.ninePmBonusRate ?? 0,
      commissionRate: body.commissionRate ?? 0,
      paidAs: body.paidAs ?? null,
      defaultPaymentMethod: body.defaultPaymentMethod ?? 'cash',
      monthlyBikeAllowance: body.monthlyBikeAllowance ?? 0,
      bikeAllowanceUsed: 0,
      bikeAllowanceAccrued: 0,
      availableBalance: 0,
      thirteenthMonthAccrued: 0,
      currentCashAdvance: 0,
      holidayAllowance: body.holidayAllowance ?? 0,
      holidayUsed: 0,
      sickAllowance: body.sickAllowance ?? 0,
      sickUsed: 0,
      sssNo: body.sssNo ?? null,
      philhealthNo: body.philhealthNo ?? null,
      pagibigNo: body.pagibigNo ?? null,
      tin: body.tin ?? null,
      sssDeductionAmt: body.sssDeductionAmt ?? 0,
      philhealthDeductionAmt: body.philhealthDeductionAmt ?? 0,
      pagibigDeductionAmt: body.pagibigDeductionAmt ?? 0,
      employerSssAmt: body.employerSssAmt ?? 0,
      employerPhilhealthAmt: body.employerPhilhealthAmt ?? 0,
      employerPagibigAmt: body.employerPagibigAmt ?? 0,
      telegramUserId: body.telegramUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await req.app.locals.deps.employeeRepo.save(employee);

    const rows = storeIds.map((sid) => ({ employee_id: employee.id, store_id: sid }));
    const { error: esErr } = await supabase.from('employee_stores').insert(rows);
    if (esErr) throw new Error(`employee_stores insert failed: ${esErr.message}`);

    await recordRateChange(employee, body.rateEffectiveFrom ?? employee.startDate ?? formatManilaDate(), 'Starting rate', req.user!.employeeId);

    res.status(201).json({ success: true, data: employee });
  } catch (err) { next(err); }
});

router.put('/employees/:id', requirePermission(Permission.ManageEmployees), validateBody(UpdateEmployeeRequestSchema), async (req, res, next) => {
  try {
    const existing = await req.app.locals.deps.employeeRepo.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }

    const body = req.body;
    const storeIds: string[] = body.storeIds ?? existing.storeIds;
    const primaryStoreId: string = storeIds[0] ?? existing.storeId ?? '';
    const updated = EmployeeEntity.create({
      id: existing.id,
      storeId: primaryStoreId,
      storeIds,
      fullName: body.fullName ?? existing.fullName,
      role: body.role !== undefined ? body.role : existing.role,
      status: body.status ?? existing.status,
      birthday: body.birthday !== undefined ? body.birthday : existing.birthday,
      emergencyContactName: body.emergencyContactName !== undefined ? body.emergencyContactName : existing.emergencyContactName,
      emergencyContactNumber: body.emergencyContactNumber !== undefined ? body.emergencyContactNumber : existing.emergencyContactNumber,
      startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
      probationEndDate: body.probationEndDate !== undefined ? body.probationEndDate : existing.probationEndDate,
      rateType: body.rateType !== undefined ? body.rateType : existing.rateType,
      basicRate: body.basicRate ?? existing.basicRate,
      overtimeRate: body.overtimeRate ?? existing.overtimeRate,
      ninePmBonusRate: body.ninePmBonusRate ?? existing.ninePmBonusRate,
      commissionRate: body.commissionRate ?? existing.commissionRate,
      paidAs: body.paidAs !== undefined ? body.paidAs : existing.paidAs,
      defaultPaymentMethod: body.defaultPaymentMethod !== undefined ? body.defaultPaymentMethod : existing.defaultPaymentMethod,
      monthlyBikeAllowance: body.monthlyBikeAllowance ?? existing.monthlyBikeAllowance,
      bikeAllowanceUsed: existing.bikeAllowanceUsed,
      bikeAllowanceAccrued: existing.bikeAllowanceAccrued,
      availableBalance: existing.availableBalance,
      thirteenthMonthAccrued: existing.thirteenthMonthAccrued,
      currentCashAdvance: existing.currentCashAdvance,
      holidayAllowance: body.holidayAllowance ?? existing.holidayAllowance,
      holidayUsed: existing.holidayUsed,
      sickAllowance: body.sickAllowance ?? existing.sickAllowance,
      sickUsed: existing.sickUsed,
      sssNo: body.sssNo !== undefined ? body.sssNo : existing.sssNo,
      philhealthNo: body.philhealthNo !== undefined ? body.philhealthNo : existing.philhealthNo,
      pagibigNo: body.pagibigNo !== undefined ? body.pagibigNo : existing.pagibigNo,
      tin: body.tin !== undefined ? body.tin : existing.tin,
      sssDeductionAmt: body.sssDeductionAmt ?? existing.sssDeductionAmt,
      philhealthDeductionAmt: body.philhealthDeductionAmt ?? existing.philhealthDeductionAmt,
      pagibigDeductionAmt: body.pagibigDeductionAmt ?? existing.pagibigDeductionAmt,
      employerSssAmt: body.employerSssAmt ?? existing.employerSssAmt,
      employerPhilhealthAmt: body.employerPhilhealthAmt ?? existing.employerPhilhealthAmt,
      employerPagibigAmt: body.employerPagibigAmt ?? existing.employerPagibigAmt,
      telegramUserId: body.telegramUserId !== undefined ? body.telegramUserId : existing.telegramUserId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    const rateChanged =
      updated.basicRate !== existing.basicRate ||
      updated.overtimeRate !== existing.overtimeRate ||
      updated.ninePmBonusRate !== existing.ninePmBonusRate ||
      updated.commissionRate !== existing.commissionRate ||
      (updated.rateType ?? null) !== (existing.rateType ?? null);
    if (rateChanged && !body.rateEffectiveFrom) {
      res.status(400).json({
        success: false,
        error: { code: 'RATE_EFFECTIVE_DATE_REQUIRED', message: 'Choose the date the new pay rate applies from.' },
      });
      return;
    }

    await req.app.locals.deps.employeeRepo.save(updated);

    if (rateChanged) {
      await recordRateChange(updated, body.rateEffectiveFrom, body.rateChangeNote ?? 'Rate change', req.user!.employeeId);
    }

    // Links to archived stores are read-only and the form never lists them, so only touch what changed.
    const [{ data: linkRows, error: linkErr }, { data: archivedRows, error: archErr }] = await Promise.all([
      supabase.from('employee_stores').select('store_id').eq('employee_id', existing.id),
      supabase.from('stores').select('id').eq('is_active', false),
    ]);
    if (linkErr) throw new Error(`employee_stores lookup failed: ${linkErr.message}`);
    if (archErr) throw new Error(`stores lookup failed: ${archErr.message}`);
    const archived = new Set((archivedRows ?? []).map((s) => String(s.id)));
    const current = new Set((linkRows ?? []).map((l) => String(l.store_id)));
    const wanted = new Set(storeIds);
    const toRemove = [...current].filter((sid) => !wanted.has(sid) && !archived.has(sid));
    const toAdd = [...wanted].filter((sid) => !current.has(sid) && !archived.has(sid));

    if (toRemove.length > 0) {
      const { error: delErr } = await supabase
        .from('employee_stores')
        .delete()
        .eq('employee_id', existing.id)
        .in('store_id', toRemove);
      if (delErr) throw new Error(`employee_stores delete failed: ${delErr.message}`);
    }
    if (toAdd.length > 0) {
      const rows = toAdd.map((sid) => ({ employee_id: existing.id, store_id: sid }));
      const { error: insErr } = await supabase.from('employee_stores').insert(rows);
      if (insErr) throw new Error(`employee_stores insert failed: ${insErr.message}`);
    }

    if (existing.status !== updated.status) {
      await syncUserLoginAccess(existing.id, updated.status);
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.delete('/employees/:id', requirePermission(Permission.ManageEmployees), async (req, res, next) => {
  try {
    const existing = await req.app.locals.deps.employeeRepo.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }

    const deactivated = EmployeeEntity.create({
      ...({
        id: existing.id,
        storeId: existing.storeId,
        fullName: existing.fullName,
        role: existing.role,
        status: 'Inactive',
        birthday: existing.birthday,
        emergencyContactName: existing.emergencyContactName,
        emergencyContactNumber: existing.emergencyContactNumber,
        startDate: existing.startDate,
        probationEndDate: existing.probationEndDate,
        rateType: existing.rateType,
        basicRate: existing.basicRate,
        overtimeRate: existing.overtimeRate,
        ninePmBonusRate: existing.ninePmBonusRate,
        commissionRate: existing.commissionRate,
        paidAs: existing.paidAs,
        defaultPaymentMethod: existing.defaultPaymentMethod,
        monthlyBikeAllowance: existing.monthlyBikeAllowance,
        bikeAllowanceUsed: existing.bikeAllowanceUsed,
        bikeAllowanceAccrued: existing.bikeAllowanceAccrued,
        availableBalance: existing.availableBalance,
        thirteenthMonthAccrued: existing.thirteenthMonthAccrued,
        currentCashAdvance: existing.currentCashAdvance,
        holidayAllowance: existing.holidayAllowance,
        holidayUsed: existing.holidayUsed,
        sickAllowance: existing.sickAllowance,
        sickUsed: existing.sickUsed,
        sssNo: existing.sssNo,
        philhealthNo: existing.philhealthNo,
        pagibigNo: existing.pagibigNo,
        tin: existing.tin,
        sssDeductionAmt: existing.sssDeductionAmt,
        philhealthDeductionAmt: existing.philhealthDeductionAmt,
        pagibigDeductionAmt: existing.pagibigDeductionAmt,
        employerSssAmt: existing.employerSssAmt,
        employerPhilhealthAmt: existing.employerPhilhealthAmt,
        employerPagibigAmt: existing.employerPagibigAmt,
        telegramUserId: existing.telegramUserId,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      }),
    });

    await req.app.locals.deps.employeeRepo.save(deactivated);
    await syncUserLoginAccess(existing.id, 'Inactive');
    res.json({ success: true, data: { id: existing.id, status: 'Inactive' } });
  } catch (err) { next(err); }
});

// ── POST /cash-advances — grant a cash advance to an employee ──
router.post(
  '/cash-advances',
  requirePermission(Permission.ManageEmployees),
  validateBody(GrantCashAdvanceRequestSchema),
  async (req, res, next) => {
    try {
      const { grantCashAdvance } = await import('../use-cases/hr/grant-cash-advance.js');
      const result = await grantCashAdvance(req.body, {
        expenses: req.app.locals.deps.expenseRepo,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /cash-advances — list active advances for an employee ──
router.get(
  '/cash-advances',
  requirePermission(Permission.ViewTimesheets),
  validateQuery(CashAdvanceQuerySchema),
  async (req, res, next) => {
    try {
      const { employeeId } = req.query as { employeeId: string; storeId: string };
      const { data, error } = await supabase
        .from('cash_advance_schedules')
        .select('id, employee_id, expense_id, total_amount, granted_date, deduction_per_period, remaining_balance, start_date')
        .eq('employee_id', employeeId)
        .gt('remaining_balance', 0)
        .order('granted_date', { ascending: false });

      if (error) throw new Error(`Failed to fetch cash advance schedules: ${error.message}`);

      const schedules = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        employeeId: r.employee_id,
        expenseId: r.expense_id ?? null,
        totalAmount: Number(r.total_amount ?? 0),
        grantedDate: r.granted_date,
        deductionPerPeriod: Number(r.deduction_per_period ?? 0),
        remainingBalance: Number(r.remaining_balance ?? 0),
        startDate: r.start_date,
        repaymentType: 'installments',
      }));

      res.json({ success: true, data: schedules });
    } catch (err) {
      next(err);
    }
  },
);

// ── Staff requests (leave, advances) and payslip sign-off review ──

const requestStatus = (v: unknown) =>
  (['pending', 'approved', 'rejected', 'cancelled'] as const).find((x) => x === v);

router.get('/requests', requirePermission(Permission.ApproveStaffRequests), async (req, res, next) => {
  try {
    const { listLeaveRequests, listAdvanceRequests, listAcknowledgements } = await import('../use-cases/hr/staff-requests.js');
    const status = requestStatus(req.query.status);
    const storeId = typeof req.query.storeId === 'string' && req.query.storeId !== 'all' ? req.query.storeId : undefined;
    const [leave, advances, disputes] = await Promise.all([
      listLeaveRequests({ status, storeId }),
      listAdvanceRequests({ status, storeId }),
      listAcknowledgements({ status: 'disputed', unresolved: status === 'pending' }),
    ]);
    res.json({ success: true, data: { leave, advances, disputes } });
  } catch (err) { next(err); }
});

router.post('/leave-requests/:id/approve', requirePermission(Permission.ApproveStaffRequests), validateBody(ReviewRequestSchema), async (req, res, next) => {
  try {
    const { approveLeaveRequest } = await import('../use-cases/hr/staff-requests.js');
    const data = await approveLeaveRequest(String(req.params.id), req.user!.employeeId, req.body.note, {
      timesheets: req.app.locals.deps.timesheetRepo,
      employees: req.app.locals.deps.employeeRepo,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/leave-requests/:id/reject', requirePermission(Permission.ApproveStaffRequests), validateBody(ReviewRequestSchema), async (req, res, next) => {
  try {
    const { rejectRequest } = await import('../use-cases/hr/staff-requests.js');
    await rejectRequest('leave_requests', String(req.params.id), req.user!.employeeId, req.body.note);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

router.post('/advance-requests/:id/approve', requirePermission(Permission.ApproveStaffRequests), validateBody(ApproveAdvanceRequestSchema), async (req, res, next) => {
  try {
    const { approveAdvanceRequest } = await import('../use-cases/hr/staff-requests.js');
    const data = await approveAdvanceRequest(String(req.params.id), req.user!.employeeId, req.body, {
      expenses: req.app.locals.deps.expenseRepo,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/advance-requests/:id/reject', requirePermission(Permission.ApproveStaffRequests), validateBody(ReviewRequestSchema), async (req, res, next) => {
  try {
    const { rejectRequest } = await import('../use-cases/hr/staff-requests.js');
    await rejectRequest('advance_requests', String(req.params.id), req.user!.employeeId, req.body.note);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

router.get('/payslip-acknowledgements', requirePermission(Permission.ViewPayroll), async (req, res, next) => {
  try {
    const ids = String(req.query.payslipIds ?? '').split(',').filter(Boolean);
    const { listAcknowledgements } = await import('../use-cases/hr/staff-requests.js');
    res.json({ success: true, data: await listAcknowledgements({ payslipIds: ids }) });
  } catch (err) { next(err); }
});

router.post('/payslip-acknowledgements/:id/resolve', requirePermission(Permission.ApproveStaffRequests), validateBody(ResolvePayslipDisputeSchema), async (req, res, next) => {
  try {
    const { resolveDispute } = await import('../use-cases/hr/staff-requests.js');
    await resolveDispute(String(req.params.id), req.user!.employeeId, req.body.note);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

// ── Weekly work updates (fixed-salary staff) ──

router.get('/work-updates', requirePermission(Permission.ApproveStaffRequests), async (req, res, next) => {
  try {
    const { listWorkUpdates } = await import('../use-cases/hr/work-updates.js');
    const storeId = typeof req.query.storeId === 'string' && req.query.storeId !== 'all' ? req.query.storeId : undefined;
    const employeeId = typeof req.query.employeeId === 'string' && req.query.employeeId ? req.query.employeeId : undefined;
    res.json({ success: true, data: await listWorkUpdates({ storeId, employeeId }) });
  } catch (err) { next(err); }
});

router.post('/work-updates/:id/comment', requirePermission(Permission.ApproveStaffRequests), validateBody(CommentWorkUpdateSchema), async (req, res, next) => {
  try {
    const { commentOnWorkUpdate } = await import('../use-cases/hr/work-updates.js');
    await commentOnWorkUpdate(String(req.params.id), req.user!.employeeId, req.body.comment);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

export { router as hrRoutes };
