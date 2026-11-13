import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface TimesheetRow {
  id: string;
  date: string;
  employeeId: string;
  name: string | null;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  regularHours: number;
  overtimeHours: number;
  ninePmReturnsCount: number;
  dailyNotes: string | null;
  payrollStatus: 'Pending' | 'Approved' | 'Paid';
  silInflation: number;
  storeId: string;
  dayFraction: number;
}

export interface EmployeeRow {
  id: string;
  storeId: string | null;
  storeIds: string[];
  fullName: string;
  role: string | null;
  status: string;
  birthday: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  startDate: string | null;
  probationEndDate: string | null;
  rateType: string | null;
  basicRate: number;
  overtimeRate: number;
  ninePmBonusRate: number;
  commissionRate: number;
  paidAs: string | null;
  defaultPaymentMethod: string;
  monthlyBikeAllowance: number;
  bikeAllowanceUsed: number;
  bikeAllowanceAccrued: number;
  availableBalance: number;
  thirteenthMonthAccrued: number;
  currentCashAdvance: number;
  holidayAllowance: number;
  holidayUsed: number;
  sickAllowance: number;
  sickUsed: number;
  sssNo: string | null;
  philhealthNo: string | null;
  pagibigNo: string | null;
  tin: string | null;
  sssDeductionAmt: number;
  philhealthDeductionAmt: number;
  pagibigDeductionAmt: number;
  employerSssAmt: number;
  employerPhilhealthAmt: number;
  employerPagibigAmt: number;
  telegramUserId: string | null;
}

export function useTimesheets(storeId: string, periodStart: string, periodEnd: string) {
  return useQuery<TimesheetRow[]>({
    queryKey: ['timesheets', storeId, periodStart, periodEnd],
    queryFn: () => {
      const params = new URLSearchParams({ periodStart, periodEnd });
      if (storeId && storeId !== 'all') params.set('storeId', storeId);
      return api.get(`/hr/timesheets?${params.toString()}`);
    },
    enabled: !!storeId && !!periodStart && !!periodEnd,
  });
}

export function useCheckDuplicates(storeId: string, date: string, employeeIds: string[]) {
  const ids = employeeIds.join(',');
  return useQuery<Array<{ employeeId: string; date: string }>>({
    queryKey: ['timesheets-duplicates', storeId, date, ids],
    queryFn: () => api.get(`/hr/timesheets/check-duplicates?storeId=${storeId}&date=${date}&employeeIds=${ids}`),
    enabled: !!storeId && !!date && employeeIds.length > 0,
  });
}

/** 9pm returns paid out of the till when a timesheet is saved. */
export interface NinePmPayoutSummary {
  paid: Array<{ timesheetId: string; amount: number }>;
  failed: Array<{ timesheetId: string; error: string }>;
}

export function useSubmitTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ created: number; timesheetIds: string[]; ninePmPayouts: NinePmPayoutSummary }>('/hr/timesheets', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cashup'] });
    },
  });
}

export function useApproveTimesheets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { timesheetIds: string[] }) => api.post('/hr/timesheets/approve', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheets'] }),
  });
}

export interface EditTimesheetPayload {
  id: string;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  regularHours: number;
  overtimeHours: number;
  ninePmReturnsCount: number;
  dailyNotes: string | null;
  storeId: string;
  dayFraction: number;
}

export function useEditTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: EditTimesheetPayload) =>
      api.patch<{ id: string; ninePmPayouts: NinePmPayoutSummary }>(`/hr/timesheets/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cashup'] });
    },
  });
}

export function useSubmitLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/hr/leave', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheets'] }),
  });
}

export function useEmployees(storeId: string) {
  return useQuery<EmployeeRow[]>({
    queryKey: ['employees', storeId],
    queryFn: () => api.get(`/hr/employees?storeId=${storeId}`),
    enabled: !!storeId,
  });
}

export function useAllEmployees() {
  return useQuery<EmployeeRow[]>({
    queryKey: ['employees', 'all'],
    queryFn: () => api.get('/hr/employees'),
  });
}

export function useEmployee(id: string) {
  return useQuery<EmployeeRow>({
    queryKey: ['employees', 'detail', id],
    queryFn: () => api.get(`/hr/employees/${id}`),
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<EmployeeRow>('/hr/employees', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['config', 'employees'] });
    },
  });
}

export function useSaveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown> & { id: string }) =>
      api.put<EmployeeRow>(`/hr/employees/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['config', 'employees'] });
    },
  });
}

export function useDeactivateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/hr/employees/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['config', 'employees'] });
    },
  });
}

// ─── Cash Advances ───────────────────────────────────────────────────────────

export interface CashAdvanceScheduleRow {
  id: string;
  employeeId: string;
  expenseId: string | null;
  totalAmount: number;
  grantedDate: string;
  deductionPerPeriod: number;
  remainingBalance: number;
  startDate: string;
  paydayType: 'mid_month' | 'end_of_month';
  repaymentType: 'installments';
}

export interface GrantCashAdvancePayload {
  storeId: string;
  employeeId: string;
  amount: number;
  date: string;
  repaymentType: 'lump-sum' | 'installments';
  /** Lump-sum: which payday to deduct on. Defaults to 'end_of_month'. */
  deductOn?: 'mid_month' | 'end_of_month';
  /** Installments: number of payroll periods (min 2). */
  periods?: number;
  /** Installments: which payday to start from. Defaults to 'end_of_month'. */
  startPayday?: 'mid_month' | 'end_of_month';
  expenseAccountId: string;
  cashAccountId: string;
  description?: string;
}

export function useCashAdvances(employeeId: string, storeId: string) {
  return useQuery<CashAdvanceScheduleRow[]>({
    queryKey: ['cash-advances', employeeId],
    queryFn: () => api.get(`/hr/cash-advances?employeeId=${employeeId}&storeId=${storeId}`),
    enabled: !!employeeId && !!storeId,
  });
}

export function useGrantCashAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GrantCashAdvancePayload) =>
      api.post<{ expenseId: string; scheduleId: string | null }>('/hr/cash-advances', body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['cash-advances', variables.employeeId] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}
