import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export function useOrders(storeId: string, status?: string) {
  const params = new URLSearchParams({ storeId });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['orders', storeId, status],
    queryFn: () => api.get(`/orders?${params}`),
    enabled: !!storeId,
  });
}

export function useEnrichedOrders(storeId: string, status?: string) {
  const params = new URLSearchParams({ storeId });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['orders', 'enriched', storeId, status],
    queryFn: () => api.get(`/orders/enriched?${params}`),
    enabled: !!storeId,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.get(`/orders/${id}`),
    enabled: !!id,
  });
}

export function useOrderItems(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'items'],
    queryFn: () => api.get(`/orders/${orderId}/items`),
    enabled: !!orderId,
  });
}

export function useOrderPayments(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'payments'],
    queryFn: () => api.get(`/orders/${orderId}/payments`),
    enabled: !!orderId,
  });
}

export function useOrderHistory(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'history'],
    queryFn: () => api.get(`/orders/${orderId}/history`),
    enabled: !!orderId,
  });
}

export function useOrderAddons(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'addons'],
    queryFn: () => api.get(`/orders/${orderId}/addons`),
    enabled: !!orderId,
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

export function useCreateMayaCheckout() {
  return useMutation({
    mutationFn: (params: { orderId: string; amountPHP: number; description?: string }) =>
      api.post<{ checkoutId: string; redirectUrl: string }>('/payments/maya/checkout', params),
  });
}
