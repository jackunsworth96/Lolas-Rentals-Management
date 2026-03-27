import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export function useBalances(storeId: string, period: string) {
  return useQuery({
    queryKey: ['balances', storeId, period],
    queryFn: () => api.get(`/accounting/balances?storeId=${storeId}&period=${period}`),
    enabled: !!storeId && !!period,
  });
}

export interface AccountBalanceItem {
  accountId: string;
  accountName: string;
  accountType: string;
  storeId?: string | null;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export interface BalanceSummaryGroup {
  type: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  accounts: AccountBalanceItem[];
}

export interface BalancesV2Response {
  storeId: string;
  month: string;
  half: string;
  from: string;
  to: string;
  summary: BalanceSummaryGroup[];
}

export function useBalancesV2(storeId: string, month: string, half: '1' | '2') {
  const params = new URLSearchParams({ storeId, month, half });
  return useQuery<BalancesV2Response>({
    queryKey: ['balances-v2', storeId, month, half],
    queryFn: () => api.get(`/accounting/balances-v2?${params}`),
    enabled: !!storeId && !!month,
  });
}

export interface LedgerEntry {
  entryId: string;
  transactionId: string;
  period: string;
  date: string;
  storeId: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
  referenceType: string;
  referenceId: string | null;
  createdBy: string | null;
}

export function useAccountLedger(accountId: string, from: string, to: string) {
  const params = new URLSearchParams({ accountId, from, to });
  return useQuery<LedgerEntry[]>({
    queryKey: ['account-ledger', accountId, from, to],
    queryFn: () => api.get(`/accounting/account-ledger?${params}`),
    enabled: !!accountId && !!from && !!to,
  });
}

export function useJournalEntries(storeId: string, period: string) {
  return useQuery({
    queryKey: ['journal-entries', storeId, period],
    queryFn: () => api.get(`/accounting/entries?storeId=${storeId}&period=${period}`),
    enabled: !!storeId && !!period,
  });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/accounting/journal', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['balances-v2'] });
    },
  });
}

export function useTransferFunds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/accounting/transfer', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['balances-v2'] });
    },
  });
}
