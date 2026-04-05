import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { OrdersRawRow } from '@lolas/shared';

export type RawOrder = OrdersRawRow;

export function useOrdersRaw(store?: string, status?: string, search?: string) {
  const params = new URLSearchParams();
  if (store) params.set('store', store);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  return useQuery<RawOrder[]>({
    queryKey: ['orders-raw', store, status, search],
    queryFn: () => api.get(`/orders-raw?${params}`),
  });
}

export function useOrderRaw(id: string) {
  return useQuery<RawOrder>({
    queryKey: ['orders-raw', id],
    queryFn: () => api.get(`/orders-raw/${id}`),
    enabled: !!id,
  });
}

export interface ProcessRawOrderPayload {
  storeId: string;
  customer: { name: string; email: string | null; phone: string | null };
  vehicleAssignments: Array<{
    vehicleId: string;
    vehicleName: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    rentalDaysCount: number;
    pickupLocation: string;
    dropoffLocation: string;
    pickupFee: number;
    dropoffFee: number;
    rentalRate: number;
    helmetNumbers?: string | null;
    discount: number;
    opsNotes?: string | null;
  }>;
  addons: Array<{
    addonName: string;
    addonPrice: number;
    addonType: 'per_day' | 'one_time';
    quantity: number;
    totalAmount: number;
    mutualExclusivityGroup?: string | null;
  }>;
  securityDeposit: number;
  webQuoteRaw: number | null;
  webNotes: string | null;
  receivableAccountId: string;
  incomeAccountId: string;
  paymentMethodId: string | null;
  depositMethodId: string | null;
  cardFeeSurcharge: number;
  paymentAccountId?: string | null;
  depositLiabilityAccountId?: string | null;
  isCardPayment?: boolean;
  settlementRef?: string | null;
}

export function useProcessRawOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ProcessRawOrderPayload & { id: string }) =>
      api.post(`/orders-raw/${id}/process`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export interface CollectPaymentPayload {
  id: string;
  amount: number;
  paymentMethodId: string;
  note?: string;
  isCardPayment?: boolean;
  settlementRef?: string | null;
  customerName?: string | null;
}

export function useCollectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CollectPaymentPayload) =>
      api.post(`/orders-raw/${id}/collect-payment`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
      qc.invalidateQueries({ queryKey: ['card-settlements'] });
    },
  });
}

export interface WalkInPayload {
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  vehicleModelId: string;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId?: number;
  dropoffLocationId?: number;
  staffNotes?: string;
}

export function useCreateWalkIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WalkInPayload) =>
      api.post<RawOrder>('/orders-raw/walk-in', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
    },
  });
}

export interface CancelRawOrderPayload {
  id: string;
  reason?: string;
}

export function useCancelRawOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: CancelRawOrderPayload) =>
      api.patch<RawOrder>(`/orders-raw/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
    },
  });
}
