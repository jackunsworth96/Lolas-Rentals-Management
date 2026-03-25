import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type UiErrorStatusFilter = 'all' | 'outstanding' | 'fixed';

export interface UIErrorRow {
  id: string;
  page: string;
  errorDescription: string;
  ideaAndImprovements: string | null;
  employeeId: string | null;
  employeeName: string | null;
  fixed: boolean;
  createdAt: string;
}

export function useUIErrors(status: UiErrorStatusFilter) {
  const params = new URLSearchParams({ status });
  return useQuery<UIErrorRow[]>({
    queryKey: ['ui-errors', status],
    queryFn: () => api.get(`/ui-errors?${params}`),
  });
}

export function useCreateUIError() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      page: string;
      errorDescription: string;
      ideaAndImprovements?: string | null;
    }) => api.post<UIErrorRow>('/ui-errors', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ui-errors'] }),
  });
}

export function useUpdateUIErrorFixed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fixed }: { id: string; fixed: boolean }) =>
      api.put<UIErrorRow>(`/ui-errors/${id}`, { fixed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ui-errors'] }),
  });
}
