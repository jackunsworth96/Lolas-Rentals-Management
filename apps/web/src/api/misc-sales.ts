import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface EnrichedMiscSale {
  id: string;
  storeId: string;
  date: string;
  description: string | null;
  category: string | null;
  amount: number;
  receivedInto: string | null;
  receivedIntoName: string | null;
  incomeAccountId: string | null;
  incomeAccountName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  createdAt: string;
}

export function useMiscSales(storeId: string, date: string) {
  const params = new URLSearchParams({ storeId, date });
  return useQuery<EnrichedMiscSale[]>({
    queryKey: ['misc-sales', storeId, date],
    queryFn: () => api.get(`/misc-sales?${params}`),
    enabled: !!storeId && !!date,
  });
}

export function useRecordMiscSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      date: string;
      description: string;
      category: string | null;
      amount: number;
      receivedInto: string;
      incomeAccountId: string;
      employeeId: string | null;
    }) => api.post('/misc-sales', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['misc-sales'] }),
  });
}

export function useUpdateMiscSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      date?: string;
      description?: string;
      category?: string | null;
      amount?: number;
      receivedInto?: string;
      incomeAccountId?: string;
      employeeId?: string | null;
    }) => api.put(`/misc-sales/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['misc-sales'] }),
  });
}

export function useDeleteMiscSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/misc-sales/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['misc-sales'] }),
  });
}
