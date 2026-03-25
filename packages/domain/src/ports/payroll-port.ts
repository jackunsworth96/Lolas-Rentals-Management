import type { Period } from '../value-objects/period.js';

export interface PayPeriod {
  period: Period;
  storeId: string;
  employeeId: string;
}

export interface PayslipBreakdown {
  employeeId: string;
  employeeName: string;
  basicPay: number;
  overtimePay: number;
  ninePmBonus: number;
  tips: number;
  commission: number;
  bikeAllowance: number;
  silInflation: number;
  bonuses: number;
  grossPay: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
  cashAdvanceDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  paidAs: string | null;
}

export interface TipsSummary {
  storeId: string;
  period: string;
  totalTips: number;
  employeeCount: number;
  perEmployeeShare: number;
}

export interface CommissionSummary {
  employeeId: string;
  period: string;
  totalOrderValue: number;
  commissionRate: number;
  commissionAmount: number;
}

export interface BonusRecord {
  id: string;
  employeeId: string;
  amount: number;
  reason: string;
  date: string;
}

export interface CashAdvanceSchedule {
  id: string;
  employeeId: string;
  totalAmount: number;
  deductionPerPeriod: number;
  remainingBalance: number;
  startDate: string;
}

export interface PayrollPort {
  calculatePayslip(params: PayPeriod): Promise<PayslipBreakdown>;
  aggregateTips(storeId: string, period: Period): Promise<TipsSummary>;
  aggregatePOMCommission(
    employeeId: string,
    period: Period,
  ): Promise<CommissionSummary>;
  findBonuses(employeeId: string, period: Period): Promise<BonusRecord[]>;
  findCashAdvanceSchedules(employeeId: string): Promise<CashAdvanceSchedule[]>;
}
