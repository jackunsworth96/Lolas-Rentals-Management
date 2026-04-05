import { InvalidAmountError } from '../errors/domain-error.js';

export interface PayrollInput {
  rateType: 'daily' | 'monthly';
  basicRate: number;
  overtimeRate: number;
  ninePmBonusRate: number;
  commissionRate: number;
  daysWorked: number;
  overtimeHours: number;
  ninePmCount: number;
  workingDaysInMonth: number;
  pomRevenueShare: number;
  totalTips: number;
  bikeAllowance: number;
  bonuses: number;
  cashAdvanceDeduction: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
  isEndOfMonth: boolean;
  holidayAdjustment: number;
}

export interface PayrollResult {
  basicPay: number;
  overtimePay: number;
  ninePmBonus: number;
  commission: number;
  tips: number;
  bikeAllowance: number;
  bonuses: number;
  grossPay: number;
  cashAdvanceDeduction: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
  totalDeductions: number;
  netPay: number;
  thirteenthMonthAccrual: number;
  holidayAdjustment: number;
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  if (input.basicRate < 0 || input.daysWorked < 0) {
    throw new InvalidAmountError('Rates and days must be non-negative');
  }

  const basicPay =
    input.rateType === 'daily'
      ? input.basicRate * input.daysWorked
      : input.workingDaysInMonth > 0
        ? (input.basicRate / input.workingDaysInMonth) * input.daysWorked
        : 0;

  const overtimePay = computeOvertimePay(input);
  const ninePmBonus = input.ninePmBonusRate * input.ninePmCount;
  const commission = input.pomRevenueShare * input.commissionRate;
  const tips = input.totalTips;
  const bikeAllowance = input.bikeAllowance;
  const bonuses = input.bonuses;

  const grossPay =
    basicPay +
    overtimePay +
    ninePmBonus +
    commission +
    tips +
    bikeAllowance +
    bonuses +
    input.holidayAdjustment;

  const cashAdvanceDeduction = input.cashAdvanceDeduction;
  const sssDeduction = input.isEndOfMonth ? input.sssDeduction : 0;
  const philhealthDeduction = input.isEndOfMonth
    ? input.philhealthDeduction
    : 0;
  const pagibigDeduction = input.isEndOfMonth ? input.pagibigDeduction : 0;

  const totalDeductions =
    cashAdvanceDeduction + sssDeduction + philhealthDeduction + pagibigDeduction;

  const netPay = grossPay - totalDeductions;
  const thirteenthMonthAccrual =
    input.daysWorked > 0 ? (basicPay * input.daysWorked) / 12 : 0;

  return {
    basicPay: round2(basicPay),
    overtimePay: round2(overtimePay),
    ninePmBonus: round2(ninePmBonus),
    commission: round2(commission),
    tips: round2(tips),
    bikeAllowance: round2(bikeAllowance),
    bonuses: round2(bonuses),
    grossPay: round2(grossPay),
    cashAdvanceDeduction: round2(cashAdvanceDeduction),
    sssDeduction: round2(sssDeduction),
    philhealthDeduction: round2(philhealthDeduction),
    pagibigDeduction: round2(pagibigDeduction),
    totalDeductions: round2(totalDeductions),
    netPay: round2(netPay),
    thirteenthMonthAccrual: round2(thirteenthMonthAccrual),
    holidayAdjustment: round2(input.holidayAdjustment),
  };
}

/**
 * Monthly employees: no overtime pay.
 * Daily employees: use explicit overtime rate when positive; otherwise hourly fallback (basic_rate / 8) × overtime_hours.
 */
function computeOvertimePay(input: PayrollInput): number {
  if (input.rateType === 'monthly') {
    return 0;
  }
  const hours = input.overtimeHours;
  const explicitRate = input.overtimeRate ?? 0;
  if (explicitRate > 0) {
    return explicitRate * hours;
  }
  return (input.basicRate / 8) * hours;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
