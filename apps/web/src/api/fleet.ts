import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { VehicleSummary } from '../types/api.js';

export interface FleetUnavailability {
  id: string;
  vehicleId: string;
  storeId: string;
  type: 'owner_use';
  startsAt: string;
  endsAt: string | null;
  note: string | null;
  createdBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SURF_RACK_PRODUCT = 'surf-rack';

export type FinderVehicleState = 'free' | 'on_rent' | 'overdue' | 'awaiting_pickup' | 'walk_in' | 'owner_use';

export interface ProtectedFor {
  partnerId: string | null;
  partnerName: string | null;
}

export interface FinderVehicleRow {
  vehicleId: string;
  vehicleName: string;
  surfRack: boolean;
  state: FinderVehicleState;
  reference: string | null;
  customerName: string | null;
  orderId: string | null;
  rawOrderId: string | null;
  returnAt: string | null;
  nextFreeAt: string | null;
  freeUntil: string | null;
  heldForBooking: boolean;
  protectedFor: ProtectedFor | null;
}

export interface FinderProduct {
  modelId: string;
  modelName: string;
  vehicleType: string | null;
  hiddenFromWebsite: boolean;
  totalUnits: number;
  freeNow: number;
  protectedNow: number;
  heldNow: number;
  backToday: number;
  vehicles: FinderVehicleRow[];
  unassignedBookings: Array<{ reference: string | null; customerName: string | null; rawOrderId: string | null; pickupAt: string; dropoffAt: string }>;
  basketHolds: number;
}

export interface PartnerAllowanceSummary {
  partnerId: string;
  partnerName: string;
  vehicleType: string;
  allowance: number;
  inUse: number;
  unused: number;
}

export interface AvailabilityFinderResult {
  from: string;
  days: number;
  horizonEnd: string;
  allocationsEnabled: boolean;
  partners: PartnerAllowanceSummary[];
  products: FinderProduct[];
  notRentable: Array<{ vehicleId: string; vehicleName: string; reason: string; detail: string | null }>;
  search: null | {
    product: string;
    productName: string;
    quantity: number;
    days: number;
    partnerId: string | null;
    answers: Array<{ unit: number; startsAt: string; readyNow: boolean; vehicleId: string | null; vehicleName: string | null; freeUntil: string | null }>;
    allTogetherAt: string | null;
    protectedBy: Array<{ partnerId: string; partnerName: string }>;
  };
  surfRacks: null | {
    tracked: boolean;
    total: number;
    inUseNow: number;
    freeNow: number;
    rackBikesFreeNow: number;
    nextFreeAt: string | null;
  };
}

export interface StorePartnerProtection {
  storeId: string;
  enabled: boolean;
  partners: PartnerAllowanceSummary[];
  protectedVehicles: Array<{ vehicleId: string; vehicleName: string; modelName: string; partnerId: string | null; partnerName: string | null }>;
}

/** Details the API attaches to an ALLOCATION_CONFLICT error. */
export interface AllocationConflictDetails {
  reason: 'partner_protected' | 'fully_committed' | 'model_full' | 'vehicle_unavailable' | 'other';
  storeId?: string;
  vehicleType?: 'bike' | 'tuktuk';
  at?: string;
  startsAt?: string;
  endsAt?: string;
  partners?: Array<{ partnerId: string; partnerName: string }>;
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

export function useReleaseCapacityHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      api.post<{ vehicleId: string; previousReleasedAt: string; releasedAt: string }>(
        `/fleet/${vehicleId}/release-hold`,
        {},
      ),
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
      vehicleId: string; storeId: string; type: 'owner_use'; startsAt: string; endsAt: string | null; note?: string | null;
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
    mutationFn: ({ id, ...body }: { id: string; startsAt: string; endsAt: string | null; note?: string | null }) =>
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

export function useAvailabilityFinder(params: {
  storeId: string; product?: string; quantity: number; days: number; from?: string; partnerId?: string; enabled?: boolean;
}) {
  const search = new URLSearchParams({ storeId: params.storeId, quantity: String(params.quantity), days: String(params.days) });
  if (params.product) search.set('product', params.product);
  if (params.from) search.set('from', params.from);
  if (params.partnerId) search.set('partnerId', params.partnerId);
  return useQuery<AvailabilityFinderResult>({
    queryKey: ['fleet', 'availability-finder', params.storeId, params.product, params.quantity, params.days, params.from, params.partnerId],
    queryFn: () => api.get(`/fleet/availability-finder?${search.toString()}`),
    enabled: (params.enabled ?? true) && Boolean(params.storeId),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });
}

export function usePartnerProtection(storeId: string, enabled = true) {
  return useQuery<StorePartnerProtection[]>({
    queryKey: ['fleet', 'partner-protection', storeId],
    queryFn: () => api.get(`/fleet/partner-protection?storeId=${encodeURIComponent(storeId || 'all')}`),
    enabled,
    staleTime: 60_000,
  });
}

export function useReleasePartnerProtection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string; partnerId: string; vehicleType: 'bike' | 'tuktuk'; startsAt: string; endsAt: string; reason: string;
    }) => api.post<{ partnerName: string; startsOn: string; endsBefore: string; previousQty: number; qty: number }>(
      '/fleet/partner-protection/release', body,
    ),
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

export function useFleetUtilization(params: { from?: string; to?: string; period?: string; storeId?: string; scope?: 'current' | 'archive' }) {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.period) search.set('period', params.period);
  if (params.storeId) search.set('storeId', params.storeId);
  if (params.scope) search.set('scope', params.scope);
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

export interface MileageEvent {
  id: string;
  previousMileage: number;
  newMileage: number;
  source: 'manual' | 'inspection' | 'maintenance';
  reason: string | null;
  employeeName: string | null;
  createdAt: string;
}

export function useMileageEvents(vehicleId: string) {
  return useQuery<MileageEvent[]>({
    queryKey: ['fleet', vehicleId, 'mileage-events'],
    queryFn: () => api.get(`/fleet/${vehicleId}/mileage-events`),
    enabled: !!vehicleId,
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.put(`/fleet/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fleet'] });
      qc.invalidateQueries({ queryKey: ['inspection-vehicle-mileage'] });
    },
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
  /** Set when this vehicle's return was processed but its 30-min post-return
   * capacity buffer hasn't elapsed yet (see release_capacity_hold_now). It will
   * still pass this availability check but reject at booking submission with
   * ALLOCATION_CONFLICT until the buffer clears or a manager releases it early. */
  pendingReleaseAt?: string | null;
  /** Free, but kept back by a partner allocation for these dates. Booking it needs a Manager/Admin release. */
  protectedFor?: (ProtectedFor & { vehicleType: 'bike' | 'tuktuk' }) | null;
}

export function availableVehiclesQuery(
  storeId: string,
  pickupDatetime: string,
  dropoffDatetime: string,
  partnerRef?: string,
  excludeRawOrderId?: string,
) {
  return {
    queryKey: ['fleet', 'available', storeId, pickupDatetime, dropoffDatetime, partnerRef, excludeRawOrderId],
    queryFn: () =>
      api.get<AvailableVehicle[]>(
        `/fleet/available?storeId=${encodeURIComponent(storeId)}&pickupDatetime=${encodeURIComponent(pickupDatetime)}&dropoffDatetime=${encodeURIComponent(dropoffDatetime)}&partnerRef=${encodeURIComponent(partnerRef ?? '')}${excludeRawOrderId ? `&excludeRawOrderId=${encodeURIComponent(excludeRawOrderId)}` : ''}`,
      ),
    enabled: !!storeId && !!pickupDatetime && !!dropoffDatetime
      && new Date(dropoffDatetime).getTime() > new Date(pickupDatetime).getTime(),
  };
}

export function useAvailableVehicles(storeId: string, pickupDatetime: string, dropoffDatetime: string, partnerRef?: string) {
  return useQuery(availableVehiclesQuery(storeId, pickupDatetime, dropoffDatetime, partnerRef));
}
