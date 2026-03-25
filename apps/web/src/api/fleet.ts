import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export function useFleet(storeId: string) {
  return useQuery({
    queryKey: ['fleet', storeId],
    queryFn: () => api.get(`/fleet?storeId=${encodeURIComponent(storeId || 'all')}`),
    enabled: true,
  });
}

export function useFleetSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/fleet/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/fleet', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

export function useFleetUtilization(params: { from?: string; to?: string; period?: string; storeId?: string }) {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.period) search.set('period', params.period);
  if (params.storeId) search.set('storeId', params.storeId);
  return useQuery({
    queryKey: ['fleet', 'utilization', params],
    queryFn: () => api.get(`/fleet/utilization?${search.toString()}`),
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ['fleet', id],
    queryFn: () => api.get(`/fleet/${id}`),
    enabled: !!id,
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.put(`/fleet/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

export function useRecordPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/fleet/purchase', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

export function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/fleet/sale', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

export function useBatchDepreciation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/fleet/depreciation', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}
