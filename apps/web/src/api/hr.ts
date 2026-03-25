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
  fullName: string;
  role: string | null;
  status: string;
  basicRate: number;
  overtimeRate: number;
  ninePmBonusRate: number;
  commissionRate: number;
  paidAs: string | null;
  holidayAllowance: number;
  holidayUsed: number;
  sickAllowance: number;
  sickUsed: number;
}

export function useTimesheets(storeId: string, periodStart: string, periodEnd: string) {
  return useQuery<TimesheetRow[]>({
    queryKey: ['timesheets', storeId, periodStart, periodEnd],
    queryFn: () => api.get(`/hr/timesheets?storeId=${storeId}&periodStart=${periodStart}&periodEnd=${periodEnd}`),
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
