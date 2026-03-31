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
          </div>
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
      {canViewFinancial && metrics.revenueTrend !== null && (metrics.revenueTrend ?? []).length > 0 && (
        <section>
          <SectionHeading>Revenue Trend (Last 30 Days)</SectionHeading>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={metrics.revenueTrend ?? []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `₱${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  labelFormatter={(label: string) => `Date: ${label}`}
                />
                <Bar dataKey="revenue" fill="#2563eb" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
