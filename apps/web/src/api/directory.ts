import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface DirectoryContact {
  id: number;
  name: string;
  number: string | null;
  email: string | null;
  relationship: string | null;
  gcash_number: string | null;
  category: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export function useDirectory(search?: string) {
  return useQuery<DirectoryContact[]>({
    queryKey: ['directory', search],
    queryFn: () =>
      api.get<DirectoryContact[]>(
        `/directory${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
    staleTime: 60_000,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<DirectoryContact, 'id' | 'created_at'>) =>
      api.post<DirectoryContact>('/directory', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['directory'] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DirectoryContact) =>
      api.put<DirectoryContact>(`/directory/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['directory'] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/directory/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['directory'] }),
  });
}
