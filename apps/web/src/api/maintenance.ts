import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

interface MaintenanceFilters {
  status?: string;
  vehicleId?: string;
  fromDate?: string;
  toDate?: string;
}

export function useMaintenanceRecords(
  storeId: string,
  filters: MaintenanceFilters = {},
) {
  const params = new URLSearchParams({ storeId });
  if (filters.status) params.set('status', filters.status);
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  return useQuery({
    queryKey: ['maintenance', storeId, filters],
    queryFn: () => api.get(`/maintenance?${params}`),
    enabled: !!storeId,
  });
}

export function useMaintenanceRecord(id: string) {
  return useQuery({
    queryKey: ['maintenance', id],
    queryFn: () => api.get(`/maintenance/${id}`),
    enabled: !!id,
  });
}

export function useLogMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/maintenance', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });
}

export function useSaveMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.put(`/maintenance/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });
}

export function useDeleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });
}

export function useVehicleServiceHistory(vehicleId: string, storeId: string) {
  const params = new URLSearchParams({ storeId, vehicleId });
  return useQuery({
    queryKey: ['maintenance', 'vehicle-history', vehicleId],
    queryFn: () => api.get(`/maintenance?${params}`),
    enabled: !!vehicleId && !!storeId,
  });
}

export function useCompleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.post(`/maintenance/${id}/complete`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });
}
