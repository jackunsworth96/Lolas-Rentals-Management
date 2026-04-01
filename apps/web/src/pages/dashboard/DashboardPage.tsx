import { useMemo } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import {
  useDashboardSummary,
  type StoreMetrics,
  type AddonRevenueRow,
  type CashBalanceRow,
  type RevenueTrendRow,
  type MaintenanceVehicle,
  type NinePmVehicle,
} from '../../api/dashboard.js';
import { useLostOpportunities, type LostOpportunityRow } from '../../api/lost-opportunity.js';
import { useStores } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{children}</h2>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const selectedStoreId = useUIStore((s) => s.selectedStoreId) ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;

  const storeIdForApi = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : undefined;
  const { data, isLoading, error } = useDashboardSummary(storeIdForApi);

  const today = todayStr();
  const lostOppStoreId = selectedStoreId || storeList[0]?.id || '';
  const { data: lostOpps = [] } = useLostOpportunities(lostOppStoreId, today) as {
    data: LostOpportunityRow[] | undefined;
  };
  const lostOpportunities = lostOpps ?? [];

  const canViewFinancial = hasPermission('can_view_dashboard');
  const canViewLostOpp = hasPermission('can_view_lostopportunity');

  const metrics: StoreMetrics | null = useMemo(() => {
    if (!data?.stores) return null;
    const key = storeIdForApi ?? 'combined';
    return data.stores[key] ?? Object.values(data.stores)[0] ?? null;
  }, [data, storeIdForApi]);

  const expenseCategoryData = useMemo(() => {
    if (!metrics) return [];
    const thisMonth = metrics.expensesByCategory ?? [];
    const last30 = metrics.expensesByCategoryLast30 ?? [];
    const categories = Array.from(
      new Set([...thisMonth.map((e) => e.category), ...last30.map((e) => e.category)]),
    );
    return categories
      .map((category) => ({
        category,
        thisMonth: thisMonth.find((e) => e.category === category)?.total ?? 0,
        last30: last30.find((e) => e.category === category)?.total ?? 0,
      }))
      .sort((a, b) => b.thisMonth - a.thisMonth);
  }, [metrics]);

  const revenueCategoryData = useMemo(() => {
    if (!metrics) return [];
    const thisMonth = metrics.revenueThisMonth ?? [];
    const last30 = metrics.revenueTrend ?? [];
    const dates = Array.from(
      new Set([...thisMonth.map((r) => r.date), ...last30.map((r) => r.date)]),
    ).sort();
    return dates.map((date) => ({
      date,
      thisMonth: thisMonth.find((r) => r.date === date)?.revenue ?? 0,
      last30: last30.find((r) => r.date === date)?.revenue ?? 0,
    }));
  }, [metrics]);

  if (isLoading) return <LoadingSkeleton />;
  if (error) {
    return (
      <div className="py-12 text-center text-red-600">
        Failed to load dashboard: {(error as Error).message}
      </div>
    );
  }
  if (!metrics) return <div className="py-12 text-center text-gray-500">No data available</div>;

  const storeName = storeIdForApi
    ? storeList.find((s) => s.id === storeIdForApi)?.name ?? storeIdForApi
    : 'All Stores';

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{storeName} &middot; {data?.date ?? today}</p>
        </div>
      </div>

      {/* SECTION 1 — Daily Pulse */}
      <section>
        <SectionHeading>Daily Pulse</SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Active Rentals" value={String(metrics.activeRentals)} />
          <StatCard label="Available Vehicles" value={String(metrics.availableVehicles)} />
          <StatCard label="Fleet Utilisation" value={`${metrics.fleetUtilisation}%`} />
          <StatCard label="Deposits Withheld" value={formatCurrency(metrics.depositsWithheld)} />
        </div>
      </section>

      {/* SECTION 2 — 9PM Returns */}
      <section>
        <SectionHeading>9PM Returns</SectionHeading>
        {metrics.ninepmReturns.count === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5 text-center text-sm text-gray-500">
            No late returns today 🎉
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Vehicle Model</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Return Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.ninepmReturns.vehicles.map((v: NinePmVehicle) => (
                  <tr key={v.orderId}>
                    <td className="px-4 py-2 text-gray-900">{v.vehicleModel}</td>
                    <td className="px-4 py-2 text-gray-600">{v.returnTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 3 — Fleet Health */}
      <section>
        <SectionHeading>Fleet Health</SectionHeading>
        {metrics.maintenanceVehicles.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5 text-center text-sm text-gray-500">
            All vehicles operational ✅
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Vehicle</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Days Down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.maintenanceVehicles.map((v: MaintenanceVehicle) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2 text-gray-900">{v.name}</td>
                    <td className="px-4 py-2 text-gray-600">{v.status}</td>
                    <td className="px-4 py-2 text-gray-600">{v.daysDown} {v.daysDown === 1 ? 'day' : 'days'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 4 — Financial Summary */}
      {canViewFinancial && metrics.todayRevenue !== null && (
        <section>
          <SectionHeading>Financial Summary</SectionHeading>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Today's Rental Revenue" value={formatCurrency(metrics.todayRevenue ?? 0)} />
            <StatCard label="Misc Sales Revenue" value={formatCurrency(metrics.miscSalesRevenue ?? 0)} />
            <StatCard
              label="Combined Today's Total"
              value={formatCurrency((metrics.todayRevenue ?? 0) + (metrics.miscSalesRevenue ?? 0))}
            />
            <StatCard
              label="Revenue This Month"
              value={formatCurrency(
                (metrics.revenueTrend ?? [])
                  .filter((r: RevenueTrendRow) => r.date.startsWith(today.slice(0, 7)))
                  .reduce((sum: number, r: RevenueTrendRow) => sum + r.revenue, 0),
              )}
            />
            <StatCard
              label="Parts Cost (This Month)"
              value={formatCurrency(metrics.maintenancePartsCost ?? 0)}
            />
            <StatCard
              label="Labour Cost (This Month)"
              value={formatCurrency(metrics.maintenanceLabourCost ?? 0)}
            />
          </div>
          {(() => {
            const maintenanceTotal =
              (metrics.maintenancePartsCost ?? 0) + (metrics.maintenanceLabourCost ?? 0);
            if (maintenanceTotal <= 0) return null;
            const partsPercent = Math.round(
              ((metrics.maintenancePartsCost ?? 0) / maintenanceTotal) * 100,
            );
            const labourPercent = 100 - partsPercent;
            return (
              <p className="mt-2 text-xs text-gray-400">
                Maintenance split: {partsPercent}% parts / {labourPercent}% labour
              </p>
            );
          })()}
        </section>
      )}

      {/* SECTION 5 — Addon Revenue Breakdown */}
      {canViewFinancial && metrics.addonRevenue !== null && (
        <section>
          <SectionHeading>Addon Revenue Breakdown</SectionHeading>
          {(metrics.addonRevenue ?? []).length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-5 text-center text-sm text-gray-500">
              No addon revenue recorded today
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Addon Name</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Today&apos;s Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(metrics.addonRevenue ?? []).map((a: AddonRevenueRow) => (
                    <tr key={a.addonName}>
                      <td className="px-4 py-2 text-gray-900">{a.addonName}</td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SECTION 6 — Cash Balances */}
      {canViewFinancial && metrics.cashBalances !== null && (
        <section>
          <SectionHeading>Cash Balances</SectionHeading>
          {(metrics.cashBalances ?? []).length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-5 text-center text-sm text-gray-500">
              No cash account data available
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {(metrics.cashBalances ?? []).map((a: CashBalanceRow) => (
                <StatCard key={a.accountId} label={a.accountName} value={formatCurrency(a.balance)} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 7 — Revenue Trend */}
      {canViewFinancial && (metrics.revenueThisMonth !== null || metrics.revenueTrend !== null) && (
        <section>
          <SectionHeading>Revenue Trend — This Month vs Last 30 Days</SectionHeading>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Revenue Trend — This Month vs Last 30 Days
            </h3>
            {revenueCategoryData.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                No revenue recorded for this period
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={revenueCategoryData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `₱${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'thisMonth' ? 'This Month' : 'Last 30 Days',
                    ]}
                  />
                  <Legend
                    formatter={(value) =>
                      value === 'thisMonth' ? 'This Month' : 'Last 30 Days'
                    }
                  />
                  <Bar dataKey="thisMonth" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="last30" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      )}

      {/* SECTION 9 — Expenses by Category */}
      {canViewFinancial && (metrics.expensesByCategory !== null || metrics.expensesByCategoryLast30 !== null) && (
        <section>
          <SectionHeading>Expenses by Category</SectionHeading>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Expenses by Category — This Month vs Last 30 Days
            </h3>
            {expenseCategoryData.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                No expenses recorded for this period
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={expenseCategoryData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `₱${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'thisMonth' ? 'This Month' : 'Last 30 Days',
                    ]}
                  />
                  <Legend
                    formatter={(value) =>
                      value === 'thisMonth' ? 'This Month' : 'Last 30 Days'
                    }
                  />
                  <Bar dataKey="thisMonth" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="last30" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      )}

      {/* SECTION 8 — Lost Opportunities */}
      {canViewLostOpp && (
        <section>
          <SectionHeading>Lost Opportunities Today</SectionHeading>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              label="Missed Inquiries"
              value={String(lostOpportunities.length)}
            />
            <StatCard
              label="Estimated Lost Value"
              value={formatCurrency(
                lostOpportunities.reduce((sum: number, o: LostOpportunityRow) => sum + (o.estValue ?? 0), 0),
              )}
            />
          </div>
        </section>
      )}
    </div>
  );
}
