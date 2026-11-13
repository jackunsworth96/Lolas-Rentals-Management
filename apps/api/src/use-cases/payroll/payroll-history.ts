import { DomainError } from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

type Row = Record<string, unknown>;

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v == null ? null : String(v));

export interface PayrollRunSummary {
  id: string;
  storeId: string;
  runType: 'regular' | 'thirteenth_month';
  periodStart: string;
  periodEnd: string;
  payDate: string | null;
  status: 'posted' | 'voided';
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  totalEmployerContrib: number;
  totalTransferFees: number;
  runBy: string | null;
  runByName: string | null;
  createdAt: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

export interface PayslipRecord {
  id: string;
  payrollRunId: string;
  storeId: string;
  employeeId: string;
  employeeName: string;
  runType: string;
  runStatus: string;
  periodStart: string;
  periodEnd: string;
  payDate: string | null;
  isEndOfMonth: boolean;
  rateType: string | null;
  daysWorked: number;
  leaveDays: number;
  holidayDays: number;
  overtimeHours: number;
  basicPay: number;
  leavePay: number;
  overtimePay: number;
  holidayPremium: number;
  ninePmCount: number;
  ninePmEarnings: number;
  ninePmPrepaid: number;
  tips: number;
  tipsPool: number;
  tipsHeadcount: number;
  commission: number;
  pomRevenue: number;
  commissionRate: number;
  bonuses: number;
  grossPay: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  employerSss: number;
  employerPhilhealth: number;
  employerPagibig: number;
  cashAdvanceDeduction: number;
  totalDeductions: number;
  netPay: number;
  thirteenthMonthAccrual: number;
  thirteenthMonthPay: number;
  vehicleAllowance: { opening: number; accrued: number; withdrawn: number; closing: number };
  holidayLeaveBalance: number | null;
  sickLeaveBalance: number | null;
  transferFees: number;
  dayLines: unknown[];
  rateSnapshot: unknown[];
  warnings: string[];
  payments: Array<{ accountId: string; accountName: string | null; method: string; amount: number; fee: number; reference: string | null }>;
}

async function employeeNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await getSupabaseClient().from('employees').select('id, full_name').in('id', unique);
  for (const e of (data ?? []) as Row[]) out.set(String(e.id), String(e.full_name ?? ''));
  return out;
}

function toRun(r: Row, names: Map<string, string>): PayrollRunSummary {
  return {
    id: String(r.id),
    storeId: String(r.store_id),
    runType: (r.run_type as PayrollRunSummary['runType']) ?? 'regular',
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    payDate: s(r.pay_date),
    status: (r.status as PayrollRunSummary['status']) ?? 'posted',
    employeeCount: n(r.employee_count),
    totalGross: n(r.total_gross),
    totalNet: n(r.total_net),
    totalEmployerContrib: n(r.total_employer_contrib),
    totalTransferFees: n(r.total_transfer_fees),
    runBy: s(r.run_by),
    runByName: r.run_by ? names.get(String(r.run_by)) ?? null : null,
    createdAt: s(r.created_at ?? r.run_at),
    voidedAt: s(r.voided_at),
    voidedByName: r.voided_by ? names.get(String(r.voided_by)) ?? null : null,
    voidReason: s(r.void_reason),
  };
}

export async function listPayrollRuns(storeId: string | undefined, year?: number): Promise<PayrollRunSummary[]> {
  let q = getSupabaseClient().from('payroll_runs').select('*').order('period_end', { ascending: false }).limit(200);
  if (storeId) q = q.eq('store_id', storeId);
  if (year) q = q.gte('period_end', `${year}-01-01`).lte('period_end', `${year}-12-31`);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load payroll runs: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const names = await employeeNames(rows.flatMap((r) => [String(r.run_by ?? ''), String(r.voided_by ?? '')]));
  return rows.map((r) => toRun(r, names));
}

function toPayslip(r: Row, runStatus: string, payments: PayslipRecord['payments']): PayslipRecord {
  return {
    id: String(r.id),
    payrollRunId: String(r.payroll_run_id),
    storeId: String(r.store_id ?? ''),
    employeeId: String(r.employee_id),
    employeeName: String(r.employee_name ?? ''),
    runType: String(r.run_type ?? 'regular'),
    runStatus,
    periodStart: String(r.period_start ?? ''),
    periodEnd: String(r.period_end ?? ''),
    payDate: s(r.pay_date),
    isEndOfMonth: !!r.is_end_of_month,
    rateType: s(r.rate_type),
    daysWorked: n(r.days_worked),
    leaveDays: n(r.leave_days),
    holidayDays: n(r.holiday_days),
    overtimeHours: n(r.overtime_hours),
    basicPay: n(r.basic_pay),
    leavePay: n(r.leave_pay),
    overtimePay: n(r.overtime_pay),
    holidayPremium: n(r.holiday_adjustment),
    ninePmCount: n(r.nine_pm_count),
    ninePmEarnings: n(r.nine_pm_bonus),
    ninePmPrepaid: n(r.nine_pm_prepaid),
    tips: n(r.tips),
    tipsPool: n(r.tips_pool),
    tipsHeadcount: n(r.tips_headcount),
    commission: n(r.commission),
    pomRevenue: n(r.pom_revenue),
    commissionRate: n(r.commission_rate),
    bonuses: n(r.bonuses),
    grossPay: n(r.gross_pay),
    sss: n(r.sss_deduction),
    philhealth: n(r.philhealth_deduction),
    pagibig: n(r.pagibig_deduction),
    employerSss: n(r.employer_sss),
    employerPhilhealth: n(r.employer_philhealth),
    employerPagibig: n(r.employer_pagibig),
    cashAdvanceDeduction: n(r.cash_advance_deduction),
    totalDeductions: n(r.total_deductions),
    netPay: n(r.net_pay),
    thirteenthMonthAccrual: n(r.thirteenth_month_accrual),
    thirteenthMonthPay: n(r.thirteenth_month_pay),
    vehicleAllowance: {
      opening: n(r.vehicle_allowance_opening),
      accrued: n(r.vehicle_allowance_accrued),
      withdrawn: n(r.vehicle_allowance_withdrawn),
      closing: n(r.vehicle_allowance_closing),
    },
    holidayLeaveBalance: r.holiday_leave_balance == null ? null : n(r.holiday_leave_balance),
    sickLeaveBalance: r.sick_leave_balance == null ? null : n(r.sick_leave_balance),
    transferFees: n(r.transfer_fees),
    dayLines: (r.day_lines as unknown[]) ?? [],
    rateSnapshot: (r.rate_snapshot as unknown[]) ?? [],
    warnings: ((r.warnings as unknown[]) ?? []).map(String),
    payments,
  };
}

async function loadPayslips(filter: { runId?: string; employeeId?: string }): Promise<PayslipRecord[]> {
  const sb = getSupabaseClient();
  let q = sb.from('payslips').select('*, payroll_runs!payroll_run_id(status)').order('period_end', { ascending: false });
  if (filter.runId) q = q.eq('payroll_run_id', filter.runId);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  const { data, error } = await q.limit(500);
  if (error) throw new Error(`Failed to load payslips: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => String(r.id));
  const paymentsBySlip = new Map<string, PayslipRecord['payments']>();
  if (ids.length > 0) {
    const { data: pays, error: pErr } = await sb
      .from('payslip_payments')
      .select('payslip_id, account_id, method, amount, fee, reference, chart_of_accounts!account_id(name)')
      .in('payslip_id', ids);
    if (pErr) throw new Error(`Failed to load payslip payments: ${pErr.message}`);
    for (const p of (pays ?? []) as Row[]) {
      const acct = p.chart_of_accounts as { name: string } | Array<{ name: string }> | null;
      const name = Array.isArray(acct) ? acct[0]?.name ?? null : acct?.name ?? null;
      const list = paymentsBySlip.get(String(p.payslip_id)) ?? [];
      list.push({
        accountId: String(p.account_id),
        accountName: name,
        method: String(p.method ?? 'cash'),
        amount: n(p.amount),
        fee: n(p.fee),
        reference: s(p.reference),
      });
      paymentsBySlip.set(String(p.payslip_id), list);
    }
  }
  return rows.map((r) => {
    const run = r.payroll_runs as { status: string } | Array<{ status: string }> | null;
    const status = (Array.isArray(run) ? run[0]?.status : run?.status) ?? 'posted';
    return toPayslip(r, status, paymentsBySlip.get(String(r.id)) ?? []);
  });
}

export async function getPayrollRun(runId: string): Promise<{ run: PayrollRunSummary; payslips: PayslipRecord[] }> {
  const { data, error } = await getSupabaseClient().from('payroll_runs').select('*').eq('id', runId).maybeSingle();
  if (error) throw new Error(`Failed to load payroll run: ${error.message}`);
  if (!data) throw new DomainError('Payroll run not found');
  const r = data as Row;
  const names = await employeeNames([String(r.run_by ?? ''), String(r.voided_by ?? '')]);
  return { run: toRun(r, names), payslips: await loadPayslips({ runId }) };
}

export async function listEmployeePayslips(employeeId: string): Promise<PayslipRecord[]> {
  return loadPayslips({ employeeId });
}

export async function voidPayrollRun(
  runId: string,
  voidedBy: string,
  reason: string,
  reversalDate?: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('void_payroll_run', {
    p_run_id: runId,
    p_voided_by: voidedBy,
    p_reason: reason,
    p_reversal_date: reversalDate ?? formatManilaDate(),
  });
  if (error) throw new DomainError(error.message);
}
