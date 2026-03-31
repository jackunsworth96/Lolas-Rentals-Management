import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';

export interface NinePmVehicle {
  orderId: string;
  vehicleModel: string;
  returnTime: string;
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

export interface StoreMetrics {
  activeRentals: number;
  availableVehicles: number;
  ninepmReturns: { count: number; vehicles: NinePmVehicle[] };
  depositsWithheld: number;
  fleetUtilisation: number;
  maintenanceVehicles: MaintenanceVehicle[];
  todayRevenue: number | null;
  miscSalesRevenue: number | null;
  addonRevenue: AddonRevenueRow[] | null;
  cashBalances: CashBalanceRow[] | null;
  revenueTrend: RevenueTrendRow[] | null;
}

export interface DashboardSummary {
  date: string;
  stores: Record<string, StoreMetrics>;
}

export function useDashboardSummary(storeId?: string) {
  const params = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', storeId],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary${params}`),
    staleTime: 60_000,
  });
}
