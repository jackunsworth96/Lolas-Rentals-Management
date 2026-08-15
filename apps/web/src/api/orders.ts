import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

/** Poll every 30 s so the backoffice picks up customer-initiated changes (e.g. extensions). */
const LIST_POLL_MS = 30_000;
/** Poll every 20 s while an order detail modal is open. */
const DETAIL_POLL_MS = 20_000;

export function useOrders(storeId: string, status?: string) {
  const params = new URLSearchParams({ storeId });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['orders', storeId, status],
    queryFn: () => api.get(`/orders?${params}`),
    enabled: !!storeId,
    refetchInterval: LIST_POLL_MS,
  });
}

export function useEnrichedOrders(storeId: string, status?: string) {
  const params = new URLSearchParams({ storeId });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['orders', 'enriched', storeId, status],
    queryFn: () => api.get(`/orders/enriched?${params}`),
    enabled: !!storeId,
    refetchInterval: LIST_POLL_MS,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.get(`/orders/${id}`),
    enabled: !!id,
    refetchInterval: DETAIL_POLL_MS,
  });
}

export function useOrderItems(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'items'],
    queryFn: () => api.get(`/orders/${orderId}/items`),
    enabled: !!orderId,
    refetchInterval: DETAIL_POLL_MS,
  });
}

export function useOrderPayments(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'payments'],
    queryFn: () => api.get(`/orders/${orderId}/payments`),
    enabled: !!orderId,
    refetchInterval: DETAIL_POLL_MS,
  });
}

export function useOrderHistory(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'history'],
    queryFn: () => api.get(`/orders/${orderId}/history`),
    enabled: !!orderId,
    refetchInterval: DETAIL_POLL_MS,
  });
}

export function useOrderAddons(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'addons'],
    queryFn: () => api.get(`/orders/${orderId}/addons`),
    enabled: !!orderId,
    refetchInterval: DETAIL_POLL_MS,
  });
}

export function useModifyAddons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.post(`/orders/${id}/modify-addons`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAdjustDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.post(`/orders/${id}/adjust-dates`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useOrderSwaps(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'swaps'],
    queryFn: () => api.get(`/orders/${orderId}/swaps`),
    enabled: !!orderId,
  });
}

export function useHelmetSwaps(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'helmet-swaps'],
    queryFn: () => api.get(`/orders/${orderId}/helmet-swaps`),
    enabled: !!orderId,
    refetchInterval: DETAIL_POLL_MS,
  });
}

export function useSwapHelmet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId, ...body }: { id: string; itemId: string } & Record<string, unknown>) =>
      api.post(`/orders/${id}/items/${itemId}/swap-helmet`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useActivateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.post(`/orders/${id}/activate`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useSettleOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.post(`/orders/${id}/settle`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
  });
}

export function useCollectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.post(`/orders/${id}/payment`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
  });
}

export function useSwapVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.post(`/orders/${id}/swap-vehicle`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
  });
}

export function useRefundOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.post(`/orders/${id}/refund`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useCancelActivatedOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
  });
}

export function useUpdateDropoffNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string | null }) =>
      api.patch(`/orders/${id}/dropoff-note`, { note }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['orders', id] });
    },
  });
}

export function useCreateMayaCheckout() {
  return useMutation({
    mutationFn: (params: { orderId: string; amountPHP: number; description?: string }) =>
      api.post<{ checkoutId: string; redirectUrl: string }>('/payments/maya/checkout', params),
  });
}
