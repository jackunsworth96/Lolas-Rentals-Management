import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';

export interface ReturningTodayEntry {
  vehicleName: string;
  dropoffDatetime: string;
  availableFrom: string;
}

export interface AvailabilityModelRow {
  modelId: string;
  modelName: string;
  totalUnits: number;
  availableNow: number;
  withSurfRack: number;
  withoutSurfRack: number;
  isScooter: boolean;
  returningToday: ReturningTodayEntry[];
}

export interface AvailabilityDetail {
  models: AvailabilityModelRow[];
}

export function useAvailabilityDetail(storeId: string, enabled: boolean, date?: string) {
  const params = new URLSearchParams();
  if (storeId) params.set('storeId', storeId);
  if (date) params.set('date', date);
  const q = params.toString() ? `?${params.toString()}` : '';
  return useQuery<AvailabilityDetail>({
    queryKey: ['availability-detail', storeId, date],
    queryFn: () => api.get<AvailabilityDetail>(`/dashboard/availability-detail${q}`),
    enabled,
    staleTime: 60_000,
  });
}
