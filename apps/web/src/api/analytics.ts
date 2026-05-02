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
  woocommerce: number;
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
}

export interface AnalyticsData {
  period: { days: number; from: string; to: string };
  fleet: {
    byModel: FleetModelMetrics[];
    overall: FleetOverallMetrics;
  };
  bookings: BookingMetrics;
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
