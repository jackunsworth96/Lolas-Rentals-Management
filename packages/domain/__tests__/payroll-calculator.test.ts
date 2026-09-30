import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../src/services/payroll-calculator.js';

const baseInput = {
  rateType: 'daily' as const,
  basicRate: 500,
  overtimeRate: 100,
  ninePmBonusRate: 50,
  // Whole percentage points, matching production data (e.g. 5 = 5%), not a
  // decimal fraction.
  commissionRate: 10,
  daysWorked: 15,
  overtimeHours: 10,
  ninePmCount: 3,
  workingDaysInMonth: 22,
  pomRevenueShare: 5000,
  totalTips: 1200,
  bikeAllowance: 500,
  bonuses: 0,
  cashAdvanceDeduction: 500,
  sssDeduction: 400,
  philhealthDeduction: 200,
  pagibigDeduction: 100,
  isEndOfMonth: true,
  // Was missing from this fixture entirely, which silently made grossPay
  // (and everything derived from it) NaN in any test that didn't override
  // it — see payroll audit finding P-23.
  holidayAdjustment: 0,
};

describe('calculatePayroll', () => {
  it('calculates basic pay for daily rate', () => {
    const result = calculatePayroll(baseInput);
    expect(result.basicPay).toBe(7500);
  });

  it('calculates basic pay for monthly rate', () => {
    const result = calculatePayroll({
      ...baseInput,
      rateType: 'monthly',
      basicRate: 15000,
    });
    expect(result.basicPay).toBeCloseTo(10227.27, 2);
  });

  it('calculates overtime pay', () => {
    const result = calculatePayroll(baseInput);
    expect(result.overtimePay).toBe(1000);
  });

  it('falls back to basic_rate/8 per hour when overtime rate is zero (daily)', () => {
    const result = calculatePayroll({
      ...baseInput,
      overtimeRate: 0,
      basicRate: 800,
      overtimeHours: 4,
    });
    expect(result.overtimePay).toBe((800 / 8) * 4);
  });

  it('has zero overtime pay for monthly rate employees regardless of hours', () => {
    const result = calculatePayroll({
      ...baseInput,
      rateType: 'monthly',
      basicRate: 15000,
      overtimeRate: 100,
      overtimeHours: 10,
    });
    expect(result.overtimePay).toBe(0);
  });

  it('calculates 9PM bonus', () => {
    const result = calculatePayroll(baseInput);
    expect(result.ninePmBonus).toBe(150);
  });

  it('calculates POM commission from employee rate (percent, not decimal)', () => {
    const result = calculatePayroll(baseInput);
    // 5000 revenue share * 10% = 500, not 5000 * 10 = 50000.
    expect(result.commission).toBe(500);
  });

  it('treats a commissionRate of 100 as 100%, not 10000%', () => {
    const result = calculatePayroll({ ...baseInput, commissionRate: 100 });
    expect(result.commission).toBe(5000);
  });

  it('auto-includes tips', () => {
    const result = calculatePayroll(baseInput);
    expect(result.tips).toBe(1200);
  });

  it('applies government deductions only on EOM', () => {
    const result = calculatePayroll(baseInput);
    expect(result.sssDeduction).toBe(400);
    expect(result.philhealthDeduction).toBe(200);
    expect(result.pagibigDeduction).toBe(100);
  });

  it('skips government deductions on mid-month', () => {
    const result = calculatePayroll({ ...baseInput, isEndOfMonth: false });
    expect(result.sssDeduction).toBe(0);
    expect(result.philhealthDeduction).toBe(0);
    expect(result.pagibigDeduction).toBe(0);
  });

  it('calculates net pay correctly', () => {
    const result = calculatePayroll(baseInput);
    const expectedGross = 7500 + 1000 + 150 + 500 + 1200 + 500 + 0;
    const expectedDeductions = 500 + 400 + 200 + 100;
    expect(result.grossPay).toBe(expectedGross);
    expect(result.totalDeductions).toBe(expectedDeductions);
    expect(result.netPay).toBe(expectedGross - expectedDeductions);
  });

  it('calculates 13th month accrual as basic pay / 12, not (basic pay * days) / 12', () => {
    const result = calculatePayroll(baseInput);
    expect(result.thirteenthMonthAccrual).toBeCloseTo(7500 / 12, 2);
  });

  it('throws on negative basic rate', () => {
    expect(() =>
      calculatePayroll({ ...baseInput, basicRate: -100 }),
    ).toThrow('non-negative');
  });

  it('caps the cash advance deduction so net pay never goes negative', () => {
    const result = calculatePayroll({
      ...baseInput,
      cashAdvanceDeduction: 50000,
    });
    // Gross 10850 - other statutory deductions 700 = 10150 max advance.
    expect(result.cashAdvanceDeduction).toBe(10150);
    expect(result.netPay).toBe(0);
  });

  it('leaves the cash advance deduction unchanged when it fits within net pay', () => {
    const result = calculatePayroll(baseInput);
    expect(result.cashAdvanceDeduction).toBe(500);
    expect(result.netPay).toBeGreaterThan(0);
  });
});
