import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

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
