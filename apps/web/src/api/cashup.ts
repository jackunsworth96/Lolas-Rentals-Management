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

export interface DiscountRow {
  id: string;
  vehicleName: string | null;
  amount: number;
  orderId: string;
  orderRef: string | null;
  customerName: string | null;
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
  bookingToken: string | null;
  orderId: string | null;
  createdAt: string;
}

export type RefundRow = TransactionRow;

export type MethodCategory = 'cash' | 'card' | 'gcash' | 'bank';

export interface DepositReturnRow {
  id: string;
  amount: number;
  description: string | null;
  methodId: string;
  methodCategory: MethodCategory;
  affectsEnvelope: boolean;
  /** Part of a cash return paid from the till because the deposit was not collected in cash. */
  tillAmount: number;
  collectedMethodId: string | null;
  referenceId: string | null;
  orderId: string | null;
  bookingToken: string | null;
  customerName: string | null;
  createdAt: string;
}

export interface CrossMethodDepositRow {
  id: string;
  /** `till_payout`: cash came from the till. `envelope_to_till`: move envelope cash into the till. */
  action: 'till_payout' | 'envelope_to_till';
  amount: number;
  description: string | null;
  collectedMethodId: string | null;
  orderId: string | null;
  bookingToken: string | null;
  customerName: string | null;
  createdAt: string | null;
}

export interface DepositAppliedRow {
  id: string;
  amount: number;
  description: string | null;
  referenceId: string | null;
  bookingToken: string | null;
  customerName: string | null;
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
  isCash: boolean;
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

export type CashPot = 'till' | 'envelope';

export interface CashLedgerItem {
  id: string;
  kind: string;
  pot: CashPot;
  amount: number;
  label: string;
  bookingToken: string | null;
  customerName: string | null;
  date: string | null;
  createdAt: string | null;
}

export interface ExpectedLine {
  key: string;
  label: string;
  amount: number;
  count?: number;
  note?: string;
}

export interface ExpectedBreakdown {
  opening: number;
  lines: ExpectedLine[];
  total: number;
}

export interface CarryGroup {
  label: string;
  fromDate: string;
  toDate: string;
  tillNet: number;
  envelopeNet: number;
  items: CashLedgerItem[];
}

export interface StoreInfo {
  id: string;
  name: string;
  defaultFloatAmount: number;
}

export interface ReconciliationRecord {
  id: string;
  isLocked: boolean;
  openingBalance: number;
  actualCounted: number;
  variance: number;
  varianceType: string | null;
  varianceNote: string | null;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  overriddenBy: string | null;
  overriddenByName: string | null;
  overriddenAt: string | null;
  overrideReason: string | null;
  tillCounted: number | null;
  depositsCounted: number | null;
  tillExpected: number | null;
  depositsExpected: number | null;
  tillVariance: number | null;
  depositVariance: number | null;
  tillDenoms: Record<string, number> | null;
  depositDenoms: Record<string, number> | null;
  closingBalance: number | null;
  depositsClosingBalance: number | null;
}

export interface CashupSummary {
  date: string;
  today: string;
  isFuture: boolean;
  openingFloat: {
    amount: number;
    source: 'previous_day' | 'override' | 'none';
    previousDate: string | null;
  };
  openingEnvelopeBalance: number;
  missingDays: string[];
  gapTooLong: boolean;
  carry: CarryGroup[];
  expected: { till: ExpectedBreakdown; envelope: ExpectedBreakdown };
  expectedCash: number;
  postedAfterLock: CarryGroup | null;
  laterLockedDate: string | null;
  cashLedger: CashLedgerItem[];
  transactions: {
    cashSales: TransactionRow[];
    cardSales: TransactionRow[];
    gcashSales: TransactionRow[];
    bankTransfer: TransactionRow[];
    pendingExtensions: TransactionRow[];
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
    discounts: DiscountRow[];
    refunds: RefundRow[];
    depositReturns: DepositReturnRow[];
    depositApplied: DepositAppliedRow[];
    crossMethodDepositReturns: CrossMethodDepositRow[];
  };
  charityDonations: CharityDonationRow[];
  totals: {
    cashSalesTotal: number;
    cashDepositsHeldTotal: number;
    cardSalesTotal: number;
    gcashSalesTotal: number;
    bankTransferTotal: number;
    pendingExtensionsTotal: number;
    depositsHeldTotal: number;
    miscCashTotal: number;
    miscCardTotal: number;
    miscGcashTotal: number;
    miscBankTotal: number;
    miscSalesTotal: number;
    expenseTotal: number;
    cashExpenseTotal: number;
    depositTotal: number;
    interStoreIn: number;
    interStoreOut: number;
    charityDonationsTotal: number;
    discountsTotal: number;
    cashRefundTotal: number;
    cardRefundTotal: number;
    gcashRefundTotal: number;
    bankRefundTotal: number;
    refundTotal: number;
    depositReturnTotal: number;
    cashDepositReturnTotal: number;
    nonCashDepositReturnTotal: number;
    depositAppliedTotal: number;
    carryDepositsCashTotal: number;
    crossMethodTillPayoutTotal: number;
    crossMethodEnvelopeToTillTotal: number;
  };
  stores: StoreInfo[];
  otherStores: StoreInfo[];
  reconciliation: ReconciliationRecord | null;
  isLocked: boolean;
}

export interface CashupHistoryDay {
  date: string;
  status: 'locked' | 'open' | 'missing';
  tillVariance: number | null;
  depositVariance: number | null;
  varianceNote: string | null;
  submittedBy: string | null;
  submittedByName: string | null;
  reopened: boolean;
  overrideReason: string | null;
}

export interface DepositRegisterEntry {
  paymentId: string;
  orderId: string;
  bookingToken: string | null;
  customerName: string | null;
  amount: number;
  collectedOn: string | null;
  returnDue: string | null;
}

export interface OrderLookupResult {
  orderId: string;
  bookingToken: string | null;
  customerName: string | null;
  status: string;
  orderDate: string | null;
  settledAt: string | null;
  entries: Array<{
    orderId: string;
    kind: string;
    method: string;
    amount: number;
    date: string | null;
    createdAt: string | null;
    cashupStatus: 'locked' | 'open' | 'not cashed up';
    postedAfterLock: boolean;
  }>;
}

export interface ReconcileCashBody {
  storeId: string;
  date: string;
  tillDenoms: Record<string, number>;
  depositDenoms: Record<string, number>;
  varianceNote?: string | null;
  cashDrop?: { amount: number; cashAccountId: string; bankAccountId: string } | null;
}

const enc = encodeURIComponent;

export function useCashupSummary(storeId: string, date: string) {
  return useQuery<CashupSummary>({
    queryKey: ['cashup', 'summary', storeId, date],
    queryFn: () => api.get<CashupSummary>(`/cashup/summary?storeId=${enc(storeId)}&date=${enc(date)}`),
    enabled: !!storeId && !!date,
  });
}

export function useCashupHistory(storeId: string, days = 14) {
  return useQuery<CashupHistoryDay[]>({
    queryKey: ['cashup', 'history', storeId, days],
    queryFn: () => api.get<CashupHistoryDay[]>(`/cashup/history?storeId=${enc(storeId)}&days=${days}`),
    enabled: !!storeId,
  });
}

export function useDepositRegister(storeId: string, enabled = true) {
  return useQuery<{
    entries: DepositRegisterEntry[];
    total: number;
    held: { cash: number; gcash: number; bank: number };
  }>({
    queryKey: ['cashup', 'deposit-register', storeId],
    queryFn: () => api.get(`/cashup/deposit-register?storeId=${enc(storeId)}`),
    enabled: !!storeId && enabled,
  });
}

export function useOrderLookup(storeId: string, q: string) {
  const term = q.trim();
  return useQuery<OrderLookupResult[]>({
    queryKey: ['cashup', 'order-lookup', storeId, term],
    queryFn: () => api.get(`/cashup/order-lookup?storeId=${enc(storeId)}&q=${enc(term)}`),
    enabled: !!storeId && term.length >= 3,
    staleTime: 30_000,
  });
}

export function useReconcileCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReconcileCashBody) => api.post('/cashup/reconcile', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashup'] }),
  });
}

export function useReopenCashup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeId: string; date: string; reason: string }) => api.post('/cashup/reopen', body),
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
    queryFn: () => api.get(`/cashup/late-returns-check?storeId=${enc(storeId)}&date=${enc(date)}`),
    enabled: !!storeId && !!date,
  });
}

export function useLateReturnAssignment(storeId: string, date: string) {
  return useQuery<LateReturnAssignment | null>({
    queryKey: ['cashup', 'late-return-assignment', storeId, date],
    queryFn: () => api.get(`/cashup/late-return-assignment?storeId=${enc(storeId)}&date=${enc(date)}`),
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
