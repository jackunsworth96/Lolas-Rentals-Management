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
  /** Debits posted inside the period. */
  debitTotal: number;
  /** Credits posted inside the period. */
  creditTotal: number;
  /** Closing balance (debit − credit) at the end of the period. */
  balance: number;
  openingBalance?: number;
  closingBalance?: number;
  lastReconciliation?: ReconciliationSummary | null;
}

export interface ReconciliationSummary {
  asOfDate: string;
  ledgerBalance: number;
  countedBalance: number;
  variance: number;
  notes: string;
  createdAt: string;
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
  /** Totals across the whole ledger through `to`; equal when the books balance. */
  ledgerCheck?: { debits: number; credits: number };
}

export function useBalancesV2(storeId: string, month: string, half: '1' | '2' | 'full', asOf?: string) {
  const params = new URLSearchParams({ storeId, month, half, ...(asOf ? { asOf } : {}) });
  return useQuery<BalancesV2Response>({
    queryKey: ['balances-v2', storeId, month, half, asOf ?? null],
    queryFn: () => api.get(`/accounting/balances-v2?${params}`),
    enabled: !!storeId && !!month,
  });
}

export interface AccountReconciliationRecord {
  id: string;
  asOfDate: string;
  ledgerBalance: number;
  countedBalance: number;
  variance: number;
  adjustmentTxId: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AccountSummary {
  accountId: string;
  accountName: string;
  accountType: string;
  storeId: string;
  from: string;
  to: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
  reconciliations: AccountReconciliationRecord[];
}

export function useAccountSummary(accountId: string, from: string, to: string) {
  const params = new URLSearchParams({ accountId, from, to });
  return useQuery<AccountSummary>({
    queryKey: ['account-summary', accountId, from, to],
    queryFn: () => api.get(`/accounting/account-summary?${params}`),
    enabled: !!accountId && !!from && !!to,
  });
}

function invalidateAccounting(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['balances', 'balances-v2', 'account-summary', 'account-ledger', 'journal-entries', 'dashboard', 'charity-impact']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export interface ReconcileAccountPayload {
  accountId: string;
  asOfDate: string;
  /** As staff read it: a positive amount owed for liabilities. */
  countedBalance: number;
  notes: string;
  offsetAccountId?: string;
}

export interface ReconcileAccountResult {
  id: string;
  ledgerBalance: number;
  countedBalance: number;
  variance: number;
  adjustmentTxId: string | null;
}

export function useReconcileAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReconcileAccountPayload) => api.post<ReconcileAccountResult>('/accounting/reconcile', body),
    onSuccess: () => invalidateAccounting(qc),
  });
}

export interface CharityPayoutPayload {
  amount: number;
  fromAccountId: string;
  date: string;
  note: string;
}

export function useCharityPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CharityPayoutPayload) => api.post('/accounting/charity-payout', body),
    onSuccess: () => invalidateAccounting(qc),
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
    onSuccess: () => invalidateAccounting(qc),
  });
}

export function useTransferFunds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/accounting/transfer', body),
    onSuccess: () => invalidateAccounting(qc),
  });
}

export interface OwnerDrawingsPayload {
  amount: number;
  paymentMethod: 'cash' | 'gcash' | 'bank_transfer';
  date: string;
  note?: string;
  fromAccountId?: string;
}

export function usePostOwnerDrawings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OwnerDrawingsPayload) => api.post('/accounting/drawings', body),
    onSuccess: () => invalidateAccounting(qc),
  });
}

export function useLastDepreciationDate() {
  return useQuery<{ date: string | null }>({
    queryKey: ['last-depreciation-date'],
    queryFn: () => api.get<{ date: string | null }>('/accounting/last-depreciation'),
    staleTime: 5 * 60_000,
  });
}
