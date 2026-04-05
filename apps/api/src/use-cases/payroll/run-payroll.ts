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

// Payroll is company-level — all journal accounts are always Lola's.
const PAYROLL_EXPENSE_ACCOUNT = 'EXP-PAYROLL-store-lolas';
const PAYROLL_JOURNAL_STORE = 'store-lolas';

function resolveCreditAccount(
  method: 'cash' | 'gcash' | 'bank_transfer',
  source: 'till' | 'safe',
): string {
  if (method === 'cash') {
    return source === 'safe' ? 'SAFE-store-lolas' : 'CASH-LOLA';
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

  for (const employee of eligibleEmployees) {
    const payslip = await calculatePayslip(
      {
        employeeId: employee.id,
        storeId: input.storeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        isEndOfMonth: input.isEndOfMonth,
        workingDaysInMonth: input.workingDaysInMonth,
      },
      deps,
    );
    payslips.push(payslip);
  }

  const totalNetPay = payslips.reduce((sum, p) => sum + p.netPay, 0);
  const totalGrossPay = payslips.reduce((sum, p) => sum + p.grossPay, 0);

  const desc = `Payroll ${input.periodStart} to ${input.periodEnd}`;
  const now = new Date();
  const txDate = now.toISOString().slice(0, 10);
  const txPeriod = txDate.slice(0, 7);

  // Build a map for quick payment detail lookup
  const paymentMap = new Map<string, EmployeePaymentDetail>(
    input.employeePayments.map((ep) => [ep.employeeId, ep]),
  );

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
      account_id: PAYROLL_EXPENSE_ACCOUNT,
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
          account_id: resolveCreditAccount('cash', 'till'),
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
          account_id: resolveCreditAccount('cash', 'safe'),
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
        account_id: resolveCreditAccount(method, 'till'),
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
    );
  }

  return {
    payslips,
    totalNetPay: Math.round(totalNetPay * 100) / 100,
    totalGrossPay: Math.round(totalGrossPay * 100) / 100,
    employeeCount: payslips.length,
  };
}
