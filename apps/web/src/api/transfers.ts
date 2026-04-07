import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface TransferRow {
  id: string;
  orderId: string | null;
  serviceDate: string;
  customerName: string;
  contactNumber: string | null;
  customerEmail: string | null;
  customerType: 'Walk-in' | 'Online' | null;
  route: string;
  flightTime: string | null;
  paxCount: number;
  vanType: string | null;
  accommodation: string | null;
  status: string;
  opsNotes: string | null;
  totalPrice: { amount: number };
  paymentMethod: string | null;
  paymentStatus: 'Pending' | 'Partially Paid' | 'Paid';
  driverFee: { amount: number } | null;
  netProfit: { amount: number } | null;
  driverPaidStatus: string | null;
  bookingSource: string | null;
  bookingToken: string | null;
  storeId: string;
  createdAt: string;
  updatedAt: string;
}

export function moneyAmount(val: { amount: number } | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  return val.amount ?? 0;
}

export interface TransferFilters {
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: string;
  driverPaidStatus?: string;
}

export function useTransfers(storeId: string, filters: TransferFilters = {}) {
  const params = new URLSearchParams({ storeId });
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
  if (filters.driverPaidStatus) params.set('driverPaidStatus', filters.driverPaidStatus);
  return useQuery<TransferRow[]>({
    queryKey: ['transfers', storeId, filters],
    queryFn: () => api.get(`/transfers?${params}`),
    enabled: !!storeId,
  });
}

export function useTransfer(id: string) {
  return useQuery<TransferRow>({
    queryKey: ['transfers', id],
    queryFn: () => api.get(`/transfers/${id}`),
    enabled: !!id,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/transfers', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });
}

export function useRecordTransferPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/transfers/payment', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['card-settlements'] });
    },
  });
}

export function useRecordDriverPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/transfers/driver-payment', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });
}
