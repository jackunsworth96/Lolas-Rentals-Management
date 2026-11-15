import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type ExpenseKind = 'standard' | 'bike_allowance' | 'cash_advance' | 'handled_elsewhere' | 'system';

export interface EnrichedExpense {
  id: string;
  storeId: string;
  date: string;
  category: string;
  categoryId: number | null;
  kind: ExpenseKind;
  groupName: string | null;
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
  linkedTo: 'timesheet' | 'maintenance' | null;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  canChange: boolean;
}

export interface ExpenseCatalogItem {
  id: number;
  name: string;
  kind: ExpenseKind;
  groupName: string | null;
  sortOrder: number;
  accountId: string | null;
  requiresVehicle: boolean;
  requiresEmployee: boolean;
  requiresNote: boolean;
  softLimit: number | null;
  managersOnly: boolean;
  helpText: string | null;
  linkPath: string | null;
  isActive: boolean;
}

export interface StaffPayoutRow {
  employeeId: string;
  employeeName: string;
  monthlyAllowance: number;
  allowanceBalance: number;
  advanceOutstanding: number;
}

export interface ExpenseFilters {
  categoryId?: number;
  employeeId?: string;
  vehicleId?: string;
}

export function useExpenses(
  storeId: string,
  range: { date: string } | { dateFrom: string; dateTo: string },
  filters: ExpenseFilters = {},
) {
  const params = new URLSearchParams({ storeId, ...range });
  if (filters.categoryId) params.set('categoryId', String(filters.categoryId));
  if (filters.employeeId) params.set('employeeId', filters.employeeId);
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId);
  return useQuery<EnrichedExpense[]>({
    queryKey: ['expenses', storeId, range, filters],
    queryFn: () => api.get(`/expenses?${params}`),
    enabled: !!storeId,
  });
}

export function useStaffPayouts(storeId: string, enabled: boolean) {
  return useQuery<StaffPayoutRow[]>({
    queryKey: ['expenses', 'staff-payouts', storeId],
    queryFn: () => api.get(`/expenses/staff-payouts?storeId=${encodeURIComponent(storeId)}`),
    enabled: !!storeId && enabled,
  });
}

export interface ExpenseCheck {
  duplicates: number;
  overLimit: boolean;
  softLimit: number | null;
}

export function useExpenseCheck(p: {
  storeId: string;
  categoryId: number | null;
  date: string;
  amount: number;
  employeeId?: string;
  vehicleId?: string;
  excludeId?: string;
}) {
  const ready = !!p.storeId && !!p.categoryId && p.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date);
  const params = new URLSearchParams({
    storeId: p.storeId,
    categoryId: String(p.categoryId ?? ''),
    date: p.date,
    amount: String(p.amount),
  });
  if (p.employeeId) params.set('employeeId', p.employeeId);
  if (p.vehicleId) params.set('vehicleId', p.vehicleId);
  if (p.excludeId) params.set('excludeId', p.excludeId);
  return useQuery<ExpenseCheck>({
    queryKey: ['expenses', 'check', params.toString()],
    queryFn: () => api.get(`/expenses/check?${params}`),
    enabled: ready,
    staleTime: 10_000,
  });
}

export interface AdvanceTerms {
  repaymentType: 'lump-sum' | 'installments';
  deductOn?: 'mid_month' | 'end_of_month';
  periods?: number;
  startPayday?: 'mid_month' | 'end_of_month';
}

export interface CreateExpenseBody {
  storeId: string;
  categoryId: number;
  date: string;
  amount: number;
  description: string;
  status: 'paid' | 'unpaid';
  paymentMethodId: string | null;
  vehicleId: string | null;
  employeeId: string | null;
  advance?: AdvanceTerms;
  confirmDuplicate?: boolean;
  confirmOverLimit?: boolean;
  accountOverride?: { accountId: string; reason: string };
}

export interface UpdateExpenseBody {
  id: string;
  categoryId?: number;
  date?: string;
  amount?: number;
  description?: string;
  paymentMethodId?: string;
  vehicleId?: string | null;
  employeeId?: string | null;
  confirmDuplicate?: boolean;
  confirmOverLimit?: boolean;
  accountOverride?: { accountId: string; reason: string };
}

/** Expenses feed cash up, payroll (allowance and advances) and the books, so refresh all of them. */
function invalidateMoney(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['expenses'] });
  qc.invalidateQueries({ queryKey: ['cashup'] });
  qc.invalidateQueries({ queryKey: ['payroll'] });
  qc.invalidateQueries({ queryKey: ['cash-advances'] });
  qc.invalidateQueries({ queryKey: ['accounting'] });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExpenseBody) => api.post<{ expenseId: string; kind: ExpenseKind }>('/expenses', body),
    onSuccess: () => invalidateMoney(qc),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateExpenseBody) => api.put(`/expenses/${id}`, body),
    onSuccess: () => invalidateMoney(qc),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => invalidateMoney(qc),
  });
}

export function usePayExpenses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { expenseIds: string[]; paymentMethodId: string; storeId: string }) =>
      api.post('/expenses/pay', body),
    onSuccess: () => invalidateMoney(qc),
  });
}
