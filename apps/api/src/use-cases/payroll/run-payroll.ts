import {
  DomainError,
  Period,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';
import type { EmployeePaymentDetail } from '@lolas/shared';
import {
  calculatePayslip,
  type CalculatePayslipDeps,
} from './calculate-payslip.js';
import type { PayslipBreakdown } from '@lolas/domain';
import { formatManilaDate } from '../../utils/manila-date.js';
import { resolvePayrollAccounts } from '../../adapters/supabase/config-repo.js';
import { getSupabaseClient } from '../../adapters/supabase/client.js';

// Payroll journal entries are always posted to the company store.
const PAYROLL_JOURNAL_STORE = 'store-lolas';

function resolveCreditAccount(
  method: 'cash' | 'gcash' | 'bank_transfer',
  source: 'till' | 'safe',
  cashAccountId: string,
  safeAccountId: string,
): string {
  if (method === 'cash') {
    return source === 'safe' ? safeAccountId : cashAccountId;
  }
  if (method === 'gcash') return 'GCASH-store-lolas';
  return 'BANK-UNION-BANK-store-lolas';
}

export interface RunPayrollInput {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  isEndOfMonth: boolean;
  workingDaysInMonth: number;
  employeePayments: EmployeePaymentDetail[];
  approvedBy: string;
}

export interface RunPayrollDeps extends CalculatePayslipDeps {}

export interface RunPayrollResult {
  payslips: PayslipBreakdown[];
  totalNetPay: number;
  totalGrossPay: number;
  employeeCount: number;
}

function isMonthlyRateEmployee(employee: { rateType: string | null }): boolean {
  return employee.rateType?.toLowerCase() === 'monthly';
}

export async function runPayroll(
  input: RunPayrollInput,
  deps: RunPayrollDeps,
): Promise<RunPayrollResult> {
  const employees = await deps.employees.findActive(input.storeId);
  if (employees.length === 0) {
    throw new DomainError(`No active employees found for store ${input.storeId}`);
  }

  const eligibleEmployees = employees.filter((e) => !isMonthlyRateEmployee(e));
  if (eligibleEmployees.length === 0) {
    return {
      payslips: [],
      totalNetPay: 0,
      totalGrossPay: 0,
      employeeCount: 0,
    };
  }

  const payslips: PayslipBreakdown[] = [];
  const period = Period.from(
    new Date(input.periodStart),
    new Date(input.periodEnd),
  );

  // Build lookup early so per-employee bonuses can be passed to each payslip calc
  const paymentMap = new Map<string, EmployeePaymentDetail>(
    input.employeePayments.map((ep) => [ep.employeeId, ep]),
  );

  for (const employee of eligibleEmployees) {
    const empDetail = paymentMap.get(employee.id);
    const payslip = await calculatePayslip(
      {
        employeeId: employee.id,
        storeId: input.storeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        isEndOfMonth: input.isEndOfMonth,
        workingDaysInMonth: input.workingDaysInMonth,
        bonuses: empDetail?.bonuses ?? 0,
      },
      deps,
    );
    payslips.push(payslip);
  }

  const totalNetPay = payslips.reduce((sum, p) => sum + p.netPay, 0);
  const totalGrossPay = payslips.reduce((sum, p) => sum + p.grossPay, 0);

  const { cashAccountId, safeAccountId, wagesAccountId } = await resolvePayrollAccounts(input.storeId);

  const desc = `Payroll ${input.periodStart} to ${input.periodEnd}`;
  const txDate = formatManilaDate();
  const txPeriod = txDate.slice(0, 7);

  // paymentMap already built above for per-employee bonus lookup

  const payrollTransactions: Array<{
    transactionId: string;
    period: string;
    date: string;
    storeId: string;
    legs: Array<{
      id: string;
      account_id: string;
      debit: number;
      credit: number;
      description: string;
      reference_type: string;
      reference_id: string | null;
    }>;
  }> = [];

  for (const payslip of payslips) {
    if (payslip.netPay <= 0) continue;

    const detail = paymentMap.get(payslip.employeeId) ?? {
      employeeId: payslip.employeeId,
      paymentMethod: 'cash' as const,
      fromTill: payslip.netPay,
      fromSafe: 0,
    };

    const method = detail.paymentMethod;
    type RawLeg = {
      id: string;
      account_id: string;
      debit: number;
      credit: number;
      description: string;
      reference_type: string;
      reference_id: string | null;
    };

    const legs: RawLeg[] = [];

    // Debit: payroll expense (company-level, always Lola's account)
    legs.push({
      id: randomUUID(),
      account_id: wagesAccountId,
      debit: payslip.netPay,
      credit: 0,
      description: `${desc} — ${payslip.employeeName}`,
      reference_type: 'payroll',
      reference_id: payslip.employeeId,
    });

    if (method === 'cash') {
      const fromTill = detail.fromTill ?? payslip.netPay;
      const fromSafe = detail.fromSafe ?? 0;

      if (fromTill > 0) {
        legs.push({
          id: randomUUID(),
          account_id: resolveCreditAccount('cash', 'till', cashAccountId, safeAccountId),
          debit: 0,
          credit: fromTill,
          description: `${desc} — ${payslip.employeeName} (till)`,
          reference_type: 'payroll',
          reference_id: payslip.employeeId,
        });
      }
      if (fromSafe > 0) {
        legs.push({
          id: randomUUID(),
          account_id: resolveCreditAccount('cash', 'safe', cashAccountId, safeAccountId),
          debit: 0,
          credit: fromSafe,
          description: `${desc} — ${payslip.employeeName} (safe)`,
          reference_type: 'payroll',
          reference_id: payslip.employeeId,
        });
      }
    } else {
      legs.push({
        id: randomUUID(),
        account_id: resolveCreditAccount(method, 'till', cashAccountId, safeAccountId),
        debit: 0,
        credit: payslip.netPay,
        description: `${desc} — ${payslip.employeeName}`,
        reference_type: 'payroll',
        reference_id: payslip.employeeId,
      });
    }

    payrollTransactions.push({
      transactionId: randomUUID(),
      period: txPeriod,
      date: txDate,
      storeId: PAYROLL_JOURNAL_STORE,
      legs,
    });
  }

  // Collect timesheet IDs of all paid employees to mark as Paid
  const paidEmployeeIds = payslips
    .filter((p) => p.netPay > 0)
    .map((p) => p.employeeId);

  const approvedTimesheetIds: string[] = [];
  if (paidEmployeeIds.length > 0) {
    for (const empId of paidEmployeeIds) {
      const empTs = await deps.timesheets.findByEmployee(empId, period);
      for (const ts of empTs) {
        approvedTimesheetIds.push(ts.id);
      }
    }
  }

  if (payrollTransactions.length > 0 || approvedTimesheetIds.length > 0) {
    await deps.timesheets.runPayrollAtomic(
      payrollTransactions,
      approvedTimesheetIds,
      'Paid',
      input.storeId,
      input.periodStart,
      input.periodEnd,
      input.approvedBy,
    );
  }

  // Post-payroll: clear / reduce cash advance balances for employees whose
  // advances were actually deducted this run.
  await settleCashAdvances(payslips, input.isEndOfMonth);

  return {
    payslips,
    totalNetPay: Math.round(totalNetPay * 100) / 100,
    totalGrossPay: Math.round(totalGrossPay * 100) / 100,
    employeeCount: payslips.length,
  };
}

/**
 * After a successful payroll run, settle cash advance deductions.
 *
 * Each schedule row is tagged with a payday_type ('mid_month' or 'end_of_month').
 * We only reduce rows matching the current run's payday type.
 *
 * For backward compatibility, end-of-month runs also clear the legacy
 * employees.current_cash_advance field used by pre-migration lump-sum advances.
 *
 * Failures are non-fatal: the payroll has already been committed, so we
 * log errors rather than throwing, to avoid misleading the caller.
 */
async function settleCashAdvances(
  payslips: PayslipBreakdown[],
  isEndOfMonth: boolean,
): Promise<void> {
  const sb = getSupabaseClient();
  const currentPaydayType = isEndOfMonth ? 'end_of_month' : 'mid_month';

  const deducted = payslips.filter((p) => p.cashAdvanceDeduction > 0);
  if (deducted.length === 0) return;

  for (const payslip of deducted) {
    try {
      // Legacy: clear the lump-sum field for end-of-month runs
      if (isEndOfMonth) {
        await sb.rpc('clear_cash_advance', { p_employee_id: payslip.employeeId });
      }

      // Settle schedule rows tagged for the current payday type
      const { data: schedules } = await sb
        .from('cash_advance_schedules')
        .select('id, remaining_balance, deduction_per_period')
        .eq('employee_id', payslip.employeeId)
        .eq('payday_type', currentPaydayType)
        .gt('remaining_balance', 0);

      if (!schedules || schedules.length === 0) continue;

      let leftToSettle = payslip.cashAdvanceDeduction;

      for (const sched of schedules as Array<{
        id: string;
        remaining_balance: number;
        deduction_per_period: number;
      }>) {
        if (leftToSettle <= 0) break;

        const deductNow = Math.min(leftToSettle, sched.deduction_per_period, sched.remaining_balance);
        const newBalance = Math.round((sched.remaining_balance - deductNow) * 100) / 100;

        await sb
          .from('cash_advance_schedules')
          .update({ remaining_balance: newBalance })
          .eq('id', sched.id);

        leftToSettle -= deductNow;
      }
    } catch (err) {
      // Non-fatal — payroll is already committed
      console.error(
        `[settleCashAdvances] Failed to settle advance for employee ${payslip.employeeId}:`,
        err,
      );
    }
  }
}
