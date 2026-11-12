import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  Contract,
  ContractCategory,
  ContractCounterparty,
  ContractCounterpartyType,
  ContractSendResult,
  ContractStatus,
  ContractTemplate,
  CreateContractRequest,
  CreateContractTemplateRequest,
  PublicContractView,
  SendContractRequest,
  SignContractRequest,
  UpdateContractRequest,
  UpdateContractTemplateRequest,
} from '@lolas/shared';
import { api } from './client.js';
import { normalizeApiBase } from './normalize-api-base.js';

export type {
  Contract,
  ContractCategory,
  ContractCounterparty,
  ContractCounterpartyType,
  ContractSendResult,
  ContractStatus,
  ContractTemplate,
  PublicContractView,
} from '@lolas/shared';

export interface ContractListParams {
  q?: string;
  status?: ContractStatus;
  category?: ContractCategory;
  counterpartyType?: ContractCounterpartyType;
  counterpartyId?: string;
}

export function useContracts(params: ContractListParams = {}, enabled = true) {
  return useQuery({
    queryKey: ['contracts', 'list', params],
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v.trim()) qs.set(k, v.trim());
      const query = qs.toString();
      return api.get<Contract[]>(`/contracts${query ? `?${query}` : ''}`);
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useContract(id: string | null | undefined) {
  return useQuery({
    queryKey: ['contracts', 'detail', id],
    queryFn: () => api.get<Contract>(`/contracts/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useContractTemplates(includeInactive = false) {
  return useQuery({
    queryKey: ['contracts', 'templates', includeInactive],
    queryFn: () => api.get<ContractTemplate[]>(`/contracts/templates${includeInactive ? '?includeInactive=true' : ''}`),
  });
}

export function useContractCounterparties(type: ContractCounterpartyType | null) {
  return useQuery({
    queryKey: ['contracts', 'counterparties', type],
    queryFn: () => api.get<ContractCounterparty[]>(`/contracts/counterparties?type=${type}`),
    enabled: !!type && type !== 'external',
    staleTime: 5 * 60_000,
  });
}

function useInvalidateContracts() {
  const qc = useQueryClient();
  return (contract?: Contract) => {
    if (contract) qc.setQueryData(['contracts', 'detail', contract.id], (prev: Contract | undefined) => ({ ...contract, events: contract.events ?? prev?.events }));
    qc.invalidateQueries({ queryKey: ['contracts', 'list'] });
    if (contract) qc.invalidateQueries({ queryKey: ['contracts', 'detail', contract.id] });
  };
}

export function useSaveContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: (CreateContractTemplateRequest | UpdateContractTemplateRequest) & { id?: string }) =>
      id
        ? api.patch<ContractTemplate>(`/contracts/templates/${encodeURIComponent(id)}`, body)
        : api.post<ContractTemplate>('/contracts/templates', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts', 'templates'] }),
  });
}

export function useCreateContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: (body: CreateContractRequest) => api.post<Contract>('/contracts', body),
    onSuccess: (c) => invalidate(c),
  });
}

export function useUpdateContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateContractRequest & { id: string }) => api.patch<Contract>(`/contracts/${encodeURIComponent(id)}`, body),
    onSuccess: (c) => invalidate(c),
  });
}

export function useSendContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: ({ id, ...body }: SendContractRequest & { id: string }) =>
      api.post<ContractSendResult>(`/contracts/${encodeURIComponent(id)}/send`, body),
    onSuccess: (r) => invalidate(r.contract),
  });
}

export function useResendContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: ({ id, sendEmail }: { id: string; sendEmail: boolean }) =>
      api.post<ContractSendResult>(`/contracts/${encodeURIComponent(id)}/resend`, { sendEmail }),
    onSuccess: (r) => invalidate(r.contract),
  });
}

export function useVoidContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) =>
      api.post<Contract>(`/contracts/${encodeURIComponent(id)}/void`, { reason }),
    onSuccess: (c) => invalidate(c),
  });
}

export function useEmailContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to, message }: { id: string; to: string[]; message?: string | null }) =>
      api.post<{ sentTo: string[] }>(`/contracts/${encodeURIComponent(id)}/email`, { to, message: message ?? null }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['contracts', 'detail', vars.id] }),
  });
}

/** Opens the tab synchronously so popup blockers allow it, then points it at the signed URL. */
export async function openContractPdf(id: string): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const { url } = await api.get<{ url: string }>(`/contracts/${encodeURIComponent(id)}/pdf`);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}

// ── Public signing link (no staff session) ──────────────────

const BASE_URL = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/public/contracts/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  let json: { success: boolean; data?: T; error?: { code?: string; message?: string } };
  try {
    json = await res.json();
  } catch {
    throw new Error(`Request failed: ${res.status}`);
  }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data as T;
}

export function fetchPublicContract(token: string): Promise<PublicContractView> {
  return publicRequest<PublicContractView>(encodeURIComponent(token));
}

export function signPublicContract(token: string, body: SignContractRequest): Promise<PublicContractView> {
  return publicRequest<PublicContractView>(`${encodeURIComponent(token)}/sign`, { method: 'POST', body: JSON.stringify(body) });
}

export function publicContractPdfUrl(token: string): string {
  return `${BASE_URL}/public/contracts/${encodeURIComponent(token)}/pdf`;
}
