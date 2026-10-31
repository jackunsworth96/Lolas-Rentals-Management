import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface SurfRackAvailability {
  tracked: boolean;
  total: number;
  peakInUse: number;
  compatibleVehiclesFree: number | null;
  remaining: number;
  soldOut: boolean;
  rackAddonIds: number[];
}

export interface SurfRackAllocation {
  id: string;
  storeId: string;
  orderId: string;
  orderReference: string | null;
  customerName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  quantity: number;
  startsAt: string;
  endsAt: string;
  releasedAt: string | null;
  releasedReason: 'removed' | 'returned_early' | 'cancelled' | null;
}

export interface SurfRackStockSummary {
  total: number;
  outNow: number;
  freeNow: number;
  allocations: SurfRackAllocation[];
}

export interface SurfRackAvailabilityParams {
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  vehicleModelId?: string | null;
  excludeOrderId?: string | null;
  excludeRawOrderId?: string | null;
}

export function useSurfRackAvailability(params: SurfRackAvailabilityParams, enabled = true) {
  const { storeId, pickupDatetime, dropoffDatetime, vehicleModelId, excludeOrderId, excludeRawOrderId } = params;
  const validRange = !!pickupDatetime && !!dropoffDatetime
    && new Date(dropoffDatetime).getTime() > new Date(pickupDatetime).getTime();
  return useQuery({
    queryKey: ['surf-racks', 'availability', storeId, pickupDatetime, dropoffDatetime, vehicleModelId, excludeOrderId, excludeRawOrderId],
    queryFn: () => {
      const qs = new URLSearchParams({ storeId, pickupDatetime, dropoffDatetime });
      if (vehicleModelId) qs.set('vehicleModelId', vehicleModelId);
      if (excludeOrderId) qs.set('excludeOrderId', excludeOrderId);
      if (excludeRawOrderId) qs.set('excludeRawOrderId', excludeRawOrderId);
      return api.get<SurfRackAvailability>(`/surf-racks/availability?${qs}`);
    },
    enabled: enabled && !!storeId && validRange,
  });
}

export function useSurfRackStock(storeId: string) {
  return useQuery({
    queryKey: ['surf-racks', 'stock', storeId],
    queryFn: () => api.get<SurfRackStockSummary>(`/surf-racks/allocations?storeId=${encodeURIComponent(storeId)}`),
    enabled: !!storeId && storeId !== 'all',
  });
}

export function useOrderSurfRackAllocations(orderId: string) {
  return useQuery({
    queryKey: ['surf-racks', 'order', orderId],
    queryFn: () => api.get<{ allocations: SurfRackAllocation[] }>(`/surf-racks/allocations?orderId=${encodeURIComponent(orderId)}`),
    enabled: !!orderId,
  });
}

export function useReleaseSurfRack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason = 'returned_early' }: { id: string; reason?: 'returned_early' | 'removed' }) =>
      api.post<SurfRackAllocation>(`/surf-racks/allocations/${encodeURIComponent(id)}/release`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surf-racks'] }),
  });
}
