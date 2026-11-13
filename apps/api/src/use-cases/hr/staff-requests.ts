import { randomUUID } from 'node:crypto';
import {
  Timesheet,
  DomainError,
  type EmployeeRepository,
  type ExpenseRepository,
  type TimesheetRepository,
} from '@lolas/domain';
import type {
  CreateLeaveRequest,
  CreateAdvanceRequest,
  ApproveAdvanceRequest,
  AcknowledgePayslipRequest,
} from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { resolvePayrollLedger } from '../../adapters/supabase/config-repo.js';
import { formatManilaDate } from '../../utils/manila-date.js';
import { recalculateLeaveUsed, leaveBalances } from './leave-usage.js';

type Row = Record<string, unknown>;
type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
type LeaveType = 'holiday' | 'sick' | 'unpaid';

const LEAVE_DAY_TYPE: Record<LeaveType, string> = {
  holiday: 'Holiday',
  sick: 'Sick',
  unpaid: 'Unpaid Leave',
};

export const LEAVE_LABEL: Record<LeaveType, string> = {
  holiday: 'Holiday leave',
  sick: 'Sick leave',
  unpaid: 'Unpaid leave',
};

export interface LeaveRequestRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  dates: string[];
  reason: string | null;
  status: RequestStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface AdvanceRequestRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  amount: number;
  reason: string | null;
  paydayType: 'mid_month' | 'end_of_month';
  status: RequestStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface PayslipAcknowledgement {
  id: string;
  payslipId: string;
  employeeId: string;
  employeeName: string;
  status: 'confirmed' | 'disputed';
  netPay: number;
  signedName: string;
  signaturePng: string | null;
  comment: string | null;
  signedAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

/** Sign-off started with the November 2026 payroll; older payslips were never meant to be signed. */
export const SIGN_OFF_FROM = '2026-11-01';

const sb = () => getSupabaseClient();
const s = (v: unknown): string | null => (v == null ? null : String(v));

function addDays(d: string, n: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

/** Mon–Sat dates in the range; Sunday is the shop's rest day and never costs leave. */
export function leaveDates(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) out.push(d);
    if (out.length > 62) throw new DomainError('Leave requests are limited to two months at a time');
  }
  return out;
}

async function namesFor(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await sb().from('employees').select('id, full_name').in('id', unique);
  for (const e of (data ?? []) as Row[]) out.set(String(e.id), String(e.full_name ?? ''));
  return out;
}

async function employeeStore(employeeId: string): Promise<{ storeId: string; fullName: string }> {
  const { data, error } = await sb().from('employees').select('store_id, full_name, status').eq('id', employeeId).maybeSingle();
  if (error) throw new Error(`Failed to load employee: ${error.message}`);
  if (!data) throw new DomainError('Your login is not linked to an employee profile');
  if (!data.store_id) throw new DomainError('Your profile has no store; ask a manager to set one');
  return { storeId: String(data.store_id), fullName: String(data.full_name ?? '') };
}

function toLeave(r: Row, names: Map<string, string>): LeaveRequestRecord {
  const start = String(r.start_date);
  const end = String(r.end_date);
  return {
    id: String(r.id),
    employeeId: String(r.employee_id),
    employeeName: names.get(String(r.employee_id)) ?? '',
    storeId: String(r.store_id),
    leaveType: r.leave_type as LeaveType,
    startDate: start,
    endDate: end,
    days: Number(r.days),
    dates: leaveDates(start, end),
    reason: s(r.reason),
    status: r.status as RequestStatus,
    reviewedByName: r.reviewed_by ? names.get(String(r.reviewed_by)) ?? null : null,
    reviewedAt: s(r.reviewed_at),
    reviewNote: s(r.review_note),
    createdAt: String(r.created_at),
  };
}

function toAdvance(r: Row, names: Map<string, string>): AdvanceRequestRecord {
  return {
    id: String(r.id),
    employeeId: String(r.employee_id),
    employeeName: names.get(String(r.employee_id)) ?? '',
    storeId: String(r.store_id),
    amount: Number(r.amount),
    reason: s(r.reason),
    paydayType: r.payday_type as AdvanceRequestRecord['paydayType'],
    status: r.status as RequestStatus,
    reviewedByName: r.reviewed_by ? names.get(String(r.reviewed_by)) ?? null : null,
    reviewedAt: s(r.reviewed_at),
    reviewNote: s(r.review_note),
    createdAt: String(r.created_at),
  };
}

// ── Leave ───────────────────────────────────────────────────────────────────

async function assertNoClash(employeeId: string, dates: string[], ignoreRequestId?: string): Promise<void> {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const [tsRes, reqRes] = await Promise.all([
    sb().from('timesheets').select('date, day_type').eq('employee_id', employeeId).gte('date', first).lte('date', last),
    sb().from('leave_requests').select('id, start_date, end_date').eq('employee_id', employeeId)
      .in('status', ['pending', 'approved']).lte('start_date', last).gte('end_date', first),
  ]);
  if (tsRes.error) throw new Error(`Failed to check timesheets: ${tsRes.error.message}`);
  if (reqRes.error) throw new Error(`Failed to check leave requests: ${reqRes.error.message}`);
  const wanted = new Set(dates);
  const taken = ((tsRes.data ?? []) as Row[]).filter((t) => wanted.has(String(t.date)));
  if (taken.length > 0) {
    throw new DomainError(`There is already a timesheet on ${taken.map((t) => String(t.date)).join(', ')}`);
  }
  const overlapping = ((reqRes.data ?? []) as Row[]).filter((r) => String(r.id) !== ignoreRequestId);
  if (overlapping.length > 0) {
    throw new DomainError('These dates overlap another leave request');
  }
}

async function pendingDays(employeeId: string, leaveType: LeaveType, ignoreRequestId?: string): Promise<number> {
  const { data, error } = await sb().from('leave_requests').select('id, days')
    .eq('employee_id', employeeId).eq('leave_type', leaveType).eq('status', 'pending');
  if (error) throw new Error(`Failed to load pending leave: ${error.message}`);
  return ((data ?? []) as Row[]).filter((r) => String(r.id) !== ignoreRequestId).reduce((t, r) => t + Number(r.days), 0);
}

async function assertBalance(employeeId: string, leaveType: LeaveType, days: number, asOf: string, ignoreRequestId?: string): Promise<void> {
  if (leaveType === 'unpaid') return;
  await recalculateLeaveUsed([employeeId]);
  const balances = await leaveBalances(employeeId, asOf);
  const available = balances[leaveType].remaining - await pendingDays(employeeId, leaveType, ignoreRequestId);
  if (days > available) {
    const probation = balances.onProbation ? ' You are still on probation, so leave builds up monthly.' : '';
    throw new DomainError(
      `Not enough ${leaveType} leave: ${days} day${days === 1 ? '' : 's'} requested, ${Math.max(0, available)} available.${probation} You can apply for unpaid leave instead.`,
    );
  }
}

export async function createLeaveRequest(employeeId: string, input: CreateLeaveRequest): Promise<LeaveRequestRecord> {
  const { storeId } = await employeeStore(employeeId);
  const dates = leaveDates(input.startDate, input.endDate);
  if (dates.length === 0) throw new DomainError('Pick at least one day other than Sunday');
  await assertNoClash(employeeId, dates);
  await assertBalance(employeeId, input.leaveType, dates.length, input.startDate);

  const { data, error } = await sb().from('leave_requests').insert({
    employee_id: employeeId,
    store_id: storeId,
    leave_type: input.leaveType,
    start_date: input.startDate,
    end_date: input.endDate,
    days: dates.length,
    reason: input.reason?.trim() || null,
  }).select('*').single();
  if (error) throw new Error(`Failed to save leave request: ${error.message}`);
  return toLeave(data as Row, await namesFor([employeeId]));
}

export async function listLeaveRequests(filter: { employeeId?: string; status?: RequestStatus; storeId?: string }): Promise<LeaveRequestRecord[]> {
  let q = sb().from('leave_requests').select('*').order('start_date', { ascending: false }).limit(300);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.storeId) q = q.eq('store_id', filter.storeId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load leave requests: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const names = await namesFor(rows.flatMap((r) => [s(r.employee_id), s(r.reviewed_by)]));
  return rows.map((r) => toLeave(r, names));
}

async function loadPending(table: 'leave_requests' | 'advance_requests', id: string): Promise<Row> {
  const { data, error } = await sb().from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load request: ${error.message}`);
  if (!data) throw new DomainError('Request not found');
  if (data.status !== 'pending') throw new DomainError(`This request has already been ${data.status}`);
  return data as Row;
}

export async function cancelOwnRequest(table: 'leave_requests' | 'advance_requests', id: string, employeeId: string): Promise<void> {
  const row = await loadPending(table, id);
  if (row.employee_id !== employeeId) throw new DomainError('Request not found');
  const { error } = await sb().from(table).update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending');
  if (error) throw new Error(`Failed to cancel request: ${error.message}`);
}

function assertNotOwn(employeeId: unknown, reviewerId: string): void {
  if (String(employeeId) === reviewerId) {
    throw new DomainError('You can’t review your own request. Another manager needs to handle it.');
  }
}

export async function rejectRequest(table: 'leave_requests' | 'advance_requests', id: string, reviewerId: string, note?: string): Promise<void> {
  const row = await loadPending(table, id);
  assertNotOwn(row.employee_id, reviewerId);
  const { error } = await sb().from(table).update({
    status: 'rejected',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_note: note?.trim() || null,
  }).eq('id', id).eq('status', 'pending');
  if (error) throw new Error(`Failed to reject request: ${error.message}`);
}

/** Approving writes one approved timesheet per leave day, which is what payroll and balances read. */
export async function approveLeaveRequest(
  id: string,
  reviewerId: string,
  note: string | undefined,
  deps: { timesheets: TimesheetRepository; employees: EmployeeRepository },
): Promise<LeaveRequestRecord> {
  const row = await loadPending('leave_requests', id);
  assertNotOwn(row.employee_id, reviewerId);
  const employeeId = String(row.employee_id);
  const leaveType = row.leave_type as LeaveType;
  const dates = leaveDates(String(row.start_date), String(row.end_date));
  await assertNoClash(employeeId, dates, id);
  await assertBalance(employeeId, leaveType, dates.length, String(row.start_date), id);

  const employee = await deps.employees.findById(employeeId);
  if (!employee) throw new DomainError('Employee not found');

  // Claim the request first so a double click can't create the days twice.
  const { data: claimed, error: cErr } = await sb().from('leave_requests').update({
    status: 'approved',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_note: note?.trim() || null,
  }).eq('id', id).eq('status', 'pending').select('id');
  if (cErr) throw new Error(`Failed to approve request: ${cErr.message}`);
  if (!claimed || claimed.length === 0) throw new DomainError('This request was already handled');

  const dayType = LEAVE_DAY_TYPE[leaveType];
  const created: string[] = [];
  try {
    for (const date of dates) {
      const ts = Timesheet.create({
        id: randomUUID(),
        date,
        employeeId,
        name: employee.fullName,
        dayType,
        timeIn: null,
        timeOut: null,
        regularHours: 0,
        overtimeHours: 0,
        ninePmReturnsCount: 0,
        dailyNotes: `${LEAVE_LABEL[leaveType]} (approved request)`,
        payrollStatus: 'Approved',
        silInflation: 0,
        storeId: String(row.store_id),
        createdAt: new Date(),
      });
      await deps.timesheets.save(ts);
      created.push(ts.id);
    }
  } catch (err) {
    if (created.length > 0) await sb().from('timesheets').delete().in('id', created);
    await sb().from('leave_requests').update({ status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null }).eq('id', id);
    throw err;
  }

  await sb().from('leave_requests').update({ timesheet_ids: created }).eq('id', id);
  await recalculateLeaveUsed([employeeId]);
  const [rec] = await listLeaveRequests({ employeeId }).then((all) => all.filter((r) => r.id === id));
  return rec;
}

// ── Cash advances ───────────────────────────────────────────────────────────

export async function createAdvanceRequest(employeeId: string, input: CreateAdvanceRequest): Promise<AdvanceRequestRecord> {
  const { storeId } = await employeeStore(employeeId);
  const { count, error: cErr } = await sb().from('advance_requests').select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId).eq('status', 'pending');
  if (cErr) throw new Error(`Failed to check advance requests: ${cErr.message}`);
  if ((count ?? 0) > 0) throw new DomainError('You already have an advance request waiting for approval');

  const { data, error } = await sb().from('advance_requests').insert({
    employee_id: employeeId,
    store_id: storeId,
    amount: Math.round(input.amount * 100) / 100,
    reason: input.reason?.trim() || null,
    payday_type: input.paydayType,
  }).select('*').single();
  if (error) throw new Error(`Failed to save advance request: ${error.message}`);
  return toAdvance(data as Row, await namesFor([employeeId]));
}

export async function listAdvanceRequests(filter: { employeeId?: string; status?: RequestStatus; storeId?: string }): Promise<AdvanceRequestRecord[]> {
  let q = sb().from('advance_requests').select('*').order('created_at', { ascending: false }).limit(300);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.storeId) q = q.eq('store_id', filter.storeId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load advance requests: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const names = await namesFor(rows.flatMap((r) => [s(r.employee_id), s(r.reviewed_by)]));
  return rows.map((r) => toAdvance(r, names));
}

export async function approveAdvanceRequest(
  id: string,
  reviewerId: string,
  input: ApproveAdvanceRequest,
  deps: { expenses: ExpenseRepository },
): Promise<{ expenseId: string }> {
  const row = await loadPending('advance_requests', id);
  assertNotOwn(row.employee_id, reviewerId);
  const ledger = await resolvePayrollLedger(String(row.store_id));
  if (!ledger.advanceAccountId) throw new DomainError('No staff advance account is set up in the chart of accounts');

  const { data: claimed, error: cErr } = await sb().from('advance_requests').update({
    status: 'approved',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_note: input.note?.trim() || null,
  }).eq('id', id).eq('status', 'pending').select('id');
  if (cErr) throw new Error(`Failed to approve request: ${cErr.message}`);
  if (!claimed || claimed.length === 0) throw new DomainError('This request was already handled');

  const names = await namesFor([String(row.employee_id)]);
  try {
    const { grantCashAdvance } = await import('./grant-cash-advance.js');
    const result = await grantCashAdvance({
      storeId: String(row.store_id),
      employeeId: String(row.employee_id),
      amount: Number(row.amount),
      date: formatManilaDate(),
      repaymentType: 'lump-sum',
      deductOn: input.deductOn ?? (row.payday_type as 'mid_month' | 'end_of_month'),
      expenseAccountId: ledger.advanceAccountId,
      cashAccountId: input.cashAccountId,
      description: `Cash advance: ${names.get(String(row.employee_id)) ?? 'employee'}${row.reason ? ` - ${String(row.reason)}` : ''}`,
    }, deps);
    await sb().from('advance_requests').update({ expense_id: result.expenseId }).eq('id', id);
    return { expenseId: result.expenseId };
  } catch (err) {
    await sb().from('advance_requests').update({ status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null }).eq('id', id);
    throw err;
  }
}

// ── Payslip sign-off ────────────────────────────────────────────────────────

function toAck(r: Row, names: Map<string, string>): PayslipAcknowledgement {
  return {
    id: String(r.id),
    payslipId: String(r.payslip_id),
    employeeId: String(r.employee_id),
    employeeName: names.get(String(r.employee_id)) ?? '',
    status: r.status as PayslipAcknowledgement['status'],
    netPay: Number(r.net_pay),
    signedName: String(r.signed_name),
    signaturePng: s(r.signature_png),
    comment: s(r.comment),
    signedAt: String(r.signed_at),
    resolvedByName: r.resolved_by ? names.get(String(r.resolved_by)) ?? null : null,
    resolvedAt: s(r.resolved_at),
    resolutionNote: s(r.resolution_note),
  };
}

export async function listAcknowledgements(filter: { payslipIds?: string[]; employeeId?: string; status?: 'disputed'; unresolved?: boolean }): Promise<PayslipAcknowledgement[]> {
  let q = sb().from('payslip_acknowledgements').select('*').order('signed_at', { ascending: false });
  if (filter.payslipIds) {
    if (filter.payslipIds.length === 0) return [];
    q = q.in('payslip_id', filter.payslipIds);
  }
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.unresolved) q = q.is('resolved_at', null);
  const { data, error } = await q.limit(500);
  if (error) throw new Error(`Failed to load payslip sign-offs: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const names = await namesFor(rows.flatMap((r) => [s(r.employee_id), s(r.resolved_by)]));
  return rows.map((r) => toAck(r, names));
}

export async function acknowledgePayslip(
  employeeId: string,
  payslipId: string,
  input: AcknowledgePayslipRequest,
  meta: { ip: string | null; userAgent: string | null },
): Promise<PayslipAcknowledgement> {
  const { data: slip, error } = await sb().from('payslips')
    .select('id, employee_id, net_pay, payroll_runs!payroll_run_id(status)')
    .eq('id', payslipId).maybeSingle();
  if (error) throw new Error(`Failed to load payslip: ${error.message}`);
  if (!slip || slip.employee_id !== employeeId) throw new DomainError('Payslip not found');
  const run = slip.payroll_runs as { status: string } | Array<{ status: string }> | null;
  const runStatus = Array.isArray(run) ? run[0]?.status : run?.status;
  if (runStatus === 'voided') throw new DomainError('This payslip was voided and replaced; sign the new one instead');

  const { data: existing } = await sb().from('payslip_acknowledgements').select('id, status, resolved_at').eq('payslip_id', payslipId).maybeSingle();
  // A dispute can be re-signed as confirmed once it's been sorted out; a confirmation is final.
  if (existing && existing.status === 'confirmed') throw new DomainError('You have already signed this payslip');

  const record = {
    payslip_id: payslipId,
    employee_id: employeeId,
    status: input.status,
    net_pay: Number(slip.net_pay),
    signed_name: input.signedName.trim(),
    signature_png: input.signaturePng ?? null,
    comment: input.comment?.trim() || null,
    ip_address: meta.ip,
    user_agent: meta.userAgent?.slice(0, 300) ?? null,
    signed_at: new Date().toISOString(),
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
  };
  const { data, error: wErr } = existing
    ? await sb().from('payslip_acknowledgements').update(record).eq('id', existing.id).select('*').single()
    : await sb().from('payslip_acknowledgements').insert(record).select('*').single();
  if (wErr) throw new Error(`Failed to save sign-off: ${wErr.message}`);
  return toAck(data as Row, await namesFor([employeeId]));
}

export async function resolveDispute(ackId: string, resolverId: string, note: string): Promise<void> {
  const { data: ack, error: aErr } = await sb().from('payslip_acknowledgements').select('employee_id').eq('id', ackId).maybeSingle();
  if (aErr) throw new Error(`Failed to load sign-off: ${aErr.message}`);
  if (!ack) throw new DomainError('Sign-off not found');
  assertNotOwn(ack.employee_id, resolverId);
  const { data, error } = await sb().from('payslip_acknowledgements')
    .update({ resolved_by: resolverId, resolved_at: new Date().toISOString(), resolution_note: note.trim() })
    .eq('id', ackId).eq('status', 'disputed').is('resolved_at', null).select('id');
  if (error) throw new Error(`Failed to resolve dispute: ${error.message}`);
  if (!data || data.length === 0) throw new DomainError('This dispute is already resolved');
}

// ── Portal summary ──────────────────────────────────────────────────────────

export async function portalSummary(employeeId: string) {
  await recalculateLeaveUsed([employeeId]);
  const today = formatManilaDate();
  const [emp, balances, advRes, ledgerRes, leave, advances, slipsRes, acks] = await Promise.all([
    sb().from('employees').select('full_name, role, start_date, probation_end_date, monthly_bike_allowance, store_id').eq('id', employeeId).maybeSingle(),
    leaveBalances(employeeId, today),
    sb().from('cash_advance_schedules').select('id, granted_date, payday_type, remaining_balance, total_amount')
      .eq('employee_id', employeeId).gt('remaining_balance', 0).order('granted_date'),
    sb().from('employee_allowance_ledger').select('amount').eq('employee_id', employeeId),
    listLeaveRequests({ employeeId }),
    listAdvanceRequests({ employeeId }),
    sb().from('payslips').select('id, payroll_runs!payroll_run_id(status)').eq('employee_id', employeeId).gte('period_end', SIGN_OFF_FROM),
    listAcknowledgements({ employeeId }),
  ]);
  if (emp.error) throw new Error(emp.error.message);
  if (!emp.data) throw new DomainError('Your login is not linked to an employee profile');
  for (const r of [advRes, ledgerRes, slipsRes]) if (r.error) throw new Error(r.error.message);

  const pendingDaysOf = (t: LeaveType) => leave.filter((l) => l.status === 'pending' && l.leaveType === t).reduce((a, l) => a + l.days, 0);
  const signed = new Set(acks.filter((a) => a.status === 'confirmed').map((a) => a.payslipId));
  const postedSlips = ((slipsRes.data ?? []) as Row[]).filter((r) => {
    const run = r.payroll_runs as { status: string } | Array<{ status: string }> | null;
    return (Array.isArray(run) ? run[0]?.status : run?.status) !== 'voided';
  });

  return {
    employee: {
      id: employeeId,
      fullName: String(emp.data.full_name ?? ''),
      role: s(emp.data.role),
      startDate: s(emp.data.start_date),
      probationEndDate: s(emp.data.probation_end_date),
    },
    leave: {
      onProbation: balances.onProbation,
      holiday: { ...balances.holiday, pending: pendingDaysOf('holiday') },
      sick: { ...balances.sick, pending: pendingDaysOf('sick') },
      unpaidTakenThisYear: leave.filter((l) => l.status === 'approved' && l.leaveType === 'unpaid' && l.startDate >= `${today.slice(0, 4)}-01-01`)
        .reduce((a, l) => a + l.days, 0),
    },
    advances: {
      outstanding: Math.round(((advRes.data ?? []) as Row[]).reduce((a, r) => a + Number(r.remaining_balance), 0) * 100) / 100,
      schedules: ((advRes.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        grantedDate: s(r.granted_date),
        paydayType: String(r.payday_type),
        remaining: Number(r.remaining_balance),
      })),
      pendingRequest: advances.find((a) => a.status === 'pending') ?? null,
    },
    vehicleAllowance: {
      monthly: Number(emp.data.monthly_bike_allowance ?? 0),
      balance: Math.round(((ledgerRes.data ?? []) as Row[]).reduce((a, r) => a + Number(r.amount), 0) * 100) / 100,
    },
    payslipsToSign: postedSlips.filter((r) => !signed.has(String(r.id))).length,
  };
}
