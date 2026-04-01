import {
  type EmployeeRepository,
  type TimesheetRepository,
  type JournalLeg,
  Money,
  DomainError,
  Period,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';
import {
  calculatePayslip,
  type CalculatePayslipDeps,
  type CalculatePayslipInput,
} from './calculate-payslip.js';
import type { PayslipBreakdown } from '@lolas/domain';

export interface RunPayrollInput {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  isEndOfMonth: boolean;
  workingDaysInMonth: number;
  payrollExpenseAccountId: string;
  cashAccountId: string;
  approvedBy: string;
  storeExpenseAccounts?: Record<string, string>;
}

export interface RunPayrollDeps extends CalculatePayslipDeps {}

export interface RunPayrollResult {
  payslips: PayslipBreakdown[];
  totalNetPay: number;
  totalGrossPay: number;
  employeeCount: number;
  storeAllocations: Record<string, number>;
}

export async function runPayroll(
  input: RunPayrollInput,
  deps: RunPayrollDeps,
): Promise<RunPayrollResult> {
  const employees = await deps.employees.findActive(input.storeId);
  if (employees.length === 0) {
    throw new DomainError(`No active employees found for store ${input.storeId}`);
  }

  const payslips: PayslipBreakdown[] = [];
  const storeAllocations: Record<string, number> = {};
  const period = Period.from(
    new Date(input.periodStart),
    new Date(input.periodEnd),
  );

  for (const employee of employees) {
    const payslipInput: CalculatePayslipInput = {
      employeeId: employee.id,
      storeId: input.storeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      isEndOfMonth: input.isEndOfMonth,
      workingDaysInMonth: input.workingDaysInMonth,
    };

    const payslip = await calculatePayslip(payslipInput, deps);
    payslips.push(payslip);

    if (payslip.netPay <= 0) continue;

    const empTimesheets = await deps.timesheets.findByEmployee(
      employee.id,
      period,
    );

    if (empTimesheets.length === 0) {
      storeAllocations[input.storeId] = (storeAllocations[input.storeId] ?? 0) + payslip.netPay;
      continue;
    }

    const daysByStore: Record<string, number> = {};
    for (const ts of empTimesheets) {
      daysByStore[ts.storeId] = (daysByStore[ts.storeId] ?? 0) + 1;
    }

    const totalDays = empTimesheets.length;
    let allocated = 0;
    const storeIds = Object.keys(daysByStore);

    for (let i = 0; i < storeIds.length; i++) {
      const sid = storeIds[i];
      const isLast = i === storeIds.length - 1;
      const share = isLast
        ? Math.round((payslip.netPay - allocated) * 100) / 100
        : Math.round((payslip.netPay * daysByStore[sid] / totalDays) * 100) / 100;
      storeAllocations[sid] = (storeAllocations[sid] ?? 0) + share;
      allocated += share;
    }
  }

  const totalNetPay = payslips.reduce((sum, p) => sum + p.netPay, 0);
  const totalGrossPay = payslips.reduce((sum, p) => sum + p.grossPay, 0);

  const expenseMap = input.storeExpenseAccounts ?? {};
  const desc = `Payroll ${input.periodStart} to ${input.periodEnd}`;

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

  for (const [sid, amount] of Object.entries(storeAllocations)) {
    if (amount <= 0) continue;
    const expenseAcct = expenseMap[sid] ?? input.payrollExpenseAccountId;
    const legs: JournalLeg[] = [
      {
        entryId: randomUUID(),
        accountId: expenseAcct,
        debit: Money.php(amount),
        credit: Money.zero(),
        description: desc,
        referenceType: 'payroll',
        referenceId: null,
      },
      {
        entryId: randomUUID(),
        accountId: input.cashAccountId,
        debit: Money.zero(),
        credit: Money.php(amount),
        description: desc,
        referenceType: 'payroll',
        referenceId: null,
      },
    ];

    const txId = randomUUID();
    const now = new Date();
    const txDate = now.toISOString().slice(0, 10);
    const txPeriod = txDate.slice(0, 7);

    payrollTransactions.push({
      transactionId: txId,
      period: txPeriod,
      date: txDate,
      storeId: sid,
      legs: legs.map((leg) => ({
        id: leg.entryId,
        account_id: leg.accountId,
        debit: leg.debit.toNumber(),
        credit: leg.credit.toNumber(),
        description: leg.description ?? '',
        reference_type: leg.referenceType,
        reference_id: leg.referenceId,
      })),
    });
  }

  const approvedIds = payslips
    .filter((p) => p.netPay > 0)
    .map((p) => p.employeeId);

  const approvedTimesheetIds: string[] = [];
  if (approvedIds.length > 0) {
    for (const empId of approvedIds) {
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
    storeAllocations,
  };
}
