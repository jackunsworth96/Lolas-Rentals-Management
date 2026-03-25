import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface LostOpportunityRow {
  id: number;
  storeId: string;
  date: string;
  time: string | null;
  vehicleRequested: string | null;
  quantity: number;
  durationDays: number | null;
  estValue: number | null;
  reason: string | null;
  outcome: string | null;
  staffNotes: string | null;
  createdAt: string;
}

export function useLostOpportunities(storeId: string, date: string) {
  const params = new URLSearchParams({ storeId, date });
  return useQuery<LostOpportunityRow[]>({
    queryKey: ['lost-opportunities', storeId, date],
    queryFn: () => api.get(`/lost-opportunities?${params}`),
    enabled: !!storeId && !!date,
  });
}

export function useCreateLostOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      date: string;
      time?: string | null;
      vehicleRequested?: string | null;
      quantity: number;
      durationDays?: number | null;
      estValue?: number | null;
      reason: string;
      outcome?: string | null;
      staffNotes?: string | null;
    }) => api.post<LostOpportunityRow>('/lost-opportunities', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lost-opportunities'] }),
  });
}

export function useUpdateLostOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      storeId: string;
      date?: string;
      time?: string | null;
      vehicleRequested?: string | null;
      quantity?: number;
      durationDays?: number | null;
      estValue?: number | null;
      reason?: string;
      outcome?: string | null;
      staffNotes?: string | null;
    }) => api.put<LostOpportunityRow>(`/lost-opportunities/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lost-opportunities'] }),
  });
}

export function useDeleteLostOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, storeId }: { id: number; storeId: string }) =>
      api.delete<{ deleted: boolean }>(`/lost-opportunities/${id}?storeId=${encodeURIComponent(storeId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lost-opportunities'] }),
  });
}
