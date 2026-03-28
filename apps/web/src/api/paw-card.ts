import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

/* ---------- types ---------- */

export interface PawCardCustomer {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  orderId?: string | null;
  totalVisits: number;
  lifetimeSavings: number;
}

export interface LifetimeSavingsData {
  totalSaved: number;
  totalVisits: number;
  averageSavingsPerVisit: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  totalSaved: number;
  isCurrentUser: boolean;
}

export interface LeaderboardData {
  top: LeaderboardEntry[];
  myPosition: LeaderboardEntry | null;
}

export interface PawCardEntryData {
  id: string;
  customerId: string;
  establishmentId: string;
  establishmentName: string;
  discountAmount: number;
  visitDate: string;
  receiptUrl: string | null;
  createdAt: string;
}

export interface Establishment {
  id: string;
  name: string;
  category: string;
}

/* ---------- hooks ---------- */

export function usePawCardLookup(email: string) {
  return useQuery<PawCardCustomer[]>({
    queryKey: ['paw-card', 'lookup', email],
    queryFn: () => api.get(`/paw-card/lookup?email=${encodeURIComponent(email)}`),
    enabled: !!email,
  });
}

export function useEstablishments() {
  return useQuery<Establishment[]>({
    queryKey: ['paw-card', 'establishments'],
    queryFn: () => api.get('/paw-card/establishments'),
  });
}

export function useLifetimeSavings(email: string) {
  return useQuery<LifetimeSavingsData>({
    queryKey: ['paw-card', 'lifetime', email],
    queryFn: () => api.get(`/paw-card/lifetime?email=${encodeURIComponent(email)}`),
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
  return useQuery<{ totalEntries: number; totalDiscountGiven: number; uniqueCustomers: number }>({
    queryKey: ['paw-card', 'company-impact'],
    queryFn: () => api.get('/paw-card/company-impact'),
  });
}

export function useMySubmissions(email: string) {
  return useQuery<PawCardEntryData[]>({
    queryKey: ['paw-card', 'my-submissions', email],
    queryFn: () => api.get(`/paw-card/my-submissions?email=${encodeURIComponent(email)}`),
    enabled: !!email,
  });
}

export function useLeaderboard(email?: string) {
  return useQuery<LeaderboardData>({
    queryKey: ['paw-card', 'leaderboard', email ?? ''],
    queryFn: () => api.get(`/paw-card/leaderboard${email ? `?email=${encodeURIComponent(email)}` : ''}`),
  });
}

export function useRegisterCustomer() {
  const qc = useQueryClient();
  return useMutation<PawCardCustomer, Error, { fullName: string; email: string; mobile?: string; orderId?: string }>({
    mutationFn: (body) => api.post('/paw-card/register', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paw-card'] }),
  });
}

/**
 * Upload a receipt image. Uses FormData (multipart) so we bypass the JSON api client.
 */
export function useUploadReceipt() {
  const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '/api';
  const resolvedBase = baseUrl.startsWith('http')
    ? (baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`)
    : baseUrl || '/api';

  return useMutation<{ url: string }, Error, File>({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('receipt', file);

      const resp = await fetch(`${resolvedBase}/paw-card/upload-receipt`, {
        method: 'POST',
        body: fd,
      });

      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Upload failed');
      }
      return json.data as { url: string };
    },
  });
}
