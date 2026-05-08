import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

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
  /** ISO string when cash was physically collected; null if not yet collected. */
  collectedAt: string | null;
  /** Amount collected from the driver / customer. */
  collectedAmount: number | null;
  /** driver_cut from the matching transfer_routes row. */
  routeDriverCut: number | null;
  /** pricing_type from the matching transfer_routes row. */
  routePricingType: 'fixed' | 'per_head' | null;
  /** Scheduled pickup time in HH:MM format; null if not yet set. */
  pickupTime: string | null;
  /** End of pickup window for shared vans in HH:MM format; null for point-in-time transfers. */
  pickupTimeEnd: string | null;
  /** Whether the driver has tapped the Confirm button in Telegram. */
  driverConfirmed: boolean;
  /** ISO timestamp when the driver confirmed; null if not yet confirmed. */
  driverConfirmedAt: string | null;
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
  paymentStatus?: string;
  driverPaidStatus?: string;
}

export function useTransfers(storeId: string, filters: TransferFilters = {}) {
  const params = new URLSearchParams({ storeId });
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
  if (filters.driverPaidStatus) params.set('driverPaidStatus', filters.driverPaidStatus);
  return useQuery<TransferRow[]>({
    queryKey: ['transfers', storeId, filters],
    queryFn: () => api.get(`/transfers?${params}`),
    enabled: !!storeId,
  });
}

export function useTransfer(id: string) {
  return useQuery<TransferRow>({
    queryKey: ['transfers', id],
    queryFn: () => api.get(`/transfers/${id}`),
    enabled: !!id,
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

export interface TransferSummary {
  outstanding: { count: number; total: number };
  collected: { count: number; total: number; driverCut: number; netLolas: number };
}

export function useTransferSummary(
  storeId: string,
  filters: { dateFrom?: string; dateTo?: string } = {},
) {
  const params = new URLSearchParams({ storeId });
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return useQuery<TransferSummary>({
    queryKey: ['transfers-summary', storeId, filters],
    queryFn: () => api.get(`/transfers/summary?${params}`),
    enabled: !!storeId,
    throwOnError: false,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/transfers', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfers-summary'] });
    },
  });
}

export function useRecordTransferPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/transfers/payment', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['card-settlements'] });
    },
  });
}

export function useRecordDriverPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/transfers/driver-payment', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });
}

export interface BulkDriverPaymentVars {
  transferIds: string[];
  driverFees: Record<string, number>;
  driverExpenseAccountId: string;
  cashAccountId: string;
  date: string;
  storeId: string;
}

export function useBulkDriverPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: BulkDriverPaymentVars) =>
      api.post('/transfers/bulk-driver-payment', vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfers-summary'] });
    },
  });
}

export function notifyDriver(id: string): Promise<void> {
  return api.post(`/transfers/${id}/notify-driver`, {});
}

export interface MarkTransferCollectedVars {
  id: string;
  collectedAmount: number;
  paymentMethod: string;
  cashAccountId: string;
  transferIncomeAccountId: string;
  date: string;
}

export function markTransferCollected(vars: MarkTransferCollectedVars): Promise<TransferRow> {
  const { id, ...body } = vars;
  return api.patch(`/transfers/${id}/collect`, body);
}

export function updatePickupTime(id: string, pickupTime: string | null): Promise<TransferRow> {
  return api.patch(`/transfers/${id}/pickup-time`, { pickupTime });
}

export function updateAccommodation(id: string, accommodation: string | null): Promise<TransferRow> {
  return api.patch(`/transfers/${id}/accommodation`, { accommodation });
}

export async function cancelTransfer(id: string): Promise<void> {
  await api.delete(`/transfers/${id}`);
}

export function useMarkTransferCollected() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: MarkTransferCollectedVars) => markTransferCollected(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfers-summary'] });
      qc.invalidateQueries({ queryKey: ['card-settlements'] });
    },
  });
}
