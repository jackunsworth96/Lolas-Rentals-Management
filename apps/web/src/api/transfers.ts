import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type TransferCollector = 'lolas' | 'driver';

export interface TransferRow {
  id: string;
  orderId: string | null;
  serviceDate: string;
  customerName: string;
  contactNumber: string | null;
  customerEmail: string | null;
  customerType: 'Walk-in' | 'Online' | null;
  route: string;
  flightTime: string | null;
  flightNumber: string | null;
  paxCount: number;
  vanType: string | null;
  accommodation: string | null;
  status: string;
  opsNotes: string | null;
  totalPrice: { amount: number };
  paymentMethod: string | null;
  paymentStatus: 'Pending' | 'Partially Paid' | 'Paid';
  driverFee: { amount: number } | null;
  netProfit: { amount: number } | null;
  driverPaidStatus: string | null;
  bookingSource: string | null;
  bookingToken: string | null;
  storeId: string;
  createdAt: string;
  updatedAt: string;
  collectedAt: string | null;
  collectedAmount: number | null;
  /** driver_cut from the matching transfer_routes row (fallback for rows without a snapshot). */
  routeDriverCut: number | null;
  routePricingType: 'fixed' | 'per_head' | null;
  /** Scheduled pickup time; Postgres may return HH:MM:SS. */
  pickupTime: string | null;
  pickupTimeEnd: string | null;
  driverConfirmed: boolean;
  driverConfirmedAt: string | null;
  /** Expected collector, chosen at booking. */
  collectVia: TransferCollector;
  /** Who took the most recent payment. */
  collectedBy: TransferCollector | null;
  amountPaid: number;
  /** Portion of amountPaid the driver is holding until settlement. */
  driverCollectedAmount: number;
  /** Driver cut snapshotted when the transfer was created. */
  driverCut: number | null;
  /** Fare is part of the linked rental order's balance. */
  billedToOrder: boolean;
  driverSettledAt: string | null;
  driverSettlementId: string | null;
}

export function moneyAmount(val: { amount: number } | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  return val.amount ?? 0;
}

/** Normalise any stored vanType variant to a user-friendly display label. */
export function formatVanType(v: string | null | undefined): string {
  switch ((v ?? '').toLowerCase().replace(/[\s_-]+/g, '')) {
    case 'sharedvan':
    case 'shared':
      return 'Shared Van';
    case 'privatevan':
    case 'private':
      return 'Private Van';
    case 'tuktuk':
    case 'privatetuktuk':
      return 'TukTuk';
    default:
      return v ?? '—';
  }
}

export interface TransferFilters {
  dateFrom?: string;
  dateTo?: string;
  scope?: 'open' | 'closed';
}

export function useTransfers(storeId: string, filters: TransferFilters = {}, enabled = true) {
  const params = new URLSearchParams({ storeId });
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.scope) params.set('scope', filters.scope);
  return useQuery<TransferRow[]>({
    queryKey: ['transfers', storeId, filters],
    queryFn: () => api.get(`/transfers?${params}`),
    enabled: !!storeId && enabled,
  });
}

/** Fetch the (single) transfer linked to an order by order_id. Returns null if none. */
export async function fetchTransferByOrderId(orderId: string): Promise<TransferRow | null> {
  const params = new URLSearchParams({ orderId });
  const rows = await api.get<TransferRow[]>(`/transfers?${params}`);
  return rows[0] ?? null;
}

export function useTransferByOrderId(orderId: string) {
  return useQuery<TransferRow | null>({
    queryKey: ['transfers', 'by-order', orderId],
    queryFn: () => fetchTransferByOrderId(orderId),
    enabled: !!orderId,
  });
}

function useInvalidateTransfers() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['transfers'] });
    void qc.invalidateQueries({ queryKey: ['transfers-summary'] });
  };
}

export function useCreateTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<TransferRow>('/transfers', body),
    onSuccess: invalidate,
  });
}

export interface ReceiveTransferPaymentVars {
  transferId: string;
  amount: number;
  collector: TransferCollector;
  paymentMethod: string | null;
  cashAccountId: string | null;
  isCardPayment?: boolean;
  date: string;
}

export function useReceiveTransferPayment() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (vars: ReceiveTransferPaymentVars) => api.post<TransferRow>('/transfers/payment', vars),
    onSuccess: () => {
      invalidate();
      // Fares billed to a rental order are paid on the order.
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['card-settlements'] });
    },
  });
}

export interface SettleDriverVars {
  storeId: string;
  transferIds: string[];
  date: string;
  cashAccountId: string | null;
  driverExpenseAccountId: string | null;
  postJournal: boolean;
}

export interface SettleDriverResult {
  settlementId: string;
  count: number;
  lolasOwesDriver: number;
  driverOwesLolas: number;
  net: number;
}

export function useSettleDriver() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (vars: SettleDriverVars) => api.post<SettleDriverResult>('/transfers/settle', vars),
    onSuccess: invalidate,
  });
}

export function notifyDriver(id: string): Promise<void> {
  return api.post(`/transfers/${id}/notify-driver`, {});
}

export function updatePickupTime(id: string, pickupTime: string | null): Promise<TransferRow> {
  return api.patch(`/transfers/${id}/pickup-time`, { pickupTime });
}

export function updateAccommodation(id: string, accommodation: string | null): Promise<TransferRow> {
  return api.patch(`/transfers/${id}/accommodation`, { accommodation });
}

export function updateCollectVia(id: string, collectVia: TransferCollector): Promise<TransferRow> {
  return api.patch(`/transfers/${id}/collect-via`, { collectVia });
}

export async function cancelTransfer(id: string): Promise<void> {
  await api.delete(`/transfers/${id}`);
}
