import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

// ── Types ──

export interface BudgetLine {
  id: string;
  budgetPeriodId: string;
  lineType: string;
  categoryLabel: string;
  coaAccountId: string | null;
  expenseCategoryId: number | null;
  month: number;
  amount: number;
}

export interface UpsertLine {
  lineType: string;
  categoryLabel: string;
  coaAccountId?: string | null;
  expenseCategoryId?: number | null;
  month: number;
  amount: number;
}

export interface ExpenseActual {
  expenseCategoryId: number | null;
  categoryLabel: string;
  month: number;
  total: number;
}

export interface JournalActual {
  accountId: string;
  accountName: string;
  lineType: string;
  month: number;
  total: number;
}

export interface RevenueActual {
  lineType: string;
  categoryLabel: string;
  month: number;
  total: number;
}

export interface BudgetResponse {
  period: BudgetLine[];
  actuals: {
    expenses: ExpenseActual[];
    journals: JournalActual[];
    revenue: RevenueActual[];
  };
}

// ── Hooks ──

export function useBudget(storeId: string | null, year: number, month?: number) {
  const params = new URLSearchParams();
  if (storeId) params.set('storeId', storeId);
  params.set('year', String(year));
  if (month !== undefined) params.set('month', String(month));

  return useQuery<BudgetResponse>({
    queryKey: ['budget', storeId, year, month],
    queryFn: () => api.get(`/budget?${params}`),
    enabled: year > 0,
  });
}

export function useAutofill(storeId: string | null, year: number, enabled: boolean) {
  const params = new URLSearchParams();
  if (storeId) params.set('storeId', storeId);
  params.set('year', String(year));

  return useQuery<{ lines: UpsertLine[] }>({
    queryKey: ['budget-autofill', storeId, year],
    queryFn: () => api.get(`/budget/autofill?${params}`),
    enabled,
  });
}

export function useUpsertBudgetLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeId: string | null; year: number; lines: UpsertLine[] }) =>
      api.post('/budget/lines', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget'] }),
  });
}
