import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface EnrichedExpense {
  id: string;
  storeId: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paidFrom: string | null;
  paidFromName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  accountId: string | null;
  accountName: string | null;
  status: 'paid' | 'unpaid';
  paidAt: string | null;
  createdAt: string;
}

export function useExpenses(storeId: string, date: string) {
  const params = new URLSearchParams({ storeId, date });
  return useQuery<EnrichedExpense[]>({
    queryKey: ['expenses', storeId, date],
    queryFn: () => api.get(`/expenses?${params}`),
    enabled: !!storeId && !!date,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      date: string;
      category: string;
      description: string;
      amount: number;
      paidFrom: string | null;
      vehicleId: string | null;
      employeeId: string | null;
      expenseAccountId: string;
      cashAccountId: string;
      status?: 'paid' | 'unpaid';
    }) => api.post('/expenses', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      date?: string;
      category?: string;
      description?: string;
      amount?: number;
      paidFrom?: string | null;
      vehicleId?: string | null;
      employeeId?: string | null;
      expenseAccountId?: string;
      cashAccountId?: string;
    }) => api.put(`/expenses/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function usePayExpenses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      expenseIds: string[];
      paymentMethodId: string;
      storeId: string;
    }) => api.post('/expenses/pay', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
