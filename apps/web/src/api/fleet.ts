import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { VehicleSummary } from '../types/api.js';

export interface FleetUnavailability {
  id: string;
  vehicleId: string;
  storeId: string;
  type: 'owner_use';
  startsAt: string;
  endsAt: string;
  note: string | null;
  createdBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityExplanation {
  models: Array<{
    modelId: string;
    modelName: string;
    totalEligible: number;
    availableCount: number;
    exactVehicleExclusions: Array<{
      vehicleId: string;
      vehicleName: string;
      reasons: Array<'order' | 'walk_in' | 'owner_use'>;
    }>;
    capacityDeductions: { directReservations: number; holds: number };
  }>;
  configurationExclusions: Array<{
    vehicleId: string;
    vehicleName: string;
    reason: 'missing_model' | 'non_rentable_status' | 'inactive_model';
    detail?: string;
  }>;
}

export function useFleet(storeId: string) {
  return useQuery<VehicleSummary[]>({
    queryKey: ['fleet', storeId],
    queryFn: () => api.get<VehicleSummary[]>(`/fleet?storeId=${encodeURIComponent(storeId || 'all')}`),
    enabled: true,
  });
}

export function useFleetBookValueSummary() {
  return useQuery<{ totalBookValue: number; activeCount: number }>({
    queryKey: ['fleet-book-value-summary'],
    queryFn: async () => {
      const vehicles = await api.get<VehicleSummary[]>('/fleet?storeId=all');
      const active = vehicles.filter((v) => v.status !== 'Sold');
      const totalBookValue = active.reduce((sum, v) => sum + (v.bookValue ?? 0), 0);
      return { totalBookValue, activeCount: active.length };
    },
    staleTime: 60_000,
  });
}

export function useFleetSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/fleet/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

export function useFleetUnavailability(storeId: string, vehicleId?: string) {
  const search = new URLSearchParams({ storeId });
  if (vehicleId) search.set('vehicleId', vehicleId);
  return useQuery<FleetUnavailability[]>({
    queryKey: ['fleet-unavailability', storeId, vehicleId],
    queryFn: () => api.get(`/fleet/unavailability?${search.toString()}`),
    enabled: Boolean(storeId),
  });
}

export function useCreateFleetUnavailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      vehicleId: string; storeId: string; type: 'owner_use'; startsAt: string; endsAt: string; note?: string | null;
    }) => api.post<FleetUnavailability>('/fleet/unavailability', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fleet'] });
      qc.invalidateQueries({ queryKey: ['fleet-unavailability'] });
    },
  });
}

export function useUpdateFleetUnavailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; startsAt: string; endsAt: string; note?: string | null }) =>
      api.put<FleetUnavailability>(`/fleet/unavailability/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fleet'] });
      qc.invalidateQueries({ queryKey: ['fleet-unavailability'] });
    },
  });
}

export function useCancelFleetUnavailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; cancelled: boolean }>(`/fleet/unavailability/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fleet'] });
      qc.invalidateQueries({ queryKey: ['fleet-unavailability'] });
    },
  });
}

export function useAvailabilityExplanation(params: {
  storeId: string; pickupDatetime: string; dropoffDatetime: string; enabled?: boolean;
}) {
  const search = new URLSearchParams({
    storeId: params.storeId,
    pickupDatetime: params.pickupDatetime,
    dropoffDatetime: params.dropoffDatetime,
  });
  return useQuery<AvailabilityExplanation>({
    queryKey: ['availability-explanation', params.storeId, params.pickupDatetime, params.dropoffDatetime],
    queryFn: () => api.get(`/fleet/availability-explanation?${search.toString()}`),
    enabled: (params.enabled ?? true) && Boolean(params.storeId && params.pickupDatetime && params.dropoffDatetime),
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/fleet', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

export function useFleetCalendar(params: { storeId?: string; from: string; to: string }) {
  const search = new URLSearchParams();
  if (params.storeId) search.set('storeId', params.storeId);
  search.set('from', params.from);
  search.set('to', params.to);
  return useQuery({
    queryKey: ['fleet', 'calendar', params],
    queryFn: () => api.get(`/fleet/calendar?${search.toString()}`),
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

export interface AvailableVehicle {
  id: string;
  name: string;
  modelId: string;
  storeId: string;
  status: string;
  surfRack: boolean;
}

export function useAvailableVehicles(
  storeId: string,
  pickupDatetime: string,
  dropoffDatetime: string,
) {
  return useQuery<AvailableVehicle[]>({
    queryKey: ['fleet', 'available', storeId, pickupDatetime, dropoffDatetime],
    queryFn: () =>
      api.get(
        `/fleet/available?storeId=${encodeURIComponent(storeId)}&pickupDatetime=${encodeURIComponent(pickupDatetime)}&dropoffDatetime=${encodeURIComponent(dropoffDatetime)}`,
      ),
    enabled: !!storeId && !!pickupDatetime && !!dropoffDatetime
      && pickupDatetime !== dropoffDatetime,
  });
}
