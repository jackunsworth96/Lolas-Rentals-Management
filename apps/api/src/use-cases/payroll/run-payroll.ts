import {
  type EmployeeRepository,
  type TimesheetRepository,
  type AccountingPort,
  type JournalLeg,
  Money,
  DomainError,
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
}

export interface RunPayrollDeps extends CalculatePayslipDeps {
  accounting: AccountingPort;
}

export interface RunPayrollResult {
  payslips: PayslipBreakdown[];
  totalNetPay: number;
  totalGrossPay: number;
  employeeCount: number;
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
  }

  const totalNetPay = payslips.reduce((sum, p) => sum + p.netPay, 0);
  const totalGrossPay = payslips.reduce((sum, p) => sum + p.grossPay, 0);

  if (totalNetPay > 0) {
    const amount = Money.php(totalNetPay);
    const legs: JournalLeg[] = [
      {
        entryId: randomUUID(),
        accountId: input.payrollExpenseAccountId,
        debit: amount,
        credit: Money.zero(),
        description: `Payroll ${input.periodStart} to ${input.periodEnd}`,
        referenceType: 'payroll',
        referenceId: null,
      },
      {
        entryId: randomUUID(),
        accountId: input.cashAccountId,
        debit: Money.zero(),
        credit: amount,
        description: `Payroll ${input.periodStart} to ${input.periodEnd}`,
        referenceType: 'payroll',
        referenceId: null,
      },
    ];

    await deps.accounting.createTransaction(legs, input.storeId);
  }

  const approvedIds = payslips
    .filter((p) => p.netPay > 0)
    .map((p) => p.employeeId);

  if (approvedIds.length > 0) {
    const timesheets = await deps.timesheets.findByPeriod(
      input.storeId,
      new Date(input.periodStart),
      new Date(input.periodEnd),
    );
    const approvedTimesheetIds = timesheets
      .filter((t) => approvedIds.includes(t.employeeId))
      .map((t) => t.id);

    if (approvedTimesheetIds.length > 0) {
      await deps.timesheets.bulkUpdateStatus(approvedTimesheetIds, 'Paid');
    }
  }

  return {
    payslips,
    totalNetPay: Math.round(totalNetPay * 100) / 100,
    totalGrossPay: Math.round(totalGrossPay * 100) / 100,
    employeeCount: payslips.length,
  };
}
