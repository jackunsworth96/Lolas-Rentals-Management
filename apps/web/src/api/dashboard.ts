import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { RawOrder } from './orders-raw.js';

export interface NinePmVehicle {
  orderId: string;
  vehicleModel: string;
  vehicleName: string;
  returnTime: string;
  customerName: string;
  customerMobile: string | null;
  helmetNumbers: string | null;
  balanceDue: number;
  securityDeposit: number;
}

export interface MaintenanceVehicle {
  id: string;
  name: string;
  status: string;
  daysDown: number;
}

export interface AddonRevenueRow {
  addonName: string;
  total: number;
}

export interface CashBalanceRow {
  accountId: string;
  accountName: string;
  balance: number;
}

export interface RevenueTrendRow {
  date: string;
  revenue: number;
}

export interface ExpensesByCategoryRow {
  category: string;
  total: number;
}

export interface StoreMetrics {
  activeRentals: number;
  availableVehicles: number;
  ninepmReturns: { count: number; vehicles: NinePmVehicle[] };
  depositsWithheld: number;
  depositsWithheldByMethod: {
    cash: number;
    gcash: number;
    bank?: number;
  };
  fleetUtilisation: number;
  maintenanceVehicles: MaintenanceVehicle[];
  maintenancePartsCost: number | null;
  maintenanceLabourCost: number | null;
  customerBreakdown: {
    byCountry: Array<{ country: string; count: number }>;
    byContinent: Array<{ continent: string; count: number }>;
  } | null;
  expensesByCategory: ExpensesByCategoryRow[] | null;
  expensesByCategoryLastMonth: ExpensesByCategoryRow[] | null;
  todayRevenue: number | null;
  miscSalesRevenue: number | null;
  addonRevenue: AddonRevenueRow[] | null;
  cashBalances: CashBalanceRow[] | null;
  revenueTrend: RevenueTrendRow[] | null;
  revenueThisMonth: RevenueTrendRow[] | null;
  tomorrowAvailable: number;
  bookingSourceSplit: {
    directWeb: number;
    walkIn: number;
    wooCommerce: number;
    total: number;
  } | null;
  deviceSplit: {
    mobile: number;
    desktop: number;
    total: number;
  } | null;
}

export interface DashboardSummary {
  date: string;
  stores: Record<string, StoreMetrics>;
  /** Quick stats — computed server-side with count-only queries */
  activeOrdersCount: number;
  revenueToday: number;
  cashupStatus: 'open' | 'closed' | null;
  pendingInboxCount: number;
  upcomingTransfersCount: number;
  overdueOrdersCount: number;
}

export function useDashboardSummary(storeId?: string) {
  const params = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', storeId],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary${params}`),
    staleTime: 60_000,
  });
}

export { useCharityImpact, type CharityImpact } from './impact.js';

export interface PeriodTotals {
  revenue: number;
  expenses: number;
  profit: number;
  bookings: number;
  avgBookingValue: number;
}

export interface DashboardInsights {
  today: string;
  rentableFleetSize: number;
  /** Money figures are null for users without can_view_dashboard. */
  mtd: (PeriodTotals & { dayOfMonth: number; lastMonth: PeriodTotals }) | null;
  monthly: Array<{ month: string; label: string; revenue: number; expenses: number; profit: number }> | null;
  dailyRevenue: Array<{ day: number; thisMonth: number | null; lastMonth: number | null }> | null;
  next7Days: Array<{ date: string; pickups: number; returns: number; onRent: number; bookedPct: number }>;
  weekdayDemand: Array<{ day: string; pickups: number; avgPerWeek: number }>;
}

export function useDashboardInsights(storeId?: string, enabled = true) {
  const params = storeId && storeId !== 'all' ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<DashboardInsights>({
    queryKey: ['dashboard', 'insights', storeId],
    queryFn: () => api.get<DashboardInsights>(`/dashboard/insights${params}`),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export interface TransportLeg {
  place: string | null;
}

export interface PickupMovement {
  key: string;
  /** 'raw' = still in the Inbox waiting to be activated; 'order' = already activated. */
  kind: 'raw' | 'order';
  id: string;
  storeId: string;
  reference: string | null;
  customerName: string;
  mobile: string | null;
  time: string;
  until: string | null;
  vehicles: string[];
  addons: string[];
  delivery: TransportLeg | null;
  collection: TransportLeg | null;
  transfer: string | null;
  notes: string | null;
  balanceDue: number | null;
  quote: number | null;
  waiverSigned: boolean | null;
  partnerRef: string | null;
  status: 'to_activate' | 'ready' | 'out';
  raw?: RawOrder;
}

export interface ReturnMovement {
  key: string;
  orderId: string;
  storeId: string;
  reference: string | null;
  customerName: string;
  mobile: string | null;
  time: string;
  vehicles: string[];
  helmetNumbers: string | null;
  collection: TransportLeg | null;
  ninePm: boolean;
  balanceDue: number;
  deposit: number;
  status: 'due' | 'overdue' | 'returned';
}

export interface TodayMovements {
  pickups: PickupMovement[];
  returns: ReturnMovement[];
}

export type MovementDay = 'today' | 'tomorrow';

export function useTodayMovements(storeId?: string, day: MovementDay = 'today', enabled = true) {
  const params = new URLSearchParams({ day });
  if (storeId && storeId !== 'all') params.set('storeId', storeId);
  return useQuery<TodayMovements>({
    queryKey: ['dashboard', 'today-movements', storeId, day],
    queryFn: () => api.get<TodayMovements>(`/dashboard/today-movements?${params}`),
    refetchInterval: 60_000,
    enabled,
  });
}

export interface OverdueReturn {
  orderId: string;
  storeId: string;
  reference: string | null;
  customerName: string;
  mobile: string | null;
  dueAt: string;
  vehicles: string[];
  balanceDue: number;
  deposit: number;
}

export function useOverdueReturns(storeId?: string, enabled = true) {
  const params = storeId && storeId !== 'all' ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<OverdueReturn[]>({
    queryKey: ['dashboard', 'overdue-returns', storeId],
    queryFn: () => api.get<OverdueReturn[]>(`/dashboard/overdue-returns${params}`),
    refetchInterval: 60_000,
    enabled,
  });
}

export interface RevenueTransaction {
  key: string;
  kind: 'payment' | 'misc_sale';
  time: string;
  amount: number;
  storeId: string;
  label: string;
  method: string | null;
  customerName: string | null;
  reference: string | null;
  orderId: string | null;
}

export interface RevenueTransactions {
  transactions: RevenueTransaction[];
  total: number;
}

export function useRevenueTransactions(storeId?: string, enabled = true) {
  const params = storeId && storeId !== 'all' ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<RevenueTransactions>({
    queryKey: ['dashboard', 'revenue-transactions', storeId],
    queryFn: () => api.get<RevenueTransactions>(`/dashboard/revenue-transactions${params}`),
    enabled,
  });
}

export interface CharityDonationRow {
  id: string;
  customerName: string | null;
  orderReference: string | null;
  charityDonation: number;
  createdAt: string;
}

export function useCharityDonations(enabled: boolean) {
  return useQuery<CharityDonationRow[]>({
    queryKey: ['dashboard', 'charity-donations'],
    queryFn: () => api.get<CharityDonationRow[]>('/dashboard/charity-donations'),
    staleTime: 2 * 60_000,
    enabled,
  });
}

export interface BasketAbandonmentSummary {
  total: number;
  basketViewed: number;
  renterStarted: number;
  converted: number;
  abandoned: number;
  conversionRate: number;
  avgClicksCompleted: number | null;
  avgClicksAbandoned: number | null;
}

export function useBasketAbandonmentSummary(storeId?: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (storeId && storeId !== 'all') params.set('storeId', storeId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return useQuery<BasketAbandonmentSummary>({
    queryKey: ['dashboard', 'basket-abandonment', storeId, from, to],
    queryFn: () => api.get<BasketAbandonmentSummary>(`/dashboard/basket-abandonment${qs}`),
    staleTime: 5 * 60_000,
  });
}

export interface ChatSessionsByDay {
  date: string;
  sessions: number;
}

export interface ChatPageOriginRow {
  page: string;
  count: number;
}

export interface ChatDeviceRow {
  device: string;
  count: number;
}

export interface ChatTopicRow {
  topic: string;
  count: number;
}

export interface ChatQuestionRow {
  question: string;
  count: number;
}

export interface ChatSummary {
  total: number;
  handoffs: number;
  handoffRate: number;
  avgMessages: number;
  sessionsByDay: ChatSessionsByDay[];
  byPageOrigin: ChatPageOriginRow[];
  byDevice: ChatDeviceRow[];
  topTopics: ChatTopicRow[];
  topQuestions: ChatQuestionRow[];
}

export interface PartnerSummaryRow {
  partnerId: string;
  partnerName: string;
  slug: string;
  totalBookings: number;
  commissionableBookings: number;
  commissionDue: number;
}

export interface PartnerDashboardSummary {
  totalAttributedBookings: number;
  totalCommission: number;
  byPartner: PartnerSummaryRow[];
}

export function usePartnerDashboardSummary(storeId?: string) {
  const params = storeId && storeId !== 'all' ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<PartnerDashboardSummary>({
    queryKey: ['dashboard', 'partner-summary', storeId],
    queryFn: () => api.get<PartnerDashboardSummary>(`/dashboard/partner-summary${params}`),
    staleTime: 5 * 60_000,
  });
}

export interface ReferralStatRow {
  source: string;
  label: string;
  count: number;
  percentage: number;
}

export interface AccommodationStatRow {
  name: string;
  count: number;
}

export interface ReferralStats {
  total: number;
  breakdown: ReferralStatRow[];
  accommodationBreakdown: AccommodationStatRow[];
  unmatchedRawNames: string[];
}

export function useReferralStats(storeId?: string) {
  const params = storeId && storeId !== 'all' ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<ReferralStats>({
    queryKey: ['dashboard', 'referral-stats', storeId],
    queryFn: () => api.get<ReferralStats>(`/dashboard/referral-stats${params}`),
    staleTime: 5 * 60_000,
  });
}

export interface AccommodationAlias {
  id: string;
  raw_name: string;
  canonical_name: string;
  created_at: string;
}

export function useAccommodationAliases() {
  return useQuery<AccommodationAlias[]>({
    queryKey: ['dashboard', 'accommodation-aliases'],
    queryFn: () => api.get<AccommodationAlias[]>('/dashboard/accommodation-aliases'),
    staleTime: 60_000,
  });
}

export function useUpsertAccommodationAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rawName, canonicalName }: { rawName: string; canonicalName: string }) =>
      api.post<AccommodationAlias>('/dashboard/accommodation-aliases', { rawName, canonicalName }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard', 'accommodation-aliases'] });
      void qc.invalidateQueries({ queryKey: ['dashboard', 'referral-stats'] });
    },
  });
}

export function useDeleteAccommodationAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/dashboard/accommodation-aliases/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard', 'accommodation-aliases'] });
      void qc.invalidateQueries({ queryKey: ['dashboard', 'referral-stats'] });
    },
  });
}

export function useChatSummary(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return useQuery<ChatSummary>({
    queryKey: ['dashboard', 'chat-summary', from, to],
    queryFn: () => api.get<ChatSummary>(`/dashboard/chat-summary${qs}`),
    staleTime: 5 * 60_000,
  });
}
