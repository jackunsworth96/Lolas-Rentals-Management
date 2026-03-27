import {
  type EmployeeRepository,
  type TimesheetRepository,
  type PayrollPort,
  type PayslipBreakdown,
  calculatePayroll,
  DomainError,
  Period,
} from '@lolas/domain';

export interface CalculatePayslipInput {
  employeeId: string;
  storeId: string;
  periodStart: string;
  periodEnd: string;
  isEndOfMonth: boolean;
  workingDaysInMonth: number;
}

export interface CalculatePayslipDeps {
  employees: EmployeeRepository;
  timesheets: TimesheetRepository;
  payroll: PayrollPort;
}

export async function calculatePayslip(
  input: CalculatePayslipInput,
  deps: CalculatePayslipDeps,
): Promise<PayslipBreakdown> {
  const employee = await deps.employees.findById(input.employeeId);
  if (!employee) {
    throw new DomainError(`Employee ${input.employeeId} not found`);
  }

  const period = Period.from(
    new Date(input.periodStart),
    new Date(input.periodEnd),
  );

  const timesheets = await deps.timesheets.findByEmployee(
    input.employeeId,
    period,
  );

  const daysWorked = timesheets.length;
  const overtimeHours = timesheets.reduce((sum, t) => sum + t.overtimeHours, 0);
  const ninePmCount = timesheets.reduce(
    (sum, t) => sum + t.ninePmReturnsCount,
    0,
  );
  const silInflation = timesheets.reduce((sum, t) => sum + t.silInflation, 0);

  const [tipsSummary, commissionSummary, bonuses, cashAdvances] =
    await Promise.all([
      deps.payroll.aggregateTips(input.storeId, period),
      deps.payroll.aggregatePOMCommission(input.employeeId, period),
      deps.payroll.findBonuses(input.employeeId, period),
      deps.payroll.findCashAdvanceSchedules(input.employeeId),
    ]);

  const totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
  const cashAdvanceDeduction = cashAdvances.reduce(
    (sum, ca) => sum + ca.deductionPerPeriod,
    0,
  );

  const result = calculatePayroll({
    rateType: (employee.paidAs === 'monthly' ? 'monthly' : 'daily') as
      | 'daily'
      | 'monthly',
    basicRate: employee.basicRate,
    overtimeRate: employee.overtimeRate,
    ninePmBonusRate: employee.ninePmBonusRate,
    commissionRate: employee.commissionRate,
    daysWorked,
    overtimeHours,
    ninePmCount,
    workingDaysInMonth: input.workingDaysInMonth,
    pomRevenueShare: commissionSummary.totalOrderValue,
    totalTips: tipsSummary.perEmployeeShare,
    bikeAllowance: employee.monthlyBikeAllowance,
    bonuses: totalBonuses,
    cashAdvanceDeduction,
    sssDeduction: employee.sssDeductionAmt,
    philhealthDeduction: employee.philhealthDeductionAmt,
    pagibigDeduction: employee.pagibigDeductionAmt,
    isEndOfMonth: input.isEndOfMonth,
  });

  return {
    employeeId: employee.id,
    employeeName: employee.fullName,
    basicPay: result.basicPay,
    overtimePay: result.overtimePay,
    ninePmBonus: result.ninePmBonus,
    tips: result.tips,
    commission: result.commission,
    bikeAllowance: result.bikeAllowance,
    silInflation,
    bonuses: result.bonuses,
    grossPay: result.grossPay,
    sssDeduction: result.sssDeduction,
    philhealthDeduction: result.philhealthDeduction,
    pagibigDeduction: result.pagibigDeduction,
    cashAdvanceDeduction: result.cashAdvanceDeduction,
    otherDeductions: 0,
    totalDeductions: result.totalDeductions,
    netPay: result.netPay,
    paidAs: employee.paidAs,
  };
}
