import { leaveEntitlement, type ProbationLeaveRule } from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

type Row = Record<string, unknown>;

export function probationRule(v: unknown): ProbationLeaveRule {
  return v === 'none' || v === 'full' ? v : 'accrue';
}

const LEAVE_DAY_TYPES = { holiday: 'Holiday', sick: 'Sick' } as const;

/** First day of the current leave year for a reset month/day (defaults to 1 January). */
export function leaveYearStart(today: string, resetMonth = 1, resetDay = 1): string {
  const year = Number(today.slice(0, 4));
  const mm = String(resetMonth).padStart(2, '0');
  const dd = String(resetDay).padStart(2, '0');
  const thisYear = `${year}-${mm}-${dd}`;
  return thisYear <= today ? thisYear : `${year - 1}-${mm}-${dd}`;
}

async function leaveConfigFor(storeId: string | null): Promise<Row | null> {
  if (!storeId) return null;
  const { data } = await getSupabaseClient().from('leave_config').select('*').eq('store_id', storeId).maybeSingle();
  return (data as Row | null) ?? null;
}

/**
 * Sets holiday_used / sick_used from the leave days actually on timesheets this
 * leave year, so submitting, editing or re-typing a day always keeps balances right.
 */
export async function recalculateLeaveUsed(employeeIds: string[]): Promise<void> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return;
  const sb = getSupabaseClient();
  const today = formatManilaDate();

  const { data: emps, error } = await sb.from('employees').select('id, store_id, holiday_used, sick_used').in('id', ids);
  if (error) throw new Error(`Failed to load employees: ${error.message}`);

  for (const e of (emps ?? []) as Row[]) {
    const cfg = await leaveConfigFor(e.store_id as string | null);
    const start = leaveYearStart(today, Number(cfg?.reset_month ?? 1), Number(cfg?.reset_day ?? 1));
    const { data: rows, error: tErr } = await sb
      .from('timesheets')
      .select('day_type')
      .eq('employee_id', e.id as string)
      .in('day_type', [LEAVE_DAY_TYPES.holiday, LEAVE_DAY_TYPES.sick])
      .gte('date', start);
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
  remaining: number;
}

export interface LeaveBalances {
  holiday: LeaveBalance;
  sick: LeaveBalance;
  onProbation: boolean;
  probationEndDate: string | null;
}

/** Holiday and sick balances on a date, honouring probation accrual. */
export async function leaveBalances(employeeId: string, asOf = formatManilaDate()): Promise<LeaveBalances> {
  const { data: e, error } = await getSupabaseClient()
    .from('employees')
    .select('store_id, start_date, probation_end_date, holiday_allowance, holiday_used, sick_allowance, sick_used')
    .eq('id', employeeId)
    .single();
  if (error || !e) throw new Error(`Employee ${employeeId} not found`);
  const cfg = await leaveConfigFor(e.store_id as string | null);
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
    const used = Number(holiday ? e.holiday_used : e.sick_used) || 0;
    return { allowance, entitlement: result.entitlement, used, remaining: result.entitlement - used };
  };
  const holiday = balance('holiday');
  const sick = balance('sick');
  return { holiday, sick, onProbation, probationEndDate: (e.probation_end_date as string | null) ?? null };
}

/** Days of leave the employee can take right now, honouring probation accrual. */
export async function leaveRemaining(employeeId: string, leaveType: 'holiday' | 'sick', asOf = formatManilaDate()): Promise<number> {
  const balances = await leaveBalances(employeeId, asOf);
  return balances[leaveType].remaining;
}
