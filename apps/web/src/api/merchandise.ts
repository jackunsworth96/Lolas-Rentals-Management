import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface MerchandiseItem {
  sku: string;
  itemName: string;
  sizeVariant: string | null;
  costPrice: number;
  salePrice: number;
  startingStock: number;
  soldCount: number;
  currentStock: number;
  lowStockThreshold: number;
  storeId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useMerchandise(storeId: string) {
  return useQuery<MerchandiseItem[]>({
    queryKey: ['merchandise', storeId],
    queryFn: () => api.get(`/merchandise?storeId=${encodeURIComponent(storeId)}`),
    enabled: !!storeId,
  });
}

export function useCreateMerchandiseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sku: string;
      itemName: string;
      sizeVariant?: string | null;
      costPrice: number;
      salePrice: number;
      startingStock: number;
      currentStock: number;
      lowStockThreshold?: number;
      storeId: string;
      isActive?: boolean;
    }) => api.post('/merchandise', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchandise'] }),
  });
}

export function useUpdateMerchandiseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sku,
      ...body
    }: {
      sku: string;
      itemName?: string;
      sizeVariant?: string | null;
      costPrice?: number;
      salePrice?: number;
      lowStockThreshold?: number;
      isActive?: boolean;
    }) => api.put(`/merchandise/${encodeURIComponent(sku)}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchandise'] }),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sku, delta, reason }: { sku: string; delta: number; reason: string }) =>
      api.post(`/merchandise/${encodeURIComponent(sku)}/adjust-stock`, { delta, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchandise'] }),
  });
}

export function useDeleteMerchandiseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sku: string) => api.delete(`/merchandise/${encodeURIComponent(sku)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchandise'] }),
  });
}
