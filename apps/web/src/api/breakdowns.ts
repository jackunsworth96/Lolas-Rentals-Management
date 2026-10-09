import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type BreakdownIssueType = 'flat_tyre' | 'flat_battery' | 'engine_mechanical' | 'electrical' | 'other';
export type BreakdownResolutionType = 'roadside_fix' | 'vehicle_swap' | 'towed' | 'customer_continued' | 'other';
export type BreakdownStatus = 'open' | 'resolved';

export const ISSUE_TYPE_LABELS: Record<BreakdownIssueType, string> = {
  flat_tyre: 'Flat tyre',
  flat_battery: 'Flat / dead battery',
  engine_mechanical: 'Engine / mechanical',
  electrical: 'Electrical fault',
  other: 'Other',
};

export const RESOLUTION_TYPE_LABELS: Record<BreakdownResolutionType, string> = {
  roadside_fix: 'Fixed on the roadside',
  vehicle_swap: 'Vehicle swapped',
  towed: 'Towed / returned to shop',
  customer_continued: 'Customer continued without fix',
  other: 'Other',
};

export interface BreakdownReport {
  id: string;
  storeId: string;
  orderId: string;
  vehicleId: string;
  customerId: string | null;
  breakdownAt: string;
  location: string | null;
  issueType: BreakdownIssueType;
  issueDetail: string | null;
  description: string;
  status: BreakdownStatus;
  resolutionType: BreakdownResolutionType | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  /** Minutes between breakdownAt and resolvedAt — null while still open. */
  resolutionMinutes: number | null;
  photoUrls: string[];
  additionalNotes: string | null;
  reportedByEmployeeId: string | null;
  resolvedByEmployeeId: string | null;
  createdAt: string;
  // Flattened joined fields (resolved in toDto on the API)
  fleet: { name: string; plateNumber: string } | null;
  orderReference: string | null;
  customerName: string | null;
  reportedByName: string | null;
  resolvedByName: string | null;
}

export interface CreateBreakdownBody {
  storeId: string;
  orderId: string;
  vehicleId: string;
  customerId?: string | null;
  breakdownAt: string;
  location?: string | null;
  issueType: BreakdownIssueType;
  issueDetail?: string | null;
  description: string;
  photoUrls: string[];
  additionalNotes?: string | null;
  // Optional "already resolved at creation time" fields
  resolved?: boolean;
  resolutionType?: BreakdownResolutionType | null;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
}

export interface ResolveBreakdownBody {
  resolutionType: BreakdownResolutionType;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
}

export function useBreakdowns(storeId: string, filters: { vehicleId?: string; orderId?: string; status?: BreakdownStatus } = {}) {
  const params = new URLSearchParams({ storeId });
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId);
  if (filters.orderId) params.set('orderId', filters.orderId);
  if (filters.status) params.set('status', filters.status);

  return useQuery({
    queryKey: ['breakdowns', storeId, filters],
    queryFn: () => api.get<BreakdownReport[]>(`/breakdowns?${params}`),
    enabled: !!storeId,
  });
}

export function useVehicleBreakdowns(vehicleId: string, storeId: string) {
  const params = new URLSearchParams({ storeId, vehicleId });
  return useQuery({
    queryKey: ['breakdowns', 'vehicle', vehicleId],
    queryFn: () => api.get<BreakdownReport[]>(`/breakdowns?${params}`),
    enabled: !!vehicleId && !!storeId,
  });
}

export function useOrderBreakdowns(orderId: string, storeId: string) {
  const params = new URLSearchParams({ storeId, orderId });
  return useQuery({
    queryKey: ['breakdowns', 'order', orderId],
    queryFn: () => api.get<BreakdownReport[]>(`/breakdowns?${params}`),
    enabled: !!orderId && !!storeId,
  });
}

export function useBreakdown(id: string) {
  return useQuery({
    queryKey: ['breakdowns', id],
    queryFn: () => api.get<BreakdownReport>(`/breakdowns/${id}`),
    enabled: !!id,
  });
}

export function useCreateBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBreakdownBody) => api.post<BreakdownReport>('/breakdowns', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['breakdowns'] });
    },
  });
}

export function useResolveBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResolveBreakdownBody }) =>
      api.patch<BreakdownReport>(`/breakdowns/${id}/resolve`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['breakdowns'] });
    },
  });
}

export async function uploadBreakdownPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const result = await api.upload<{ url: string }>('/breakdowns/upload-photo', form);
  return result.url;
}
