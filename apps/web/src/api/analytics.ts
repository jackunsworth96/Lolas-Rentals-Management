import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';

export interface FleetModelMetrics {
  modelId: string;
  modelName: string;
  currentFleetSize: number;
  rentalDaysUsed: number;
  availableFleetDays: number;
  utilisationRate: number;
  recommendedFleetSize: number;
  fleetDelta: number;
  avgRentalDuration: number;
  revPAB: number;
  extensionRate: number;
  totalRentals: number;
}

export interface FleetOverallMetrics {
  utilisationRate: number;
  revPAB: number;
  extensionRate: number;
  cancellationRate: number;
  totalRentals: number;
}

export interface ChannelSplit {
  walk_in: number;
  direct: number;
  [key: string]: number;
}

export interface LeadTimeBuckets {
  same_day: number;
  one_to_three: number;
  four_to_seven: number;
  seven_plus: number;
}

export interface BookingMetrics {
  channelSplit: ChannelSplit;
  leadTimeBuckets: LeadTimeBuckets;
  addonAttachRate: number;
  repeatCustomerRate: number;
  totalUniqueCustomers: number;
  returningCustomers: number;
  /** Self-reported walk-in share from signed waivers (referral_source). More
   * reliable than booking_channel, which almost never gets tagged 'walk_in'. */
  walkInShare: number;
  walkInResponses: number;
}

export interface AffiliatePartnerMetrics {
  partnerId: string;
  partnerName: string;
  slug: string;
  bookings: number;
  /** null when `bookings` is below the minimum volume threshold — show raw
   * day counts instead of a false-precision daily average. */
  scooterAvgPerDay: number | null;
  tuktukAvgPerDay: number | null;
  scooterDays: number;
  tuktukDays: number;
}

export interface AffiliateMetrics {
  totalBookings: number;
  attributedBookings: number;
  attributedSharePct: number;
  minBookingsForDailyAvg: number;
  byPartner: AffiliatePartnerMetrics[];
}

export interface AnalyticsData {
  period: { days: number; from: string; to: string };
  fleet: {
    byModel: FleetModelMetrics[];
    overall: FleetOverallMetrics;
  };
  bookings: BookingMetrics;
  affiliates: AffiliateMetrics;
}

export function useAnalytics(storeId?: string, days = 30) {
  const params = new URLSearchParams();
  if (storeId && storeId !== 'all') params.set('storeId', storeId);
  params.set('days', String(days));

  return useQuery<AnalyticsData>({
    queryKey: ['analytics', storeId, days],
    queryFn: () => api.get<AnalyticsData>(`/analytics?${params.toString()}`),
    staleTime: 5 * 60_000,
  });
}

// ── Quarterly fleet-sizing forecast ─────────────────────────────────────────

export interface QuarterFleetRange {
  low: number;
  mid: number;
  high: number;
}

export interface QuarterModelMetrics {
  modelId: string;
  modelName: string;
  currentFleetSize: number;
  rentalDaysUsed: number;
  elapsedDays: number;
  utilisationRate: number;
  perDay: number;
  recommendedFleetRange: QuarterFleetRange;
}

export interface QuarterSummary {
  label: string;
  start: string;
  end: string;
  isCurrentQuarter: boolean;
  elapsedDays: number;
  byModel: QuarterModelMetrics[];
}

export interface QuarterProjectionModelMetrics {
  modelId: string;
  modelName: string;
  currentFleetSize: number;
  projectedPerDay: number;
  projectedRentalDays: number;
  recommendedFleetRange: QuarterFleetRange;
}

export interface FleetForecastData {
  fleetSizeBasis: 'current';
  target: { low: number; mid: number; high: number };
  quarters: QuarterSummary[];
  projection: {
    label: string;
    confidence: 'low' | 'medium';
    basedOnQuarters: string[];
    byModel: QuarterProjectionModelMetrics[];
  } | null;
}

export function useFleetForecast(storeId?: string) {
  const params = new URLSearchParams();
  if (storeId && storeId !== 'all') params.set('storeId', storeId);

  return useQuery<FleetForecastData>({
    queryKey: ['analytics-fleet-forecast', storeId],
    queryFn: () => api.get<FleetForecastData>(`/analytics/fleet-forecast?${params.toString()}`),
    staleTime: 15 * 60_000,
  });
}

// ── Quarterly customer confidence (issue-free rate) ─────────────────────────

export interface ConfidenceIssueTypeSplit {
  flat_tyre: number;
  flat_battery: number;
  engine_mechanical: number;
  electrical: number;
  other: number;
}

export interface ConfidenceQuarter {
  label: string;
  start: string;
  end: string;
  isCurrentQuarter: boolean;
  totalCustomers: number;
  accidentCount: number;
  breakdownCount: number;
  affectedCustomers: number;
  issueFreeRate: number;
  issueTypeSplit: ConfidenceIssueTypeSplit;
  avgResolutionMinutes: number | null;
  pctResolvedWithin30Min: number | null;
  resolvedBreakdowns: number;
}

export interface ConfidenceReportData {
  quarters: ConfidenceQuarter[];
}

export function useConfidenceReport(storeId?: string) {
  const params = new URLSearchParams();
  if (storeId && storeId !== 'all') params.set('storeId', storeId);

  return useQuery<ConfidenceReportData>({
    queryKey: ['analytics-confidence', storeId],
    queryFn: () => api.get<ConfidenceReportData>(`/analytics/confidence-report?${params.toString()}`),
    staleTime: 15 * 60_000,
  });
}
