import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NgoRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  is_active?: boolean;
}

export interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: 'ngo' | 'automation' | 'general';
  ngo_id: string | null;
  featured_image_url: string | null;
  meta_description: string | null;
  tags: string[];
  published_at: string | null;
  created_at?: string;
  updated_at?: string;
  ngos?: NgoRow | null;
}

export interface ArticleFull extends ArticleListItem {
  body_markdown: string | null;
}

export interface NgoTotal {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  totalDonated: number;
}

export interface CharityImpact {
  openingBalance: number;
  totalRaised: number;
  totalDonated: number;
  pendingPayout: number;
  bookingContributions: number;
  annualCap: number;
  annualDonated: number;
}

export interface UpsertArticlePayload {
  slug?: string;
  title: string;
  excerpt?: string | null;
  body_markdown?: string | null;
  category?: 'ngo' | 'automation' | 'general';
  ngo_id?: string | null;
  featured_image_url?: string | null;
  meta_description?: string | null;
  tags?: string[];
  published?: boolean;
}

// ── Public hooks (no auth) ────────────────────────────────────────────────────

export function usePublicArticles(page = 1, category?: string) {
  const params = new URLSearchParams({ page: String(page), limit: '12' });
  if (category) params.set('category', category);
  return useQuery<ArticleListItem[]>({
    queryKey: ['public', 'impact', 'articles', page, category],
    queryFn: () => api.get<ArticleListItem[]>(`/public/impact/articles?${params}`),
    staleTime: 2 * 60_000,
  });
}

export function usePublicArticle(slug: string) {
  return useQuery<ArticleFull>({
    queryKey: ['public', 'impact', 'article', slug],
    queryFn: () => api.get<ArticleFull>(`/public/impact/articles/${slug}`),
    staleTime: 5 * 60_000,
    enabled: !!slug,
  });
}

export function usePublicNgoTotals() {
  return useQuery<NgoTotal[]>({
    queryKey: ['public', 'impact', 'ngo-totals'],
    queryFn: () => api.get<NgoTotal[]>('/public/impact/ngo-totals'),
    staleTime: 5 * 60_000,
  });
}

/** Single source for the donation counter shown across the public site and backoffice. */
export function useCharityImpact() {
  return useQuery<CharityImpact>({
    queryKey: ['charity-impact'],
    queryFn: () => api.get<CharityImpact>('/public/booking/charity-impact'),
    staleTime: 5 * 60_000,
  });
}

// ── Admin hooks (authenticated) ───────────────────────────────────────────────

export function useAdminArticles() {
  return useQuery<ArticleListItem[]>({
    queryKey: ['admin', 'impact', 'articles'],
    queryFn: () => api.get<ArticleListItem[]>('/impact/articles'),
    staleTime: 60_000,
  });
}

export function useAdminArticle(id: string) {
  return useQuery<ArticleFull>({
    queryKey: ['admin', 'impact', 'article', id],
    queryFn: () => api.get<ArticleFull>(`/impact/articles/${id}`),
    enabled: !!id,
  });
}

export function useAdminNgos() {
  return useQuery<NgoRow[]>({
    queryKey: ['admin', 'impact', 'ngos'],
    queryFn: () => api.get<NgoRow[]>('/impact/ngos'),
    staleTime: 10 * 60_000,
  });
}

export function useCreateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertArticlePayload) =>
      api.post<ArticleFull>('/impact/articles', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'impact', 'articles'] });
      void qc.invalidateQueries({ queryKey: ['public', 'impact', 'articles'] });
    },
  });
}

export function useUpdateArticle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<UpsertArticlePayload>) =>
      api.patch<ArticleFull>(`/impact/articles/${id}`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'impact', 'articles'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'impact', 'article', id] });
      void qc.invalidateQueries({ queryKey: ['public', 'impact', 'articles'] });
    },
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/impact/articles/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'impact', 'articles'] });
      void qc.invalidateQueries({ queryKey: ['public', 'impact', 'articles'] });
    },
  });
}
