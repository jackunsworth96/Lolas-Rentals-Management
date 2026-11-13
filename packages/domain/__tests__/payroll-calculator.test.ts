import { describe, it, expect } from 'vitest';
import {
  calculatePayroll,
  splitTipsPool,
  allocateAdvanceDeduction,
  fixedSalaryForPeriod,
  type PayrollDay,
  type PayrollInput,
} from '../src/services/payroll-calculator.js';
import {
  buildPayslipJournal,
  buildThirteenthMonthPayoutJournal,
  type PayrollJournalAccounts,
} from '../src/services/payroll-journal.js';

function day(overrides: Partial<PayrollDay> = {}): PayrollDay {
  return {
    date: '2026-11-03',
    dayType: 'Regular',
    isLeave: false,
    dailyRate: 500,
    overtimeHours: 0,
    overtimeHourlyRate: 80,
    ninePmCount: 0,
    ninePmRate: 100,
    premiumPct: 0,
    ...overrides,
  };
}

function input(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    isEndOfMonth: true,
    days: [day(), day({ date: '2026-11-04' })],
    commissionRate: 5,
    pomRevenue: 10000,
    tipsShare: 300,
    bonuses: 0,
    ninePmPrepaid: 0,
    cashAdvanceDue: 0,
    employeeContributions: { sss: 400, philhealth: 200, pagibig: 100 },
    employerContributions: { sss: 800, philhealth: 200, pagibig: 100 },
    monthlyVehicleAllowance: 500,
    ...overrides,
  };
}

const accounts: PayrollJournalAccounts = {
  wagesAccountId: 'WAGES',
  commissionExpenseId: 'COMM',
  tipsPayableId: 'TIPS',
  sssPayableId: 'SSS',
  philhealthPayableId: 'PH',
  pagibigPayableId: 'PI',
  employerContribExpenseId: 'ER',
  thirteenthMonthExpenseId: '13E',
  thirteenthMonthPayableId: '13P',
  vehicleAllowanceExpenseId: 'VAE',
  vehicleAllowancePayableId: 'VAP',
  transferFeeExpenseId: 'FEE',
  advanceAccountId: 'ADV',
};

function net(legs: Array<{ accountId: string; debit: number; credit: number }>, id: string) {
  return legs.filter((l) => l.accountId === id).reduce((s, l) => s + l.debit - l.credit, 0);
}

describe('calculatePayroll', () => {
  it('prices each day at its own rate', () => {
    const r = calculatePayroll(input({
      days: [day({ dailyRate: 500 }), day({ dailyRate: 550, date: '2026-11-20' })],
    }));
    expect(r.basicPay).toBe(1050);
    expect(r.daysWorked).toBe(2);
  });

  it('records unpaid leave days without paying them or counting them as worked', () => {
    const r = calculatePayroll(input({
      days: [day(), day({ date: '2026-11-04', dayType: 'Unpaid Leave', isUnpaid: true, ninePmCount: 1, premiumPct: 30 })],
      commissionRate: 0,
      tipsShare: 0,
    }));
    expect(r.unpaidLeaveDays).toBe(1);
    expect(r.daysWorked).toBe(1);
    expect(r.basicPay).toBe(500);
    expect(r.ninePmEarnings).toBe(0);
    expect(r.holidayPremium).toBe(0);
    expect(r.thirteenthMonthAccrual).toBe(41.67);
  });

  it('pays POM commission as a whole percent, only at end of month', () => {
    expect(calculatePayroll(input()).commission).toBe(500);
    expect(calculatePayroll(input({ isEndOfMonth: false })).commission).toBe(0);
  });

  it('applies +30% and +100% holiday premiums to worked days', () => {
    const r = calculatePayroll(input({
      days: [day({ premiumPct: 30 }), day({ premiumPct: 100, date: '2026-11-30' })],
    }));
    expect(r.holidayPremium).toBe(650);
    expect(r.holidayDays).toBe(2);
  });

  it('pays leave days at the daily rate without premiums or overtime', () => {
    const r = calculatePayroll(input({
      days: [day(), day({ isLeave: true, premiumPct: 100, overtimeHours: 3 })],
    }));
    expect(r.leaveDays).toBe(1);
    expect(r.leavePay).toBe(500);
    expect(r.holidayPremium).toBe(0);
    expect(r.overtimePay).toBe(0);
  });

  it('computes gross, deductions and net', () => {
    const r = calculatePayroll(input({
      days: [day({ overtimeHours: 2, ninePmCount: 1 }), day()],
      ninePmPrepaid: 100,
      cashAdvanceDue: 200,
    }));
    // 1000 basic + 160 OT + 100 9pm + 500 commission + 300 tips
    expect(r.grossPay).toBe(2060);
    expect(r.totalDeductions).toBe(700 + 100 + 200);
    expect(r.netPay).toBe(1060);
  });

  it('only deducts contributions and accrues the vehicle allowance at end of month', () => {
    const r = calculatePayroll(input({ isEndOfMonth: false }));
    expect(r.employeeContributions).toEqual({ sss: 0, philhealth: 0, pagibig: 0 });
    expect(r.employerContributions).toEqual({ sss: 0, philhealth: 0, pagibig: 0 });
    expect(r.vehicleAllowanceAccrual).toBe(0);
    expect(calculatePayroll(input()).vehicleAllowanceAccrual).toBe(500);
  });

  it('caps the advance at what is left and warns', () => {
    const r = calculatePayroll(input({
      days: [day(), day(), day()], pomRevenue: 0, tipsShare: 0, cashAdvanceDue: 5000,
    }));
    // 1500 gross - 700 contributions leaves 800 for the advance
    expect(r.cashAdvanceDeduction).toBe(800);
    expect(r.netPay).toBe(0);
    expect(r.warnings.some((w) => w.includes('cash advance'))).toBe(true);
  });

  it('flags negative net pay', () => {
    const r = calculatePayroll(input({ days: [], pomRevenue: 0, tipsShare: 0 }));
    expect(r.netPay).toBe(-700);
    expect(r.warnings.some((w) => w.includes('exceed'))).toBe(true);
  });

  it('accrues 1/12 of basic and leave pay for the 13th month', () => {
    const r = calculatePayroll(input({ days: [day(), day({ isLeave: true })] }));
    expect(r.thirteenthMonthAccrual).toBe(83.33);
  });
});

describe('splitTipsPool', () => {
  it('splits equally and keeps the rounding remainder', () => {
    expect(splitTipsPool(1000, 3)).toEqual({ share: 333.33, remainder: 0.01 });
    expect(splitTipsPool(0, 3)).toEqual({ share: 0, remainder: 0 });
    expect(splitTipsPool(500, 0)).toEqual({ share: 0, remainder: 500 });
  });
});

describe('allocateAdvanceDeduction', () => {
  it('allocates oldest first and stops when the amount runs out', () => {
    expect(allocateAdvanceDeduction(300, [
      { id: 'a', dueThisPeriod: 200 },
      { id: 'b', dueThisPeriod: 200 },
    ])).toEqual([{ scheduleId: 'a', amount: 200 }, { scheduleId: 'b', amount: 100 }]);
  });
});

describe('buildPayslipJournal', () => {
  it('produces a balanced gross-to-net entry with liabilities', () => {
    const r = calculatePayroll(input({ ninePmPrepaid: 0, cashAdvanceDue: 100 }));
    const legs = buildPayslipJournal(
      r,
      [
        { accountId: 'TILL', amount: 1000, fee: 0, label: 'cash' },
        { accountId: 'GCASH', amount: r.netPay - 1000, fee: 15, label: 'GCash' },
      ],
      accounts,
      'Payroll',
    );
    const dr = legs.reduce((s, l) => s + l.debit, 0);
    const cr = legs.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.005);
    expect(net(legs, 'SSS')).toBe(-1200);
    expect(net(legs, 'PH')).toBe(-400);
    expect(net(legs, 'PI')).toBe(-200);
    expect(net(legs, 'ER')).toBe(1100);
    expect(net(legs, 'TIPS')).toBe(300);
    expect(net(legs, 'COMM')).toBe(500);
    expect(net(legs, 'ADV')).toBe(-100);
    expect(net(legs, 'FEE')).toBe(15);
    expect(net(legs, 'GCASH')).toBeCloseTo(-(r.netPay - 1000 + 15), 2);
    expect(net(legs, '13P')).toBe(-83.33);
    expect(net(legs, 'VAP')).toBe(-500);
  });

  it('nets 9pm cash already paid out of the wages debit', () => {
    const r = calculatePayroll(input({ days: [day({ ninePmCount: 2 })], ninePmPrepaid: 200 }));
    const legs = buildPayslipJournal(r, [{ accountId: 'TILL', amount: r.netPay, fee: 0, label: 'cash' }], accounts, 'P');
    expect(net(legs, 'WAGES')).toBe(500);
  });

  it('rejects payment lines that do not add up to net pay', () => {
    const r = calculatePayroll(input());
    expect(() => buildPayslipJournal(r, [{ accountId: 'TILL', amount: 1, fee: 0, label: 'cash' }], accounts, 'P'))
      .toThrow(/net pay/);
  });

  it('requires an advance account when an advance is deducted', () => {
    const r = calculatePayroll(input({ cashAdvanceDue: 100 }));
    expect(() => buildPayslipJournal(
      r,
      [{ accountId: 'TILL', amount: r.netPay, fee: 0, label: 'cash' }],
      { ...accounts, advanceAccountId: null },
      'P',
    )).toThrow(/Cash Advance/);
  });
});

describe('fixedSalaryForPeriod', () => {
  const base = {
    periodStart: '2026-11-01',
    periodEnd: '2026-11-15',
    monthlyOn: () => 26000,
    employedFrom: '2026-10-05',
    unpaidDates: [] as string[],
    workingDaysInMonth: 26,
  };

  it('pays half the monthly salary for a full period', () => {
    expect(fixedSalaryForPeriod(base).basicPay).toBe(13000);
  });

  it('pro-rates a first period by calendar days employed', () => {
    const r = fixedSalaryForPeriod({ ...base, periodStart: '2026-10-01', employedFrom: '2026-10-05', periodEnd: '2026-10-15' });
    expect(r.daysEmployed).toBe(11);
    expect(r.basicPay).toBe(9533.33);
  });

  it('deducts monthly / working days for each unpaid day', () => {
    const r = fixedSalaryForPeriod({ ...base, unpaidDates: ['2026-11-10', '2026-11-11', '2026-11-20'] });
    expect(r.unpaidDays).toBe(2);
    expect(r.unpaidDeduction).toBe(2000);
    expect(r.basicPay).toBe(11000);
  });

  it('feeds the 13th month accrual and skips the no-timesheet warning', () => {
    const r = calculatePayroll(input({ days: [day({ dailyRate: 0 })], fixedBasicPay: 13000, tipsShare: 0, pomRevenue: 0 }));
    expect(r.basicPay).toBe(13000);
    expect(r.thirteenthMonthAccrual).toBe(1083.33);
    const none = calculatePayroll(input({ days: [], fixedBasicPay: 13000 }));
    expect(none.warnings.some((w) => /No approved timesheets/.test(w))).toBe(false);
  });
});

describe('buildThirteenthMonthPayoutJournal', () => {
  it('clears the payable and expenses any top-up', () => {
    const legs = buildThirteenthMonthPayoutJournal(
      1200,
      [{ accountId: 'BANK', amount: 1200, fee: 25, label: 'bank' }],
      accounts,
      1000,
      '13th month',
    );
    expect(net(legs, '13P')).toBe(1000);
    expect(net(legs, '13E')).toBe(200);
    expect(net(legs, 'BANK')).toBe(-1225);
    expect(net(legs, 'FEE')).toBe(25);
  });
});
