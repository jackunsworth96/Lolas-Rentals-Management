import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CreateInvoiceRequest,
  Invoice,
  InvoiceOrderSearchResult,
  InvoicePreview,
  InvoiceSettings,
  UpdateInvoiceRequest,
  UpdateInvoiceSettingsRequest,
} from '@lolas/shared';
import { api } from './client.js';

export type {
  Invoice,
  InvoiceLine,
  InvoiceOrderSearchResult,
  InvoiceOrderStage,
  InvoiceOrderSummary,
  InvoicePreview,
  InvoiceSettings,
} from '@lolas/shared';

export function useInvoices(params: { q?: string; status?: 'issued' | 'void' } = {}) {
  const { q, status } = params;
  return useQuery({
    queryKey: ['invoices', 'list', q ?? '', status ?? ''],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (q?.trim()) qs.set('q', q.trim());
      if (status) qs.set('status', status);
      const query = qs.toString();
      return api.get<Invoice[]>(`/invoices${query ? `?${query}` : ''}`);
    },
    placeholderData: keepPreviousData,
  });
}

export function useOrderInvoices(orderReference: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['invoices', 'by-order', orderReference],
    queryFn: () => api.get<Invoice[]>(`/invoices?orderReference=${encodeURIComponent(orderReference!)}`),
    enabled: enabled && !!orderReference,
  });
}

export function useInvoice(id: string | null | undefined) {
  return useQuery({
    queryKey: ['invoices', 'detail', id],
    queryFn: () => api.get<Invoice>(`/invoices/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useInvoiceOrderSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['invoices', 'order-search', term],
    queryFn: () => api.get<InvoiceOrderSearchResult[]>(`/invoices/order-search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useInvoicePreview(orderReferences: string[], enabled = true) {
  return useQuery({
    queryKey: ['invoices', 'preview', orderReferences],
    queryFn: () => api.post<InvoicePreview>('/invoices/preview', { orderReferences }),
    enabled: enabled && orderReferences.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useInvoiceSettings() {
  return useQuery({
    queryKey: ['invoices', 'settings'],
    queryFn: () => api.get<InvoiceSettings>('/invoices/settings'),
    staleTime: 5 * 60_000,
  });
}

export function useSaveInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateInvoiceSettingsRequest) => api.put<InvoiceSettings>('/invoices/settings', body),
    onSuccess: (data) => qc.setQueryData(['invoices', 'settings'], data),
  });
}

function useInvoiceMutation<TVars>(fn: (vars: TVars) => Promise<Invoice>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (invoice) => {
      qc.setQueryData(['invoices', 'detail', invoice.id], invoice);
      qc.invalidateQueries({ queryKey: ['invoices', 'list'] });
      qc.invalidateQueries({ queryKey: ['invoices', 'by-order'] });
    },
  });
}

export function useCreateInvoice() {
  return useInvoiceMutation((body: CreateInvoiceRequest) => api.post<Invoice>('/invoices', body));
}

export function useUpdateInvoice() {
  return useInvoiceMutation(({ id, ...body }: UpdateInvoiceRequest & { id: string }) =>
    api.patch<Invoice>(`/invoices/${encodeURIComponent(id)}`, body));
}

export function useRefreshInvoice() {
  return useInvoiceMutation((id: string) => api.post<Invoice>(`/invoices/${encodeURIComponent(id)}/refresh`, {}));
}

export function useVoidInvoice() {
  return useInvoiceMutation((id: string) => api.post<Invoice>(`/invoices/${encodeURIComponent(id)}/void`, {}));
}

export function fetchInvoice(id: string): Promise<Invoice> {
  return api.get<Invoice>(`/invoices/${encodeURIComponent(id)}`);
}

export function fetchInvoiceSettings(): Promise<InvoiceSettings> {
  return api.get<InvoiceSettings>('/invoices/settings');
}
