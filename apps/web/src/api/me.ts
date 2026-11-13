import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { PayslipRecord } from './payroll.js';

export type LeaveType = 'holiday' | 'sick' | 'unpaid';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PaydayType = 'mid_month' | 'end_of_month';

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  holiday: 'Holiday leave',
  sick: 'Sick leave',
  unpaid: 'Unpaid leave',
};

export const PAYDAY_LABEL: Record<PaydayType, string> = {
  mid_month: '15th',
  end_of_month: 'End of month',
};

export interface LeaveBalance {
  allowance: number;
  entitlement: number;
  used: number;
  remaining: number;
  pending: number;
}

export interface PortalSummary {
  employee: { id: string; fullName: string; role: string | null; startDate: string | null; probationEndDate: string | null };
  leave: { onProbation: boolean; holiday: LeaveBalance; sick: LeaveBalance; unpaidTakenThisYear: number };
  advances: {
    outstanding: number;
    schedules: Array<{ id: string; grantedDate: string | null; paydayType: string; remaining: number }>;
    pendingRequest: AdvanceRequest | null;
  };
  vehicleAllowance: { monthly: number; balance: number };
  payslipsToSign: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  dates: string[];
  reason: string | null;
  status: RequestStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface AdvanceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  amount: number;
  reason: string | null;
  paydayType: PaydayType;
  status: RequestStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface PayslipAcknowledgement {
  id: string;
  payslipId: string;
  employeeId: string;
  employeeName: string;
  status: 'confirmed' | 'disputed';
  netPay: number;
  signedName: string;
  signaturePng: string | null;
  comment: string | null;
  signedAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface MyPayslip extends PayslipRecord {
  acknowledgement: PayslipAcknowledgement | null;
  requiresSignOff: boolean;
}

export interface MyTimesheet {
  id: string;
  date: string;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  regularHours: number;
  overtimeHours: number;
  ninePmReturnsCount: number;
  notes: string | null;
  payrollStatus: string;
}

export interface StaffRequests {
  leave: LeaveRequest[];
  advances: AdvanceRequest[];
  disputes: PayslipAcknowledgement[];
}

function useInvalidateMine() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['staff-requests'] });
  };
}

export function usePortalSummary(enabled = true) {
  return useQuery({
    queryKey: ['me', 'summary'],
    queryFn: () => api.get<PortalSummary>('/me/summary'),
    enabled,
    staleTime: 60_000,
  });
}

export function useMyPayslips() {
  return useQuery({ queryKey: ['me', 'payslips'], queryFn: () => api.get<MyPayslip[]>('/me/payslips') });
}

export function useMyTimesheets(from: string, to: string) {
  return useQuery({
    queryKey: ['me', 'timesheets', from, to],
    queryFn: () => api.get<MyTimesheet[]>(`/me/timesheets?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });
}

export function useMyLeaveRequests() {
  return useQuery({ queryKey: ['me', 'leave'], queryFn: () => api.get<LeaveRequest[]>('/me/leave-requests') });
}

export function useMyAdvanceRequests() {
  return useQuery({ queryKey: ['me', 'advances'], queryFn: () => api.get<AdvanceRequest[]>('/me/advance-requests') });
}

export function useCreateLeaveRequest() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: (body: { leaveType: LeaveType; startDate: string; endDate: string; reason?: string }) =>
      api.post<LeaveRequest>('/me/leave-requests', body),
    onSuccess: invalidate,
  });
}

export function useCreateAdvanceRequest() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: (body: { amount: number; reason?: string; paydayType: PaydayType }) =>
      api.post<AdvanceRequest>('/me/advance-requests', body),
    onSuccess: invalidate,
  });
}

export function useCancelMyRequest() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: 'leave' | 'advance'; id: string }) =>
      api.post(`/me/${kind === 'leave' ? 'leave-requests' : 'advance-requests'}/${id}/cancel`, {}),
    onSuccess: invalidate,
  });
}

export function useAcknowledgePayslip() {
  const invalidate = useInvalidateMine();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payslipId, ...body }: {
      payslipId: string;
      status: 'confirmed' | 'disputed';
      signedName: string;
      signaturePng?: string;
      comment?: string;
    }) => api.post<PayslipAcknowledgement>(`/me/payslips/${payslipId}/acknowledge`, body),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['payslip-acks'] });
    },
  });
}

// ── Manager side ────────────────────────────────────────────────────────────

export function useStaffRequests(status: RequestStatus | 'all', storeId: string, enabled = true) {
  return useQuery({
    queryKey: ['staff-requests', status, storeId],
    queryFn: () => api.get<StaffRequests>(`/hr/requests?storeId=${encodeURIComponent(storeId || 'all')}${status === 'all' ? '' : `&status=${status}`}`),
    enabled,
    refetchInterval: 60_000,
  });
}

function useInvalidateRequests() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['staff-requests'] });
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['timesheets'] });
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['cashup'] });
    qc.invalidateQueries({ queryKey: ['payslip-acks'] });
  };
}

export function useReviewLeave() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      api.post(`/hr/leave-requests/${id}/${action}`, { note }),
    onSuccess: invalidate,
  });
}

export function useReviewAdvance() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, action, note, cashAccountId, deductOn }: {
      id: string;
      action: 'approve' | 'reject';
      note?: string;
      cashAccountId?: string;
      deductOn?: PaydayType;
    }) => api.post(`/hr/advance-requests/${id}/${action}`, action === 'approve' ? { note, cashAccountId, deductOn } : { note }),
    onSuccess: invalidate,
  });
}

export function useResolveDispute() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.post(`/hr/payslip-acknowledgements/${id}/resolve`, { note }),
    onSuccess: invalidate,
  });
}

export function usePayslipAcknowledgements(payslipIds: string[]) {
  const key = [...payslipIds].sort().join(',');
  return useQuery({
    queryKey: ['payslip-acks', key],
    queryFn: () => api.get<PayslipAcknowledgement[]>(`/hr/payslip-acknowledgements?payslipIds=${key}`),
    enabled: payslipIds.length > 0,
  });
}
