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

export function useSubmitTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/hr/timesheets', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheets'] }),
  });
}

export function useApproveTimesheets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { timesheetIds: string[] }) => api.post('/hr/timesheets/approve', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheets'] }),
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

export interface EmployeePaymentDetail {
  employeeId: string;
  paymentMethod: 'cash' | 'gcash' | 'bank_transfer';
  fromTill?: number;
  fromSafe?: number;
  bonuses?: number;
}

export interface PayslipPreview {
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
  holidayAdjustment: number;
  grossPay: number;
  cashAdvanceDeduction: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
  totalDeductions: number;
  netPay: number;
  paidAs: string | null;
}

export interface RunPayrollPayload {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  isEndOfMonth: boolean;
  workingDaysInMonth: number;
  employeePayments: EmployeePaymentDetail[];
}

export interface RunPayrollPreviewPayload {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  isEndOfMonth: boolean;
  workingDaysInMonth: number;
}

export interface RunPayrollResult {
  payslips: Array<{
    employeeId: string;
    employeeName: string;
    grossPay: number;
    netPay: number;
  }>;
  totalNetPay: number;
  totalGrossPay: number;
  employeeCount: number;
}

export function usePreviewPayroll() {
  return useMutation({
    mutationFn: (body: RunPayrollPreviewPayload) =>
      api.post<PayslipPreview[]>('/payroll/preview', body),
  });
}

export function useRunPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RunPayrollPayload) =>
      api.post<RunPayrollResult>('/payroll/run', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
    },
  });
}
