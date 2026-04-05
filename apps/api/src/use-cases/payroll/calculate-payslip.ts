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
  /** Ad hoc bonus passed from the payroll run modal. When provided, replaces DB bonuses. */
  bonuses?: number;
}

export interface CalculatePayslipDeps {
  employees: EmployeeRepository;
  timesheets: TimesheetRepository;
  payroll: PayrollPort;
}

/**
 * Returns the additional pay multiplier above 1.0 for a given day type.
 * Regular Holiday = 2× total → extra 1.0
 * Special Holiday / Rest Day = 1.3× total → extra 0.3
 * All other day types (Regular, SIL, Holiday/Sick leave) → no extra
 */
function getDayTypeExtra(dayType: string): number {
  const dt = dayType.toLowerCase();
  if (dt === 'regular holiday') return 1.0;
  if (dt === 'special holiday' || dt === 'rest day') return 0.3;
  return 0;
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

  const allTimesheets = await deps.timesheets.findByEmployee(
    input.employeeId,
    period,
  );

  // Only count timesheets not yet paid — prevents double-counting on re-runs
  const timesheets = allTimesheets.filter((t) => t.payrollStatus !== 'Paid');

  const daysWorked = timesheets.length;
  const overtimeHours = timesheets.reduce((sum, t) => sum + t.overtimeHours, 0);
  const ninePmCount = timesheets.reduce(
    (sum, t) => sum + t.ninePmReturnsCount,
    0,
  );
  const silInflation = timesheets.reduce((sum, t) => sum + t.silInflation, 0);

  const payrollRateType: 'daily' | 'monthly' =
    employee.rateType?.toLowerCase() === 'monthly'
      ? 'monthly'
      : employee.rateType?.toLowerCase() === 'daily'
        ? 'daily'
        : employee.paidAs === 'monthly'
          ? 'monthly'
          : 'daily';

  // Daily equivalent rate used for holiday adjustment calculation
  const dailyRate =
    payrollRateType === 'monthly'
      ? input.workingDaysInMonth > 0
        ? employee.basicRate / input.workingDaysInMonth
        : 0
      : employee.basicRate;

  // Extra pay above the normal daily rate for holiday and rest days
  const holidayAdjustment = timesheets.reduce(
    (sum, t) => sum + dailyRate * getDayTypeExtra(t.dayType),
    0,
  );

  // POM commission only accrues at end of month
  // Bike allowance is a monthly benefit — only paid on the second-half run
  const [tipsSummary, commissionSummary, dbBonuses, cashAdvances] =
    await Promise.all([
      deps.payroll.aggregateTips(input.storeId, period),
      input.isEndOfMonth
        ? deps.payroll.aggregatePOMCommission(input.employeeId, period)
        : Promise.resolve({ totalOrderValue: 0, commissionRate: 0, commissionAmount: 0, employeeId: input.employeeId, period: '' }),
      deps.payroll.findBonuses(input.employeeId, period),
      deps.payroll.findCashAdvanceSchedules(input.employeeId),
    ]);

  const pomRevenueShare = input.isEndOfMonth ? commissionSummary.totalOrderValue : 0;

  // Ad hoc bonuses from the modal override the DB bonus schedule
  const totalBonuses = input.bonuses !== undefined
    ? input.bonuses
    : dbBonuses.reduce((sum, b) => sum + b.amount, 0);

  // Cash advance: use the employee's current outstanding balance
  const cashAdvanceDeduction = input.isEndOfMonth
    ? employee.currentCashAdvance
    : cashAdvances.reduce((sum, ca) => sum + ca.deductionPerPeriod, 0);

  const bikeAllowance = input.isEndOfMonth ? employee.monthlyBikeAllowance : 0;

  const result = calculatePayroll({
    rateType: payrollRateType,
    basicRate: employee.basicRate,
    overtimeRate: employee.overtimeRate,
    ninePmBonusRate: employee.ninePmBonusRate,
    commissionRate: employee.commissionRate,
    daysWorked,
    overtimeHours,
    ninePmCount,
    workingDaysInMonth: input.workingDaysInMonth,
    pomRevenueShare,
    totalTips: tipsSummary.perEmployeeShare,
    bikeAllowance,
    bonuses: totalBonuses,
    cashAdvanceDeduction,
    sssDeduction: employee.sssDeductionAmt,
    philhealthDeduction: employee.philhealthDeductionAmt,
    pagibigDeduction: employee.pagibigDeductionAmt,
    isEndOfMonth: input.isEndOfMonth,
    holidayAdjustment,
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
    holidayAdjustment: result.holidayAdjustment,
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
