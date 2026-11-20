import { leaveEntitlement, type ProbationLeaveRule } from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

type Row = Record<string, unknown>;

export function probationRule(v: unknown): ProbationLeaveRule {
  return v === 'none' || v === 'full' ? v : 'accrue';
}

const LEAVE_DAY_TYPES = { holiday: 'Holiday', sick: 'Sick' } as const;

export interface LeaveReset {
  resetMonth: number;
  resetDay: number;
}

/** A leave year: `start` is inclusive, `end` is the next year's start (exclusive). */
export interface LeaveYear {
  start: string;
  end: string;
  label: string;
}

/** First day of the current leave year for a reset month/day (defaults to 1 January). */
export function leaveYearStart(today: string, resetMonth = 1, resetDay = 1): string {
  const year = Number(today.slice(0, 4));
  const mm = String(resetMonth).padStart(2, '0');
  const dd = String(resetDay).padStart(2, '0');
  const thisYear = `${year}-${mm}-${dd}`;
  return thisYear <= today ? thisYear : `${year - 1}-${mm}-${dd}`;
}

/** The leave year containing `date`. */
export function leaveYearRange(date: string, resetMonth = 1, resetDay = 1): LeaveYear {
  const start = leaveYearStart(date, resetMonth, resetDay);
  const year = Number(start.slice(0, 4));
  const end = `${year + 1}${start.slice(4)}`;
  const label = start.slice(5) === '01-01' ? String(year) : `${year}/${String(year + 1).slice(2)}`;
  return { start, end, label };
}

function dayNumber(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd) / 86_400_000;
}

/** How many days of the inclusive range startDate..endDate fall inside the leave year. */
export function daysWithinYear(startDate: string, endDate: string, year: LeaveYear): number {
  const from = startDate > year.start ? startDate : year.start;
  const lastDay = dayNumber(year.end) - 1;
  const to = Math.min(dayNumber(endDate), lastDay);
  return Math.max(0, to - dayNumber(from) + 1);
}

async function leaveConfigFor(storeId: string | null): Promise<Row | null> {
  if (!storeId) return null;
  const { data } = await getSupabaseClient().from('leave_config').select('*').eq('store_id', storeId).maybeSingle();
  return (data as Row | null) ?? null;
}

function resetFrom(cfg: Row | null): LeaveReset {
  return { resetMonth: Number(cfg?.reset_month ?? 1), resetDay: Number(cfg?.reset_day ?? 1) };
}

export async function leaveResetFor(storeId: string | null): Promise<LeaveReset> {
  return resetFrom(await leaveConfigFor(storeId));
}

/**
 * Sets holiday_used / sick_used from the leave days on timesheets in the current
 * leave year. These columns are a display cache; balance checks count per year.
 */
export async function recalculateLeaveUsed(employeeIds: string[]): Promise<void> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return;
  const sb = getSupabaseClient();
  const today = formatManilaDate();

  const { data: emps, error } = await sb.from('employees').select('id, store_id, holiday_used, sick_used').in('id', ids);
  if (error) throw new Error(`Failed to load employees: ${error.message}`);

  for (const e of (emps ?? []) as Row[]) {
    const { resetMonth, resetDay } = resetFrom(await leaveConfigFor(e.store_id as string | null));
    const year = leaveYearRange(today, resetMonth, resetDay);
    const { data: rows, error: tErr } = await sb
      .from('timesheets')
      .select('day_type')
      .eq('employee_id', e.id as string)
      .in('day_type', [LEAVE_DAY_TYPES.holiday, LEAVE_DAY_TYPES.sick])
      .gte('date', year.start)
      .lt('date', year.end);
    if (tErr) throw new Error(`Failed to count leave days: ${tErr.message}`);
    const list = (rows ?? []) as Array<{ day_type: string }>;
    const holidayUsed = list.filter((r) => r.day_type === LEAVE_DAY_TYPES.holiday).length;
    const sickUsed = list.filter((r) => r.day_type === LEAVE_DAY_TYPES.sick).length;
    if (Number(e.holiday_used ?? 0) === holidayUsed && Number(e.sick_used ?? 0) === sickUsed) continue;
    const { error: uErr } = await sb.from('employees').update({ holiday_used: holidayUsed, sick_used: sickUsed }).eq('id', e.id as string);
    if (uErr) throw new Error(`Failed to update leave used: ${uErr.message}`);
  }
}

export interface LeaveBalance {
  allowance: number;
  entitlement: number;
  used: number;
  /** entitlement - used; pending requests are not subtracted. */
  remaining: number;
  pending: number;
}

export interface LeaveBalances {
  year: LeaveYear;
  holiday: LeaveBalance;
  sick: LeaveBalance;
  onProbation: boolean;
  probationEndDate: string | null;
}

/** Holiday and sick balances for the leave year containing `asOf`, honouring probation accrual. */
export async function leaveBalances(
  employeeId: string,
  asOf = formatManilaDate(),
  opts: { ignoreRequestId?: string } = {},
): Promise<LeaveBalances> {
  const sb = getSupabaseClient();
  const { data: e, error } = await sb
    .from('employees')
    .select('store_id, start_date, probation_end_date, holiday_allowance, sick_allowance')
    .eq('id', employeeId)
    .single();
  if (error || !e) throw new Error(`Employee ${employeeId} not found`);
  const cfg = await leaveConfigFor(e.store_id as string | null);
  const { resetMonth, resetDay } = resetFrom(cfg);
  const year = leaveYearRange(asOf, resetMonth, resetDay);

  const [tsRes, reqRes] = await Promise.all([
    sb.from('timesheets').select('day_type').eq('employee_id', employeeId)
      .in('day_type', [LEAVE_DAY_TYPES.holiday, LEAVE_DAY_TYPES.sick])
      .gte('date', year.start).lt('date', year.end),
    sb.from('leave_requests').select('id, leave_type, start_date, end_date').eq('employee_id', employeeId)
      .eq('status', 'pending').in('leave_type', ['holiday', 'sick'])
      .lt('start_date', year.end).gte('end_date', year.start),
  ]);
  if (tsRes.error) throw new Error(`Failed to count leave days: ${tsRes.error.message}`);
  if (reqRes.error) throw new Error(`Failed to load pending leave: ${reqRes.error.message}`);
  const timesheets = (tsRes.data ?? []) as Array<{ day_type: string }>;
  const pendingRequests = ((reqRes.data ?? []) as Row[]).filter((r) => String(r.id) !== opts.ignoreRequestId);

  let onProbation = false;
  const balance = (type: 'holiday' | 'sick'): LeaveBalance => {
    const holiday = type === 'holiday';
    const allowance = Number(holiday ? e.holiday_allowance : e.sick_allowance) || 0;
    const result = leaveEntitlement({
      allowance,
      startDate: (e.start_date as string | null) ?? null,
      probationEndDate: (e.probation_end_date as string | null) ?? null,
      asOf,
      probationAccrualPerMonth: Number(holiday ? cfg?.probation_accrual_holiday : cfg?.probation_accrual_sick) || 0,
      probationRule: probationRule(holiday ? cfg?.probation_rule_holiday : cfg?.probation_rule_sick),
    });
    onProbation = result.onProbation;
    const used = timesheets.filter((t) => t.day_type === LEAVE_DAY_TYPES[type]).length;
    const pending = pendingRequests
      .filter((r) => r.leave_type === type)
      .reduce((t, r) => t + daysWithinYear(String(r.start_date), String(r.end_date), year), 0);
    return { allowance, entitlement: result.entitlement, used, remaining: result.entitlement - used, pending };
  };
  const holiday = balance('holiday');
  const sick = balance('sick');
  return { year, holiday, sick, onProbation, probationEndDate: (e.probation_end_date as string | null) ?? null };
}

/** Days of leave left in the leave year containing `asOf`, honouring probation accrual. */
export async function leaveRemaining(employeeId: string, leaveType: 'holiday' | 'sick', asOf = formatManilaDate()): Promise<number> {
  const balances = await leaveBalances(employeeId, asOf);
  return balances[leaveType].remaining;
}
