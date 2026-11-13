import { InvalidAmountError } from '../errors/domain-error.js';

/**
 * One approved timesheet day, already priced at the rate in force on that
 * date. Monthly-rate employees arrive here with a daily-equivalent rate.
 */
export interface PayrollDay {
  date: string;
  dayType: string;
  /** Paid holiday or sick leave: paid at the daily rate, no premiums. */
  isLeave: boolean;
  /** Approved unpaid leave: on the record, earns nothing. */
  isUnpaid?: boolean;
  dailyRate: number;
  overtimeHours: number;
  overtimeHourlyRate: number;
  ninePmCount: number;
  ninePmRate: number;
  /** Holiday / rest-day premium on top of the day's pay, in percent (30 = +30%). */
  premiumPct: number;
}

export interface StatutoryAmounts {
  sss: number;
  philhealth: number;
  pagibig: number;
}

export interface PayrollInput {
  isEndOfMonth: boolean;
  days: PayrollDay[];
  /** Whole percent (5 = 5%). */
  commissionRate: number;
  /** Peace of Mind revenue for the month. Only paid on the end-of-month run. */
  pomRevenue: number;
  /** This employee's share of the tips pool. */
  tipsShare: number;
  bonuses: number;
  /** 9pm return pay already handed over in cash from the till. */
  ninePmPrepaid: number;
  /** Cash advance instalments due this payday, before capping. */
  cashAdvanceDue: number;
  employeeContributions: StatutoryAmounts;
  employerContributions: StatutoryAmounts;
  /** Monthly vehicle allowance added to the employee's balance on the end-of-month run. */
  monthlyVehicleAllowance: number;
}

export interface PayrollResult {
  daysWorked: number;
  leaveDays: number;
  unpaidLeaveDays: number;
  holidayDays: number;
  overtimeHours: number;
  ninePmCount: number;
  basicPay: number;
  leavePay: number;
  overtimePay: number;
  holidayPremium: number;
  ninePmEarnings: number;
  commission: number;
  tips: number;
  bonuses: number;
  grossPay: number;
  employeeContributions: StatutoryAmounts;
  employerContributions: StatutoryAmounts;
  ninePmPrepaid: number;
  cashAdvanceDeduction: number;
  totalDeductions: number;
  netPay: number;
  /** 1/12 of basic pay earned (worked days + paid leave), per PD 851. */
  thirteenthMonthAccrual: number;
  vehicleAllowanceAccrual: number;
  warnings: string[];
}

const ZERO: StatutoryAmounts = { sss: 0, philhealth: 0, pagibig: 0 };

export function calculatePayroll(input: PayrollInput): PayrollResult {
  for (const d of input.days) {
    if (d.dailyRate < 0 || d.overtimeHours < 0 || d.ninePmCount < 0) {
      throw new InvalidAmountError('Rates and days must be non-negative');
    }
  }
  const warnings: string[] = [];

  let basicPay = 0;
  let leavePay = 0;
  let overtimePay = 0;
  let holidayPremium = 0;
  let ninePmEarnings = 0;
  let daysWorked = 0;
  let leaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayDays = 0;
  let overtimeHours = 0;
  let ninePmCount = 0;

  for (const d of input.days) {
    if (d.isUnpaid) {
      unpaidLeaveDays += 1;
      continue;
    }
    if (d.isLeave) {
      leaveDays += 1;
      leavePay += d.dailyRate;
      continue;
    }
    daysWorked += 1;
    basicPay += d.dailyRate;
    overtimeHours += d.overtimeHours;
    overtimePay += d.overtimeHours * d.overtimeHourlyRate;
    ninePmCount += d.ninePmCount;
    ninePmEarnings += d.ninePmCount * d.ninePmRate;
    if (d.premiumPct > 0) {
      holidayDays += 1;
      holidayPremium += d.dailyRate * (d.premiumPct / 100);
    }
  }

  const commission = input.isEndOfMonth ? input.pomRevenue * (input.commissionRate / 100) : 0;
  const tips = Math.max(0, input.tipsShare);
  const bonuses = Math.max(0, input.bonuses);

  const grossPay = round2(
    round2(basicPay) + round2(leavePay) + round2(overtimePay) + round2(holidayPremium) +
    round2(ninePmEarnings) + round2(commission) + round2(tips) + round2(bonuses),
  );

  const employeeContributions = input.isEndOfMonth ? roundAmounts(input.employeeContributions) : ZERO;
  const employerContributions = input.isEndOfMonth ? roundAmounts(input.employerContributions) : ZERO;
  const contributionTotal = employeeContributions.sss + employeeContributions.philhealth + employeeContributions.pagibig;
  const ninePmPrepaid = round2(Math.max(0, input.ninePmPrepaid));

  // An advance that doesn't fit this payday stays on its schedule for the next one.
  const roomForAdvance = Math.max(0, grossPay - contributionTotal - ninePmPrepaid);
  const cashAdvanceDue = round2(Math.max(0, input.cashAdvanceDue));
  const cashAdvanceDeduction = round2(Math.min(cashAdvanceDue, roomForAdvance));
  if (cashAdvanceDeduction < cashAdvanceDue) {
    warnings.push(
      `Only ${cashAdvanceDeduction.toFixed(2)} of the ${cashAdvanceDue.toFixed(2)} cash advance instalment fits this payslip; the rest carries over.`,
    );
  }

  const totalDeductions = round2(contributionTotal + ninePmPrepaid + cashAdvanceDeduction);
  const netPay = round2(grossPay - totalDeductions);
  if (netPay < 0) {
    warnings.push('Deductions exceed gross pay. Check the contributions and 9pm cash already paid before running payroll.');
  }
  if (input.days.length === 0 && grossPay > 0) {
    warnings.push('No approved timesheets this period; pay comes from tips, commission or bonuses only.');
  }
  if (ninePmPrepaid > round2(ninePmEarnings) + 0.005) {
    warnings.push('More 9pm cash was paid from the till than the timesheets account for.');
  }

  return {
    daysWorked,
    leaveDays,
    unpaidLeaveDays,
    holidayDays,
    overtimeHours: round2(overtimeHours),
    ninePmCount,
    basicPay: round2(basicPay),
    leavePay: round2(leavePay),
    overtimePay: round2(overtimePay),
    holidayPremium: round2(holidayPremium),
    ninePmEarnings: round2(ninePmEarnings),
    commission: round2(commission),
    tips: round2(tips),
    bonuses: round2(bonuses),
    grossPay,
    employeeContributions,
    employerContributions,
    ninePmPrepaid,
    cashAdvanceDeduction,
    totalDeductions,
    netPay,
    thirteenthMonthAccrual: round2((basicPay + leavePay) / 12),
    vehicleAllowanceAccrual: input.isEndOfMonth ? round2(Math.max(0, input.monthlyVehicleAllowance)) : 0,
    warnings,
  };
}

/**
 * Splits a tips pool equally. The remainder after rounding down to the
 * centavo stays in the pool for the next payout rather than being lost.
 */
export function splitTipsPool(pool: number, headcount: number): { share: number; remainder: number } {
  if (pool <= 0 || headcount <= 0) return { share: 0, remainder: round2(Math.max(0, pool)) };
  const share = Math.floor((pool / headcount) * 100) / 100;
  return { share, remainder: round2(pool - share * headcount) };
}

/** Allocates an amount across cash advance schedules oldest first. */
export function allocateAdvanceDeduction(
  amount: number,
  schedules: Array<{ id: string; dueThisPeriod: number }>,
): Array<{ scheduleId: string; amount: number }> {
  let left = round2(amount);
  const out: Array<{ scheduleId: string; amount: number }> = [];
  for (const s of schedules) {
    if (left <= 0) break;
    const take = round2(Math.min(left, s.dueThisPeriod));
    if (take > 0) {
      out.push({ scheduleId: s.id, amount: take });
      left = round2(left - take);
    }
  }
  return out;
}

function roundAmounts(a: StatutoryAmounts): StatutoryAmounts {
  return {
    sss: round2(Math.max(0, a.sss)),
    philhealth: round2(Math.max(0, a.philhealth)),
    pagibig: round2(Math.max(0, a.pagibig)),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
