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
} from '@lolas/shared';
import { Employee as EmployeeEntity } from '@lolas/domain';
import { supabase } from '../adapters/supabase/client.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const router = Router();
router.use(authenticate);

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
      createdAt: now,
      updatedAt: now,
    });

    await req.app.locals.deps.employeeRepo.save(employee);

    const rows = storeIds.map((sid) => ({ employee_id: employee.id, store_id: sid }));
    const { error: esErr } = await supabase.from('employee_stores').insert(rows);
    if (esErr) throw new Error(`employee_stores insert failed: ${esErr.message}`);

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
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    await req.app.locals.deps.employeeRepo.save(updated);

    const { error: delErr } = await supabase
      .from('employee_stores')
      .delete()
      .eq('employee_id', existing.id);
    if (delErr) throw new Error(`employee_stores delete failed: ${delErr.message}`);

    if (storeIds.length > 0) {
      const rows = storeIds.map((sid) => ({ employee_id: existing.id, store_id: sid }));
      const { error: insErr } = await supabase.from('employee_stores').insert(rows);
      if (insErr) throw new Error(`employee_stores re-insert failed: ${insErr.message}`);
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
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      }),
    });

    await req.app.locals.deps.employeeRepo.save(deactivated);
    res.json({ success: true, data: { id: existing.id, status: 'Inactive' } });
  } catch (err) { next(err); }
});

export { router as hrRoutes };
