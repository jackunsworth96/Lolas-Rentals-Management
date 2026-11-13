import { randomUUID } from 'node:crypto';
import {
  calculatePayroll,
  buildPayslipJournal,
  splitTipsPool,
  allocateAdvanceDeduction,
  fixedSalaryForPeriod,
  leaveEntitlement,
  round2,
  DomainError,
  type Employee,
  type EmployeeRepository,
  type PayrollDay,
  type PayrollResult,
  type PayoutLine,
  type FixedSalaryResult,
} from '@lolas/domain';
import type { RunPayrollRequest, PayrollPaymentLine, PayrollPaymentMethod } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { resolvePayrollLedger, type PayrollLedger } from '../../adapters/supabase/config-repo.js';
import { probationRule } from '../hr/leave-usage.js';

const LEAVE_DAY_TYPES = new Set(['Holiday', 'Sick']);
export const UNPAID_LEAVE_DAY_TYPE = 'Unpaid Leave';
const DAY_TYPE_PREMIUM: Record<string, number> = {
  'Regular Holiday': 100,
  'Special Holiday': 30,
  'Rest Day': 30,
};

export interface PaymentAccountOption {
  id: string;
  name: string;
  method: PayrollPaymentMethod;
}

export interface DayLine {
  date: string;
  dayType: string;
  isLeave: boolean;
  dailyRate: number;
  overtimeHours: number;
  ninePmCount: number;
  premiumPct: number;
  holidayName: string | null;
  pay: number;
}

export type RateType = 'daily' | 'monthly' | 'fixed';

export interface RateSnapshot {
  effectiveFrom: string;
  rateType: RateType;
  basicRate: number;
  overtimeRate: number;
  ninePmBonusRate: number;
  commissionRate: number;
}

export interface PayslipDraft {
  employeeId: string;
  employeeName: string;
  rateType: RateType;
  paidAs: string | null;
  defaultPaymentMethod: string;
  result: PayrollResult;
  /** Set for fixed-salary staff: how this payday's salary was worked out. */
  fixedSalary: FixedSalaryResult | null;
  dayLines: DayLine[];
  rates: RateSnapshot[];
  timesheetIds: string[];
  pomRevenue: number;
  commissionRate: number;
  tipsPool: number;
  tipsHeadcount: number;
  advanceAllocations: Array<{ scheduleId: string; amount: number }>;
  legacyAdvanceDeducted: number;
  vehicleAllowance: { opening: number; accrued: number; withdrawn: number; closing: number };
  leave: { holidayBalance: number; sickBalance: number; onProbation: boolean };
  thirteenthMonthYtd: number;
  payments: PayrollPaymentLine[];
  transferFees: number;
}

export interface PayrollPreview {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  isEndOfMonth: boolean;
  payslips: PayslipDraft[];
  skipped: Array<{ employeeId: string; employeeName: string; reason: string }>;
  tips: { pool: number; headcount: number; share: number; remainder: number };
  pomRevenue: number;
  paymentAccounts: PaymentAccountOption[];
  totals: {
    gross: number;
    net: number;
    employeeContrib: number;
    employerContrib: number;
    transferFees: number;
    cashOut: number;
  };
  blockingErrors: string[];
}

export interface PayrollEngineDeps {
  employees: EmployeeRepository;
}

function addDays(d: string, n: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

function normaliseRateType(v: string | null | undefined, paidAs: string | null): RateType {
  const t = (v ?? '').toLowerCase();
  if (t === 'fixed') return 'fixed';
  if (t === 'monthly') return 'monthly';
  if (t === 'daily') return 'daily';
  return (paidAs ?? '').toLowerCase() === 'monthly' ? 'monthly' : 'daily';
}

function methodForAccount(name: string): PayrollPaymentMethod {
  const n = name.toLowerCase();
  if (n.includes('gcash')) return 'gcash';
  if (n.includes('bank')) return 'bank_transfer';
  if (n.includes('cash') || n.includes('safe') || n.includes('drawer')) return 'cash';
  return 'other';
}

export async function loadPaymentAccounts(storeId: string): Promise<PaymentAccountOption[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('chart_of_accounts')
    .select('id, name')
    .in('store_id', [storeId, 'company'])
    .eq('account_type', 'Asset')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(`Failed to load payment accounts: ${error.message}`);
  const excluded = ['advance', 'envelope', 'charity', 'deposit', 'receivable', 'vehicle', 'equipment', 'prepaid'];
  return ((data ?? []) as Array<{ id: string; name: string }>)
    .filter((a) => !excluded.some((x) => a.name.toLowerCase().includes(x)))
    .map((a) => ({ id: a.id, name: a.name, method: methodForAccount(a.name) }));
}

function defaultPaymentAccount(
  method: string,
  ledger: PayrollLedger,
  accounts: PaymentAccountOption[],
): PaymentAccountOption {
  const byMethod = (m: PayrollPaymentMethod) => accounts.find((a) => a.method === m);
  if (method === 'gcash' && byMethod('gcash')) return byMethod('gcash')!;
  if (method === 'bank_transfer' && byMethod('bank_transfer')) return byMethod('bank_transfer')!;
  const till = accounts.find((a) => a.id === ledger.cashAccountId);
  return till ?? { id: ledger.cashAccountId, name: 'Cash till', method: 'cash' };
}

/**
 * Prices every eligible employee's payslip for the period from the database.
 * Preview and run both go through here so what is shown is what gets posted.
 */
export async function buildPayrollPreview(
  input: RunPayrollRequest,
  deps: PayrollEngineDeps,
): Promise<{ preview: PayrollPreview; ledger: PayrollLedger }> {
  const sb = getSupabaseClient();
  const { storeId, periodStart, periodEnd, isEndOfMonth, workingDaysInMonth } = input;
  const payDate = input.payDate ?? periodEnd;
  if (periodEnd < periodStart) throw new DomainError('Period end is before period start');
  const monthStart = `${periodEnd.slice(0, 7)}-01`;

  const [ledger, paymentAccounts] = await Promise.all([
    resolvePayrollLedger(storeId),
    loadPaymentAccounts(storeId),
  ]);

  const [tsRes, monthTsRes, holidaysRes, leaveCfgRes] = await Promise.all([
    sb.from('timesheets')
      .select('id, date, employee_id, day_type, overtime_hours, nine_pm_returns_count, day_fraction')
      .eq('store_id', storeId)
      .eq('payroll_status', 'Approved')
      .gte('date', periodStart)
      .lte('date', periodEnd)
      .order('date'),
    sb.from('timesheets')
      .select('employee_id, day_type')
      .eq('store_id', storeId)
      .gte('date', monthStart)
      .lte('date', periodEnd),
    sb.from('public_holidays')
      .select('holiday_date, name, premium_pct, store_id')
      .gte('holiday_date', periodStart)
      .lte('holiday_date', periodEnd),
    sb.from('leave_config')
      .select('probation_accrual_holiday, probation_accrual_sick, probation_rule_holiday, probation_rule_sick')
      .eq('store_id', storeId)
      .maybeSingle(),
  ]);
  if (tsRes.error) throw new Error(`Failed to load timesheets: ${tsRes.error.message}`);
  if (monthTsRes.error) throw new Error(`Failed to load month timesheets: ${monthTsRes.error.message}`);
  if (holidaysRes.error) throw new Error(`Failed to load public holidays: ${holidaysRes.error.message}`);

  type TsRow = { id: string; date: string; employee_id: string; day_type: string; overtime_hours: number | null; nine_pm_returns_count: number | null; day_fraction: number | null };
  const timesheets = (tsRes.data ?? []) as TsRow[];
  const tsByEmployee = new Map<string, TsRow[]>();
  for (const t of timesheets) {
    const arr = tsByEmployee.get(t.employee_id) ?? [];
    arr.push(t);
    tsByEmployee.set(t.employee_id, arr);
  }

  const holidayByDate = new Map<string, { name: string; pct: number }>();
  for (const h of (holidaysRes.data ?? []) as Array<{ holiday_date: string; name: string; premium_pct: number; store_id: string | null }>) {
    if (h.store_id && h.store_id !== storeId) continue;
    const prev = holidayByDate.get(h.holiday_date);
    // A store-specific entry overrides the all-stores one for the same date.
    if (!prev || h.store_id) holidayByDate.set(h.holiday_date, { name: h.name, pct: Number(h.premium_pct) });
  }

  const leaveCfg = (leaveCfgRes.data ?? null) as {
    probation_accrual_holiday: number | null;
    probation_accrual_sick: number | null;
    probation_rule_holiday: string | null;
    probation_rule_sick: string | null;
  } | null;

  // Active staff plus anyone (e.g. since deactivated) with approved days still to be paid.
  const active = await deps.employees.findActive(storeId);
  const employeeMap = new Map<string, Employee>(active.map((e) => [e.id, e]));
  for (const empId of tsByEmployee.keys()) {
    if (!employeeMap.has(empId)) {
      const e = await deps.employees.findById(empId);
      if (e) employeeMap.set(empId, e);
    }
  }
  const excluded = new Set(input.excludeEmployeeIds ?? []);
  const employees = [...employeeMap.values()]
    .filter((e) => !excluded.has(e.id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const employeeIds = employees.map((e) => e.id);
  const allTsIds = timesheets.filter((t) => employeeMap.has(t.employee_id)).map((t) => t.id);

  const [ratesRes, prepaidRes, advancesRes, allowanceRes, tipsRes, pomRes] = await Promise.all([
    employeeIds.length
      ? sb.from('employee_rate_history')
          .select('employee_id, effective_from, rate_type, basic_rate, overtime_rate, nine_pm_bonus_rate, commission_rate')
          .in('employee_id', employeeIds)
          .order('effective_from')
      : Promise.resolve({ data: [], error: null }),
    allTsIds.length
      ? sb.from('expenses').select('timesheet_id, amount').in('timesheet_id', allTsIds)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? sb.from('cash_advance_schedules')
          .select('id, employee_id, deduction_per_period, remaining_balance, start_date, payday_type, granted_date')
          .in('employee_id', employeeIds)
          .gt('remaining_balance', 0)
          .eq('payday_type', isEndOfMonth ? 'end_of_month' : 'mid_month')
          .order('granted_date')
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? sb.from('employee_allowance_ledger')
          .select('employee_id, entry_date, entry_type, amount')
          .in('employee_id', employeeIds)
      : Promise.resolve({ data: [], error: null }),
    isEndOfMonth
      ? sb.from('journal_entries')
          .select('debit, credit')
          .eq('account_id', ledger.tipsPayableId)
          .eq('store_id', storeId)
          .lte('date', payDate)
      : Promise.resolve({ data: [], error: null }),
    isEndOfMonth
      ? sb.from('order_addons')
          .select('total_amount')
          .ilike('addon_name', '%peace of mind%')
          .eq('store_id', storeId)
          .gte('added_at', `${monthStart}T00:00:00+08:00`)
          .lt('added_at', `${addDays(periodEnd, 1)}T00:00:00+08:00`)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [label, r] of [
    ['rate history', ratesRes], ['9pm payouts', prepaidRes], ['cash advances', advancesRes],
    ['vehicle allowance', allowanceRes], ['tips', tipsRes], ['Peace of Mind sales', pomRes],
  ] as const) {
    if (r.error) throw new Error(`Failed to load ${label}: ${r.error.message}`);
  }

  type RateRow = { employee_id: string; effective_from: string; rate_type: string | null; basic_rate: number; overtime_rate: number; nine_pm_bonus_rate: number; commission_rate: number };
  const ratesByEmployee = new Map<string, RateRow[]>();
  for (const r of (ratesRes.data ?? []) as RateRow[]) {
    const arr = ratesByEmployee.get(r.employee_id) ?? [];
    arr.push(r);
    ratesByEmployee.set(r.employee_id, arr);
  }

  const prepaidByTs = new Map<string, number>();
  for (const p of (prepaidRes.data ?? []) as Array<{ timesheet_id: string; amount: number }>) {
    prepaidByTs.set(p.timesheet_id, (prepaidByTs.get(p.timesheet_id) ?? 0) + Number(p.amount ?? 0));
  }

  type AdvRow = { id: string; employee_id: string; deduction_per_period: number; remaining_balance: number; start_date: string | null; granted_date: string | null };
  const advancesByEmployee = new Map<string, AdvRow[]>();
  for (const a of (advancesRes.data ?? []) as AdvRow[]) {
    if (a.start_date && a.start_date > periodEnd) continue;
    const arr = advancesByEmployee.get(a.employee_id) ?? [];
    arr.push(a);
    advancesByEmployee.set(a.employee_id, arr);
  }

  type AllowRow = { employee_id: string; entry_date: string; entry_type: string; amount: number };
  const allowanceByEmployee = new Map<string, AllowRow[]>();
  for (const a of (allowanceRes.data ?? []) as AllowRow[]) {
    const arr = allowanceByEmployee.get(a.employee_id) ?? [];
    arr.push(a);
    allowanceByEmployee.set(a.employee_id, arr);
  }

  const tipsPool = round2(((tipsRes.data ?? []) as Array<{ debit: number; credit: number }>)
    .reduce((s, r) => s + Number(r.credit ?? 0) - Number(r.debit ?? 0), 0));
  const pomRevenue = round2(((pomRes.data ?? []) as Array<{ total_amount: number }>)
    .reduce((s, r) => s + Number(r.total_amount ?? 0), 0));

  // Tips go to staff who actually worked at least one day this month.
  const workedThisMonth = new Set(
    ((monthTsRes.data ?? []) as Array<{ employee_id: string; day_type: string }>)
      .filter((t) => !LEAVE_DAY_TYPES.has(t.day_type) && t.day_type !== UNPAID_LEAVE_DAY_TYPE)
      .map((t) => t.employee_id),
  );
  // Fixed-salary staff don't work shop shifts, so they're outside the tips pool.
  const tipRecipients = employees
    .filter((e) => workedThisMonth.has(e.id) && normaliseRateType(e.rateType, e.paidAs) !== 'fixed')
    .map((e) => e.id);
  const tipSplit = isEndOfMonth ? splitTipsPool(Math.max(0, tipsPool), tipRecipients.length) : { share: 0, remainder: 0 };
  const tipRecipientSet = new Set(tipRecipients);

  const inputByEmployee = new Map((input.employees ?? []).map((e) => [e.employeeId, e]));

  const payslips: PayslipDraft[] = [];
  const skipped: PayrollPreview['skipped'] = [];
  const blockingErrors: string[] = [];

  for (const emp of employees) {
    const rows = tsByEmployee.get(emp.id) ?? [];
    const history = ratesByEmployee.get(emp.id) ?? [];
    const fallbackRate: RateRow = {
      employee_id: emp.id,
      effective_from: '2000-01-01',
      rate_type: emp.rateType,
      basic_rate: emp.basicRate,
      overtime_rate: emp.overtimeRate,
      nine_pm_bonus_rate: emp.ninePmBonusRate,
      commission_rate: emp.commissionRate,
    };
    const rateOn = (date: string): RateRow => {
      let hit: RateRow | null = null;
      for (const r of history) if (r.effective_from <= date) hit = r;
      return hit ?? history[0] ?? fallbackRate;
    };

    const usedRates = new Map<string, RateRow>();
    const days: PayrollDay[] = [];
    const dayLines: DayLine[] = [];
    let ninePmPrepaid = 0;
    for (const t of rows) {
      const rate = rateOn(t.date);
      usedRates.set(rate.effective_from, rate);
      const rateType = normaliseRateType(rate.rate_type, emp.paidAs);
      // Fixed salary covers every day; the days are kept only as a record.
      const isFixedDay = rateType === 'fixed';
      const fullDayRate = rateType === 'monthly'
        ? Number(rate.basic_rate) / workingDaysInMonth
        : Number(rate.basic_rate);
      const isUnpaid = t.day_type === UNPAID_LEAVE_DAY_TYPE;
      const isLeave = isUnpaid || LEAVE_DAY_TYPES.has(t.day_type);
      const dailyRate = isFixedDay ? 0 : isLeave ? fullDayRate : fullDayRate * Number(t.day_fraction ?? 1);
      const holiday = holidayByDate.get(t.date);
      const premiumPct = isLeave || isFixedDay ? 0 : Math.max(DAY_TYPE_PREMIUM[t.day_type] ?? 0, holiday?.pct ?? 0);
      const day: PayrollDay = {
        date: t.date,
        dayType: t.day_type,
        isLeave,
        isUnpaid,
        dailyRate: isUnpaid ? 0 : dailyRate,
        overtimeHours: isLeave || isFixedDay ? 0 : Number(t.overtime_hours ?? 0),
        overtimeHourlyRate: Number(rate.overtime_rate ?? 0),
        ninePmCount: isLeave ? 0 : Number(t.nine_pm_returns_count ?? 0),
        ninePmRate: Number(rate.nine_pm_bonus_rate ?? 0),
        premiumPct,
      };
      days.push(day);
      ninePmPrepaid += prepaidByTs.get(t.id) ?? 0;
      dayLines.push({
        date: t.date,
        dayType: t.day_type,
        isLeave,
        dailyRate: round2(day.dailyRate),
        overtimeHours: day.overtimeHours,
        ninePmCount: day.ninePmCount,
        premiumPct,
        holidayName: holiday?.name ?? null,
        pay: round2(
          day.dailyRate * (1 + premiumPct / 100) +
          day.overtimeHours * day.overtimeHourlyRate +
          day.ninePmCount * day.ninePmRate,
        ),
      });
    }

    const currentRate = rateOn(periodEnd);
    const rateType = normaliseRateType(currentRate.rate_type, emp.paidAs);
    const commissionRate = Number(currentRate.commission_rate ?? 0);

    const fixedSalary = rateType === 'fixed'
      ? fixedSalaryForPeriod({
          periodStart,
          periodEnd,
          monthlyOn: (d) => {
            const r = rateOn(d);
            if (normaliseRateType(r.rate_type, emp.paidAs) !== 'fixed') return 0;
            usedRates.set(r.effective_from, r);
            return Number(r.basic_rate);
          },
          employedFrom: emp.startDate,
          unpaidDates: rows.filter((t) => t.day_type === UNPAID_LEAVE_DAY_TYPE).map((t) => t.date),
          workingDaysInMonth,
        })
      : null;

    const schedules = advancesByEmployee.get(emp.id) ?? [];
    const scheduleDue = schedules.map((s) => ({
      id: s.id,
      dueThisPeriod: round2(Math.min(Number(s.deduction_per_period ?? 0), Number(s.remaining_balance ?? 0))),
    }));
    const legacyDue = isEndOfMonth ? round2(Math.max(0, emp.currentCashAdvance)) : 0;
    const advanceDue = round2(scheduleDue.reduce((s, x) => s + x.dueThisPeriod, 0) + legacyDue);

    const empInput = inputByEmployee.get(emp.id);
    const isTipRecipient = tipRecipientSet.has(emp.id);

    const result = calculatePayroll({
      isEndOfMonth,
      days,
      commissionRate,
      pomRevenue: isEndOfMonth ? pomRevenue : 0,
      tipsShare: isTipRecipient ? tipSplit.share : 0,
      bonuses: empInput?.bonuses ?? 0,
      ninePmPrepaid: round2(ninePmPrepaid),
      cashAdvanceDue: advanceDue,
      employeeContributions: { sss: emp.sssDeductionAmt, philhealth: emp.philhealthDeductionAmt, pagibig: emp.pagibigDeductionAmt },
      employerContributions: { sss: emp.employerSssAmt, philhealth: emp.employerPhilhealthAmt, pagibig: emp.employerPagibigAmt },
      monthlyVehicleAllowance: emp.monthlyBikeAllowance,
      ...(fixedSalary ? { fixedBasicPay: fixedSalary.basicPay } : {}),
    });

    if (rows.length === 0 && result.grossPay <= 0) {
      skipped.push({
        employeeId: emp.id,
        employeeName: emp.fullName,
        reason: fixedSalary ? 'Not employed during this period' : 'No approved timesheets in this period',
      });
      continue;
    }

    const advanceAllocations = allocateAdvanceDeduction(result.cashAdvanceDeduction, scheduleDue);
    const allocatedToSchedules = round2(advanceAllocations.reduce((s, a) => s + a.amount, 0));
    const legacyAdvanceDeducted = round2(Math.min(legacyDue, result.cashAdvanceDeduction - allocatedToSchedules));

    const ledgerRows = allowanceByEmployee.get(emp.id) ?? [];
    const opening = round2(ledgerRows.filter((r) => r.entry_date < monthStart).reduce((s, r) => s + Number(r.amount), 0));
    const movement = round2(ledgerRows.filter((r) => r.entry_date >= monthStart).reduce((s, r) => s + Number(r.amount), 0));
    const vehicleAllowance = {
      opening,
      accrued: result.vehicleAllowanceAccrual,
      withdrawn: round2(-movement),
      closing: round2(opening + movement + result.vehicleAllowanceAccrual),
    };

    const hol = leaveEntitlement({
      allowance: emp.holidayAllowance,
      startDate: emp.startDate,
      probationEndDate: emp.probationEndDate,
      asOf: periodEnd,
      probationAccrualPerMonth: Number(leaveCfg?.probation_accrual_holiday ?? 0),
      probationRule: probationRule(leaveCfg?.probation_rule_holiday),
    });
    const sick = leaveEntitlement({
      allowance: emp.sickAllowance,
      startDate: emp.startDate,
      probationEndDate: emp.probationEndDate,
      asOf: periodEnd,
      probationAccrualPerMonth: Number(leaveCfg?.probation_accrual_sick ?? 0),
      probationRule: probationRule(leaveCfg?.probation_rule_sick),
    });

    const payments = resolvePayments(emp, result.netPay, empInput?.payments, ledger, paymentAccounts);
    const paidTotal = round2(payments.reduce((s, p) => s + p.amount, 0));
    if (result.netPay < 0) {
      blockingErrors.push(`${emp.fullName}: deductions exceed gross pay by ${Math.abs(result.netPay).toFixed(2)}.`);
    } else if (Math.abs(paidTotal - result.netPay) > 0.005) {
      blockingErrors.push(`${emp.fullName}: payment lines total ${paidTotal.toFixed(2)} but net pay is ${result.netPay.toFixed(2)}.`);
    }

    payslips.push({
      employeeId: emp.id,
      employeeName: emp.fullName,
      rateType,
      paidAs: emp.paidAs,
      defaultPaymentMethod: emp.defaultPaymentMethod,
      result,
      fixedSalary,
      dayLines,
      rates: [...usedRates.values()].map((r) => ({
        effectiveFrom: r.effective_from,
        rateType: normaliseRateType(r.rate_type, emp.paidAs),
        basicRate: Number(r.basic_rate),
        overtimeRate: Number(r.overtime_rate),
        ninePmBonusRate: Number(r.nine_pm_bonus_rate),
        commissionRate: Number(r.commission_rate),
      })),
      timesheetIds: rows.map((t) => t.id),
      pomRevenue: isEndOfMonth ? pomRevenue : 0,
      commissionRate,
      tipsPool: isEndOfMonth ? tipsPool : 0,
      tipsHeadcount: isEndOfMonth ? tipRecipients.length : 0,
      advanceAllocations,
      legacyAdvanceDeducted,
      vehicleAllowance,
      leave: {
        holidayBalance: round2(hol.entitlement - emp.holidayUsed),
        sickBalance: round2(sick.entitlement - emp.sickUsed),
        onProbation: hol.onProbation,
      },
      thirteenthMonthYtd: round2(emp.thirteenthMonthAccrued + result.thirteenthMonthAccrual),
      payments,
      transferFees: round2(payments.reduce((s, p) => s + (p.fee ?? 0), 0)),
    });
  }

  const sum = (f: (p: PayslipDraft) => number) => round2(payslips.reduce((s, p) => s + f(p), 0));
  const contrib = (c: { sss: number; philhealth: number; pagibig: number }) => c.sss + c.philhealth + c.pagibig;

  return {
    ledger,
    preview: {
      storeId,
      periodStart,
      periodEnd,
      payDate,
      isEndOfMonth,
      payslips,
      skipped,
      tips: { pool: tipsPool, headcount: tipRecipients.length, share: tipSplit.share, remainder: tipSplit.remainder },
      pomRevenue,
      paymentAccounts,
      totals: {
        gross: sum((p) => p.result.grossPay),
        net: sum((p) => p.result.netPay),
        employeeContrib: sum((p) => contrib(p.result.employeeContributions)),
        employerContrib: sum((p) => contrib(p.result.employerContributions)),
        transferFees: sum((p) => p.transferFees),
        cashOut: sum((p) => p.payments.reduce((s, x) => s + x.amount + (x.fee ?? 0), 0)),
      },
      blockingErrors,
    },
  };
}

function resolvePayments(
  emp: Employee,
  netPay: number,
  requested: PayrollPaymentLine[] | undefined,
  ledger: PayrollLedger,
  accounts: PaymentAccountOption[],
): PayrollPaymentLine[] {
  if (netPay <= 0) return [];
  const lines = (requested ?? []).filter((p) => p.amount > 0 || (p.fee ?? 0) > 0);
  if (lines.length > 0) {
    const known = new Set(accounts.map((a) => a.id));
    for (const l of lines) {
      if (!known.has(l.accountId)) throw new DomainError(`Unknown payment account ${l.accountId} for ${emp.fullName}`);
    }
    return lines.map((l) => ({ ...l, amount: round2(l.amount), fee: round2(l.fee ?? 0) }));
  }
  const acct = defaultPaymentAccount(emp.defaultPaymentMethod, ledger, accounts);
  return [{ accountId: acct.id, method: acct.method, amount: round2(netPay), fee: 0 }];
}

export interface PostedPayrollRun {
  runId: string;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  payslips: Array<{ employeeId: string; employeeName: string; grossPay: number; netPay: number }>;
}

export async function postPayrollRun(
  input: RunPayrollRequest,
  runBy: string,
  deps: PayrollEngineDeps,
): Promise<PostedPayrollRun> {
  const { preview, ledger } = await buildPayrollPreview(input, deps);
  if (preview.blockingErrors.length > 0) {
    throw new DomainError(`Payroll can't be posted yet: ${preview.blockingErrors.join(' ')}`);
  }
  if (preview.payslips.length === 0) {
    throw new DomainError('No employees have anything to pay for this period.');
  }

  const accountName = new Map(preview.paymentAccounts.map((a) => [a.id, a.name]));
  const runId = randomUUID();
  const period = preview.payDate.slice(0, 7);
  const transactions: Array<{
    transactionId: string; period: string; date: string; storeId: string;
    legs: Array<{ id: string; account_id: string; debit: number; credit: number; description: string; reference_type: string; reference_id: string }>;
  }> = [];

  const payslipRows = preview.payslips.map((p) => {
    const desc = `Payroll ${preview.periodStart} to ${preview.periodEnd} — ${p.employeeName}`;
    const payouts: PayoutLine[] = p.payments.map((l) => ({
      accountId: l.accountId,
      amount: l.amount,
      fee: l.fee ?? 0,
      label: accountName.get(l.accountId) ?? l.method,
    }));
    const legs = buildPayslipJournal(p.result, payouts, ledger, desc);
    const transactionId = legs.length > 0 ? randomUUID() : null;
    if (transactionId) {
      transactions.push({
        transactionId,
        period,
        date: preview.payDate,
        storeId: preview.storeId,
        legs: legs.map((l) => ({
          id: randomUUID(),
          account_id: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          reference_type: 'payroll',
          reference_id: p.employeeId,
        })),
      });
    }
    const r = p.result;
    return {
      employeeId: p.employeeId,
      employeeName: p.employeeName,
      isEndOfMonth: preview.isEndOfMonth,
      rateType: p.rateType,
      daysWorked: r.daysWorked,
      leaveDays: r.leaveDays,
      holidayDays: r.holidayDays,
      overtimeHours: r.overtimeHours,
      leavePay: r.leavePay,
      basicPay: r.basicPay,
      overtimePay: r.overtimePay,
      ninePmBonus: r.ninePmEarnings,
      ninePmCount: r.ninePmCount,
      ninePmPrepaid: r.ninePmPrepaid,
      tips: r.tips,
      tipsPool: p.tipsPool,
      tipsHeadcount: p.tipsHeadcount,
      commission: r.commission,
      pomRevenue: p.pomRevenue,
      commissionRate: p.commissionRate,
      bonuses: r.bonuses,
      holidayAdjustment: r.holidayPremium,
      grossPay: r.grossPay,
      sssDeduction: r.employeeContributions.sss,
      philhealthDeduction: r.employeeContributions.philhealth,
      pagibigDeduction: r.employeeContributions.pagibig,
      employerSss: r.employerContributions.sss,
      employerPhilhealth: r.employerContributions.philhealth,
      employerPagibig: r.employerContributions.pagibig,
      cashAdvanceDeduction: r.cashAdvanceDeduction,
      otherDeductions: 0,
      totalDeductions: r.totalDeductions,
      netPay: r.netPay,
      thirteenthMonthAccrual: r.thirteenthMonthAccrual,
      thirteenthMonthPay: 0,
      vehicleAllowanceOpening: p.vehicleAllowance.opening,
      vehicleAllowanceAccrued: p.vehicleAllowance.accrued,
      vehicleAllowanceWithdrawn: p.vehicleAllowance.withdrawn,
      vehicleAllowanceClosing: p.vehicleAllowance.closing,
      holidayLeaveBalance: p.leave.holidayBalance,
      sickLeaveBalance: p.leave.sickBalance,
      transferFees: p.transferFees,
      legacyAdvanceDeducted: p.legacyAdvanceDeducted,
      advanceAllocations: p.advanceAllocations,
      rateSnapshot: p.rates,
      dayLines: p.dayLines,
      warnings: r.warnings,
      timesheetIds: p.timesheetIds,
      journalTransactionId: transactionId,
      paidAs: p.paidAs,
      paymentMethod: p.payments.length === 1 ? p.payments[0].method : p.payments.length > 1 ? 'split' : null,
      payments: p.payments.filter((l) => l.amount > 0),
    };
  });

  const timesheetIds = preview.payslips.flatMap((p) => p.timesheetIds);
  const sb = getSupabaseClient();
  const { error } = await sb.rpc('run_payroll_v2', {
    p_run: {
      id: runId,
      storeId: preview.storeId,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      payDate: preview.payDate,
      runType: 'regular',
      runBy,
      workingDaysInMonth: input.workingDaysInMonth,
      employeeCount: preview.payslips.length,
      totalGross: preview.totals.gross,
      totalNet: preview.totals.net,
      totalEmployerContrib: preview.totals.employerContrib,
      totalTransferFees: preview.totals.transferFees,
    },
    p_transactions: transactions,
    p_timesheet_ids: timesheetIds,
    p_payslips: payslipRows,
  });
  if (error) {
    throw Object.assign(new Error(`Payroll run failed: ${error.message}`), { code: error.code });
  }

  return {
    runId,
    employeeCount: preview.payslips.length,
    totalGross: preview.totals.gross,
    totalNet: preview.totals.net,
    payslips: preview.payslips.map((p) => ({
      employeeId: p.employeeId,
      employeeName: p.employeeName,
      grossPay: p.result.grossPay,
      netPay: p.result.netPay,
    })),
  };
}
