import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export function usePawCardLookup(query: string) {
  return useQuery({
    queryKey: ['paw-card', 'lookup', query],
    queryFn: () => api.get(`/paw-card/lookup?q=${encodeURIComponent(query)}`),
    enabled: !!query,
  });
}

export function useEstablishments() {
  return useQuery({
    queryKey: ['paw-card', 'establishments'],
    queryFn: () => api.get('/paw-card/establishments'),
  });
}

export function useLifetimeSavings(email: string) {
  return useQuery({
    queryKey: ['paw-card', 'savings', email],
    queryFn: () =>
      api.get(`/paw-card/savings?email=${encodeURIComponent(email)}`),
    enabled: !!email,
  });
}

export function useSubmitPawCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/paw-card/submit', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paw-card'] }),
  });
}

export function useCompanyImpact() {
  return useQuery({
    queryKey: ['paw-card', 'impact'],
    queryFn: () => api.get('/paw-card/impact'),
  });
}

export function useMySubmissions(email: string) {
  return useQuery({
    queryKey: ['paw-card', 'submissions', email],
    queryFn: () =>
      api.get(`/paw-card/submissions?email=${encodeURIComponent(email)}`),
    enabled: !!email,
  });
}
