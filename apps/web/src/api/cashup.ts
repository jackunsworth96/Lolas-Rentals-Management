import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface MiscSaleRow {
  id: string;
  description: string | null;
  category: string | null;
  amount: number;
  receivedInto: string | null;
  accountName: string | null;
  employeeId: string | null;
  createdAt: string;
}

export interface CharityDonationRow {
  id: string;
  description: string | null;
  amount: number;
  orderId: string | null;
  createdAt: string;
}

export interface CashupSummary {
  openingFloat: {
    amount: number;
    source: 'previous_day' | 'override' | 'none';
    previousDate: string | null;
  };
  transactions: {
    cashSales: TransactionRow[];
    cardSales: TransactionRow[];
    gcashSales: TransactionRow[];
    bankTransfer: TransactionRow[];
    depositsHeld: DepositsHeldGroup[];
    miscSales: {
      cash: MiscSaleRow[];
      card: MiscSaleRow[];
      gcash: MiscSaleRow[];
      bank: MiscSaleRow[];
    };
    expenses: ExpenseRow[];
    bankDeposits: DepositRow[];
    transfersIn: TransferRow[];
    transfersOut: TransferRow[];
  };
  charityDonations: CharityDonationRow[];
  totals: {
    cashSalesTotal: number;
    cashDepositsHeldTotal: number;
    totalCashIn: number;
    cardSalesTotal: number;
    gcashSalesTotal: number;
    bankTransferTotal: number;
    depositsHeldTotal: number;
    miscCashTotal: number;
    miscCardTotal: number;
    miscGcashTotal: number;
    miscBankTotal: number;
    miscSalesTotal: number;
    expenseTotal: number;
    depositTotal: number;
    interStoreIn: number;
    interStoreOut: number;
    charityDonationsTotal: number;
  };
  expectedCash: number;
  stores: StoreInfo[];
  otherStores: StoreInfo[];
  reconciliation: ReconciliationRecord | null;
  isLocked: boolean;
}

export interface StoreInfo {
  id: string;
  name: string;
  defaultFloatAmount: number;
}

export interface TransactionRow {
  id: string;
  paymentType: string;
  amount: number;
  methodId: string;
  settlementRef: string | null;
  settlementStatus: string | null;
  customerName: string | null;
  wooOrderId: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface DepositsHeldGroup {
  label: string;
  rows: TransactionRow[];
  total: number;
}

export interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number;
  paidFrom: string | null;
  paidFromName: string | null;
  employeeId: string | null;
  createdAt: string;
}

export interface DepositRow {
  id: string;
  amount: number;
  description: string | null;
  accountName: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface TransferRow {
  id: string;
  description: string | null;
  amount: number;
  referenceId: string | null;
  createdAt: string;
}

export interface ReconciliationRecord {
  id: string;
  isLocked: boolean;
  actualCounted: number;
  variance: number;
  varianceType: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
  overrideReason: string | null;
  tillCounted: number | null;
  depositsCounted: number | null;
  tillDenoms: Record<string, number> | null;
  depositDenoms: Record<string, number> | null;
  closingBalance: number | null;
}

export function useCashupSummary(storeId: string, date: string) {
  return useQuery<CashupSummary>({
    queryKey: ['cashup', 'summary', storeId, date],
    queryFn: () =>
      api.get<CashupSummary>(
        `/cashup/summary?storeId=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`,
      ),
    enabled: !!storeId && !!date,
  });
}

export function useReconcileCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/cashup/reconcile', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashup'] }),
  });
}

export function useOverrideCashup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/cashup/override', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashup'] }),
  });
}

export function useDepositFunds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      date: string;
      amount: number;
      cashAccountId: string;
      bankAccountId: string;
      notes?: string;
    }) => api.post('/cashup/deposit', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashup'] }),
  });
}

export interface LateReturnsCheck {
  hasLateReturns: boolean;
  count: number;
}

export interface LateReturnAssignment {
  id: number;
  store_id: string;
  date: string;
  employee_id: string;
  note: string | null;
}

export function useLateReturnsCheck(storeId: string, date: string) {
  return useQuery<LateReturnsCheck>({
    queryKey: ['cashup', 'late-returns-check', storeId, date],
    queryFn: () =>
      api.get(
        `/cashup/late-returns-check?storeId=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`,
      ),
    enabled: !!storeId && !!date,
  });
}

export function useLateReturnAssignment(storeId: string, date: string) {
  return useQuery<LateReturnAssignment | null>({
    queryKey: ['cashup', 'late-return-assignment', storeId, date],
    queryFn: () =>
      api.get(
        `/cashup/late-return-assignment?storeId=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`,
      ),
    enabled: !!storeId && !!date,
  });
}

export function useUpsertLateReturnAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeId: string; date: string; employeeId: string; note?: string }) =>
      api.post<LateReturnAssignment>('/cashup/late-return-assignment', body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ['cashup', 'late-return-assignment', vars.storeId, vars.date],
      });
    },
  });
}

export function useInterStoreTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      fromStoreId: string;
      toStoreId: string;
      amount: number;
      fromCashAccountId: string;
      toCashAccountId: string;
      transferType: 'consolidation' | 'float';
      date: string;
      notes?: string;
    }) => api.post('/cashup/inter-store-transfer', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashup'] }),
  });
}
