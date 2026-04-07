import { useQuery } from '@tanstack/react-query';
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

export interface CharityImpact {
  openingBalance: number;
  totalRaised: number;
  totalDonated: number;
  pendingPayout: number;
  bookingContributions: number;
  annualCap: number;
  annualDonated: number;
}

export function useCharityImpact() {
  return useQuery<CharityImpact>({
    queryKey: ['dashboard', 'charity-impact'],
    queryFn: () => api.get<CharityImpact>('/dashboard/charity-impact'),
    staleTime: 5 * 60_000,
  });
}
