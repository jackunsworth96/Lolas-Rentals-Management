import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { OrdersRawRow } from '@lolas/shared';

export type RawOrder = OrdersRawRow;

export interface RawOrdersPage {
  data: RawOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useOrdersRaw(store?: string, status?: string, search?: string, page = 1) {
  const params = new URLSearchParams();
  if (store) params.set('store', store);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  params.set('page', String(page));
  return useQuery<RawOrdersPage>({
    queryKey: ['orders-raw', store, status, search, page],
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
  excludeTransferFromBalance?: boolean;
  transferAccommodation?: string | null;
  dropoffLocationNote?: string | null;
  /** When set, only this amount is recorded as the rental payment at activation.
   * The difference between finalTotal and this amount becomes balance_due. */
  partialPaymentAmount?: number;
  /** Tip / spare change for the staff tips pool, received into the till unless tipAccountId is set. */
  tipAmount?: number;
  tipAccountId?: string | null;
}

export function useProcessRawOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ProcessRawOrderPayload & { id: string }) =>
      api.post(`/orders-raw/${id}/process`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
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

export function useUpdateRawOrderMobile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, customerMobile }: { id: string; customerMobile: string }) =>
      api.patch<RawOrder>(`/orders-raw/${id}/mobile`, { customerMobile }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
    },
  });
}

export interface AssignPartnerToRawOrderPreview {
  partnerName: string;
  partnerSlug: string;
  rentalDiscount: number;
  deliveryDiscount: number;
  totalDiscount: number;
  currentQuote: number | null;
  newQuote: number | null;
  discountCalculated: boolean;
}

export interface AssignPartnerToRawOrderResult {
  row: { id: string; partner_ref: string; web_quote_raw: number | null; rental_value_raw: number | null };
  preview: AssignPartnerToRawOrderPreview;
}

export function usePreviewAssignPartnerToRawOrder() {
  return useMutation({
    mutationFn: ({ id, partnerSlug }: { id: string; partnerSlug: string }) =>
      api.get<AssignPartnerToRawOrderPreview>(`/orders-raw/${id}/assign-partner/preview?partnerSlug=${encodeURIComponent(partnerSlug)}`),
  });
}

export function useAssignPartnerToRawOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, partnerSlug }: { id: string; partnerSlug: string }) =>
      api.post<AssignPartnerToRawOrderResult>(`/orders-raw/${id}/assign-partner`, { partnerSlug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
      qc.invalidateQueries({ queryKey: ['partners'] });
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

export interface WalkInDirectPayload {
  partnerRef?: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  nationality?: string;
  storeId: string;
  vehicleId: string;
  vehicleModelId: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId?: number;
  dropoffLocationId?: number;
  addonIds?: number[];
  helmetNumbers?: string;
  staffNotes?: string;
  paymentMethod: 'cash' | 'gcash' | 'card' | 'wise';
  depositCollected: boolean;
  depositAmount: number;
  depositMethod: 'cash' | 'gcash' | 'card' | 'wise';
  grandTotal: number;
  rentalDays: number;
  dailyRate: number;
  pickupFee: number;
  dropoffFee: number;
  tipAmount?: number;
  tipAccountId?: string;
}

export interface WalkInDirectResult {
  orderId: string;
  orderReference: string;
  customerId: string;
}

export function useCreateWalkInDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WalkInDirectPayload) =>
      api.post<WalkInDirectResult>('/orders-raw/walk-in-direct', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
  });
}

export interface WalkInReservedPayload {
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  storeId: string;
  vehicleId: string;
  vehicleModelId: string;
  vehicleName?: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId?: number;
  dropoffLocationId?: number;
  depositAmount: number;
  depositMethod?: 'cash' | 'gcash' | 'card' | 'wise';
  grandTotal?: number;
  rentalDays?: number;
  dailyRate?: number;
  discount?: number;
  staffNotes?: string;
}

export function useCreateWalkInReserved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WalkInReservedPayload) =>
      api.post<RawOrder>('/orders-raw/walk-in-reserved', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders-raw'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
  });
}
