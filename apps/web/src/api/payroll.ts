import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type PayrollPaymentMethod = 'cash' | 'gcash' | 'bank_transfer' | 'other';
export type Agency = 'sss' | 'philhealth' | 'pagibig';

export const AGENCY_LABEL: Record<Agency, string> = { sss: 'SSS', philhealth: 'PhilHealth', pagibig: 'Pag-IBIG' };
export const METHOD_LABEL: Record<PayrollPaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};

export interface PaymentLine {
  accountId: string;
  method: PayrollPaymentMethod;
  amount: number;
  fee: number;
  reference?: string;
}

export interface PaymentAccountOption {
  id: string;
  name: string;
  method: PayrollPaymentMethod;
}

export interface Contributions {
  sss: number;
  philhealth: number;
  pagibig: number;
}

export interface PayrollResult {
  daysWorked: number;
  leaveDays: number;
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
  employeeContributions: Contributions;
  employerContributions: Contributions;
  ninePmPrepaid: number;
  cashAdvanceDeduction: number;
  totalDeductions: number;
  netPay: number;
  thirteenthMonthAccrual: number;
  vehicleAllowanceAccrual: number;
  warnings: string[];
}

export interface DayLine {
  date: string;
  dayType: string;
  isLeave: boolean;
  dailyRate: number;
  overtimeHours: number;
  ninePmCount: number;
  premiumPct: number;
  holidayName: string | null;
  pay: number;
}

export interface RateSnapshot {
  effectiveFrom: string;
  rateType: 'daily' | 'monthly';
  basicRate: number;
  overtimeRate: number;
  ninePmBonusRate: number;
  commissionRate: number;
}

export interface VehicleAllowanceMovement {
  opening: number;
  accrued: number;
  withdrawn: number;
  closing: number;
}

export interface PayslipDraft {
  employeeId: string;
  employeeName: string;
  rateType: 'daily' | 'monthly';
  paidAs: string | null;
  defaultPaymentMethod: string;
  result: PayrollResult;
  dayLines: DayLine[];
  rates: RateSnapshot[];
  timesheetIds: string[];
  pomRevenue: number;
  commissionRate: number;
  tipsPool: number;
  tipsHeadcount: number;
  advanceAllocations: Array<{ scheduleId: string; amount: number }>;
  legacyAdvanceDeducted: number;
  vehicleAllowance: VehicleAllowanceMovement;
  leave: { holidayBalance: number; sickBalance: number; onProbation: boolean };
  thirteenthMonthYtd: number;
  payments: PaymentLine[];
  transferFees: number;
}

export interface PayrollPreview {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  isEndOfMonth: boolean;
  payslips: PayslipDraft[];
  skipped: Array<{ employeeId: string; employeeName: string; reason: string }>;
  tips: { pool: number; headcount: number; share: number; remainder: number };
  pomRevenue: number;
  paymentAccounts: PaymentAccountOption[];
  totals: { gross: number; net: number; employeeContrib: number; employerContrib: number; transferFees: number; cashOut: number };
  blockingErrors: string[];
}

export interface PayrollEmployeeInput {
  employeeId: string;
  bonuses: number;
  bonusNote?: string;
  payments?: PaymentLine[];
}

export interface PayrollPeriodRequest {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  payDate?: string;
  isEndOfMonth: boolean;
  workingDaysInMonth: number;
  excludeEmployeeIds: string[];
  employees: PayrollEmployeeInput[];
}

export interface PostedPayrollRun {
  runId: string;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  payslips: Array<{ employeeId: string; employeeName: string; grossPay: number; netPay: number }>;
}

export interface PayrollRunSummary {
  id: string;
  storeId: string;
  runType: 'regular' | 'thirteenth_month';
  periodStart: string;
  periodEnd: string;
  payDate: string | null;
  status: 'posted' | 'voided';
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  totalEmployerContrib: number;
  totalTransferFees: number;
  runBy: string | null;
  runByName: string | null;
  createdAt: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

export interface PayslipRecord {
  id: string;
  payrollRunId: string;
  storeId: string;
  employeeId: string;
  employeeName: string;
  runType: string;
  runStatus: string;
  periodStart: string;
  periodEnd: string;
  payDate: string | null;
  isEndOfMonth: boolean;
  rateType: string | null;
  daysWorked: number;
  leaveDays: number;
  holidayDays: number;
  overtimeHours: number;
  basicPay: number;
  leavePay: number;
  overtimePay: number;
  holidayPremium: number;
  ninePmCount: number;
  ninePmEarnings: number;
  ninePmPrepaid: number;
  tips: number;
  tipsPool: number;
  tipsHeadcount: number;
  commission: number;
  pomRevenue: number;
  commissionRate: number;
  bonuses: number;
  grossPay: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  employerSss: number;
  employerPhilhealth: number;
  employerPagibig: number;
  cashAdvanceDeduction: number;
  totalDeductions: number;
  netPay: number;
  thirteenthMonthAccrual: number;
  thirteenthMonthPay: number;
  vehicleAllowance: VehicleAllowanceMovement;
  holidayLeaveBalance: number | null;
  sickLeaveBalance: number | null;
  transferFees: number;
  dayLines: DayLine[];
  rateSnapshot: RateSnapshot[];
  warnings: string[];
  payments: Array<{ accountId: string; accountName: string | null; method: string; amount: number; fee: number; reference: string | null }>;
}

export interface ThirteenthMonthRow {
  employeeId: string;
  employeeName: string;
  status: string;
  accruedYtd: number;
  basicEarnedYtd: number;
  paidYtd: number;
  balance: number;
  projectedFullYear: number;
  monthsWithPay: number;
}

export interface ThirteenthMonthOverview {
  year: number;
  rows: ThirteenthMonthRow[];
  totals: { accruedYtd: number; paidYtd: number; balance: number; projectedFullYear: number };
  payableBalance: number;
  alreadyRun: boolean;
}

export interface PublicHoliday {
  id: string;
  holidayDate: string;
  name: string;
  premiumPct: number;
  storeId: string | null;
}

export interface AllowanceBalance {
  employeeId: string;
  employeeName: string;
  monthlyAllowance: number;
  balance: number;
  lastWithdrawal: string | null;
}

export interface AllowanceLedgerEntry {
  id: string;
  entryDate: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  expenseId: string | null;
  payrollRunId: string | null;
}

export interface RemittanceMonth {
  month: string;
  agency: Agency;
  employeeShare: number;
  employerShare: number;
  due: number;
  remitted: number;
  outstanding: number;
  employees: number;
}

export interface RemittanceRecord {
  id: string;
  agency: Agency;
  month: string;
  amount: number;
  fee: number;
  paidFromAccountId: string;
  paidFromName: string | null;
  paidDate: string;
  referenceNo: string | null;
  note: string | null;
  createdAt: string;
}

export interface RemittanceOverview {
  months: RemittanceMonth[];
  records: RemittanceRecord[];
  payableBalances: Record<Agency, number>;
}

export interface RateHistoryEntry {
  id: string;
  effectiveFrom: string;
  rateType: string | null;
  basicRate: number;
  overtimeRate: number;
  ninePmBonusRate: number;
  commissionRate: number;
  note: string | null;
  createdAt: string;
  isCurrent: boolean;
  isFuture: boolean;
}

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payroll'] });
  qc.invalidateQueries({ queryKey: ['timesheets'] });
  qc.invalidateQueries({ queryKey: ['employees'] });
  qc.invalidateQueries({ queryKey: ['cashup'] });
  qc.invalidateQueries({ queryKey: ['cash-advances'] });
}

// ── Runs ─────────────────────────────────────────────────────────────────────

export function usePreviewPayroll() {
  return useMutation({
    mutationFn: (body: PayrollPeriodRequest) => api.post<PayrollPreview>('/payroll/preview', body),
  });
}

export function useRunPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PayrollPeriodRequest) => api.post<PostedPayrollRun>('/payroll/run', body),
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function usePayrollRuns(storeId: string, year: number) {
  return useQuery<PayrollRunSummary[]>({
    queryKey: ['payroll', 'runs', storeId, year],
    queryFn: () => api.get(`/payroll/runs?storeId=${encodeURIComponent(storeId)}&year=${year}`),
    enabled: !!storeId,
  });
}

export function usePayrollRun(runId: string | null) {
  return useQuery<{ run: PayrollRunSummary; payslips: PayslipRecord[] }>({
    queryKey: ['payroll', 'run', runId],
    queryFn: () => api.get(`/payroll/runs/${runId}`),
    enabled: !!runId,
  });
}

export function useVoidPayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, reason, reversalDate }: { runId: string; reason: string; reversalDate?: string }) =>
      api.post(`/payroll/runs/${runId}/void`, { reason, reversalDate }),
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useEmployeePayslips(employeeId: string) {
  return useQuery<PayslipRecord[]>({
    queryKey: ['payroll', 'payslips', employeeId],
    queryFn: () => api.get(`/payroll/payslips?employeeId=${encodeURIComponent(employeeId)}`),
    enabled: !!employeeId,
  });
}

export function usePaymentAccounts(storeId: string) {
  return useQuery<PaymentAccountOption[]>({
    queryKey: ['payroll', 'payment-accounts', storeId],
    queryFn: () => api.get(`/payroll/payment-accounts?storeId=${encodeURIComponent(storeId)}`),
    enabled: !!storeId,
  });
}

// ── 13th month ───────────────────────────────────────────────────────────────

export function useThirteenthMonth(storeId: string, year: number) {
  return useQuery<ThirteenthMonthOverview>({
    queryKey: ['payroll', 'thirteenth-month', storeId, year],
    queryFn: () => api.get(`/payroll/thirteenth-month?storeId=${encodeURIComponent(storeId)}&year=${year}`),
    enabled: !!storeId,
  });
}

export function useRunThirteenthMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      year: number;
      payDate: string;
      employees: Array<{ employeeId: string; amount: number; payments?: PaymentLine[] }>;
    }) => api.post<{ runId: string; employeeCount: number; total: number }>('/payroll/thirteenth-month/run', body),
    onSuccess: () => invalidatePayroll(qc),
  });
}

// ── Public holidays ──────────────────────────────────────────────────────────

export function usePublicHolidays(year: number) {
  return useQuery<PublicHoliday[]>({
    queryKey: ['payroll', 'holidays', year],
    queryFn: () => api.get(`/payroll/holidays?year=${year}`),
  });
}

export function useSaveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Omit<PublicHoliday, 'id'> & { id?: string }) =>
      id ? api.put(`/payroll/holidays/${id}`, body) : api.post('/payroll/holidays', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'holidays'] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/payroll/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'holidays'] }),
  });
}

// ── Vehicle allowance ────────────────────────────────────────────────────────

export function useAllowanceBalances(storeId: string) {
  return useQuery<AllowanceBalance[]>({
    queryKey: ['payroll', 'allowance', storeId],
    queryFn: () => api.get(`/payroll/allowance?storeId=${encodeURIComponent(storeId)}`),
    enabled: !!storeId,
  });
}

export function useAllowanceLedger(employeeId: string) {
  return useQuery<AllowanceLedgerEntry[]>({
    queryKey: ['payroll', 'allowance-ledger', employeeId],
    queryFn: () => api.get(`/payroll/allowance/${employeeId}`),
    enabled: !!employeeId,
  });
}

export function useWithdrawAllowance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employeeId: string; storeId: string; date: string; amount: number; paidFromAccountId: string; note?: string }) =>
      api.post<{ expenseId: string }>('/payroll/allowance/withdraw', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cashup'] });
    },
  });
}

export function useAdjustAllowance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employeeId: string; storeId: string; date: string; amount: number; entryType: 'opening' | 'adjustment'; note: string }) =>
      api.post('/payroll/allowance/adjust', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

// ── Remittances ──────────────────────────────────────────────────────────────

export function useRemittances(year: number) {
  return useQuery<RemittanceOverview>({
    queryKey: ['payroll', 'remittances', year],
    queryFn: () => api.get(`/payroll/remittances?year=${year}`),
  });
}

export function useRecordRemittance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      agency: Agency;
      month: string;
      amount: number;
      fee: number;
      paidFromAccountId: string;
      paidDate: string;
      referenceNo?: string;
      note?: string;
    }) => api.post<{ id: string }>('/payroll/remittances', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', 'remittances'] });
      qc.invalidateQueries({ queryKey: ['cashup'] });
    },
  });
}

// ── Rate history ─────────────────────────────────────────────────────────────

export function useRateHistory(employeeId: string) {
  return useQuery<RateHistoryEntry[]>({
    queryKey: ['payroll', 'rate-history', employeeId],
    queryFn: () => api.get(`/payroll/rate-history/${employeeId}`),
    enabled: !!employeeId,
  });
}

export function useDeleteRateHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/payroll/rate-history/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'rate-history'] }),
  });
}
