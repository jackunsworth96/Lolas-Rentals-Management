import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export function usePendingSettlements(storeId: string) {
  const params = new URLSearchParams();
  if (storeId && storeId !== 'all') params.set('storeId', storeId);
  return useQuery({
    queryKey: ['card-settlements', 'pending', storeId],
    queryFn: () => api.get(`/card-settlements/pending?${params}`),
  });
}

export function useSettledSettlements(storeId: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (storeId && storeId !== 'all') params.set('storeId', storeId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return useQuery({
    queryKey: ['card-settlements', 'settled', storeId, from, to],
    queryFn: () => api.get(`/card-settlements/settled?${params}`),
  });
}

export function useCardBalance() {
  return useQuery({
    queryKey: ['card-settlements', 'balance'],
    queryFn: () => api.get('/card-settlements/balance'),
  });
}

export function useMatchSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/card-settlements/match', body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['card-settlements'] }),
  });
}

export function useBatchEditSettlements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/card-settlements/batch-edit', body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['card-settlements'] }),
  });
}

export function useCombineSettlements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/card-settlements/combine', body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['card-settlements'] }),
  });
}
