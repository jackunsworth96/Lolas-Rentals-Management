import { useMemo, useState } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import {
  useDashboardSummary,
  useCharityImpact,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const PIE_COLORS = [
  '#00577C', '#FCBC5A', '#363737', '#4CAF50', '#E91E63',
  '#9C27B0', '#FF5722', '#2196F3', '#009688', '#FF9800',
];

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

function DetailItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="font-lato text-xs font-medium uppercase tracking-wide text-gray-500 mb-0.5">{label}</p>
      <p className={`font-lato text-sm font-semibold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
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

  const { data: charityImpact } = useCharityImpact();

  const [selectedReturn, setSelectedReturn] = useState<NinePmVehicle | null>(null);

  const metrics: StoreMetrics | null = useMemo(() => {
    if (!data?.stores) return null;
    const key = storeIdForApi ?? 'combined';
    return data.stores[key] ?? Object.values(data.stores)[0] ?? null;
  }, [data, storeIdForApi]);

  const expenseCategoryData = useMemo(() => {
    if (!metrics) return [];
    const thisMonth = metrics.expensesByCategory ?? [];
    const lastMonth = metrics.expensesByCategoryLastMonth ?? [];
    const categories = Array.from(
      new Set([...thisMonth.map((e) => e.category), ...lastMonth.map((e) => e.category)]),
    );
    const merged = categories.map((category) => ({
      category,
      thisMonth: thisMonth.find((e) => e.category === category)?.total ?? 0,
      lastMonth: lastMonth.find((e) => e.category === category)?.total ?? 0,
    }));

    // Consolidate maintenance categories
    const consolidated = new Map<string, { thisMonth: number; lastMonth: number }>();
    for (const item of merged) {
      const key = item.category.toLowerCase().startsWith('maintenance')
        ? 'Maintenance (Total)'
        : item.category;
      const existing = consolidated.get(key) ?? { thisMonth: 0, lastMonth: 0 };
      consolidated.set(key, {
        thisMonth: existing.thisMonth + item.thisMonth,
        lastMonth: existing.lastMonth + item.lastMonth,
      });
    }
    return Array.from(consolidated.entries())
      .map(([category, values]) => ({ category, ...values }))
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
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Vehicle Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Return Time</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Customer</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.ninepmReturns.vehicles.map((v: NinePmVehicle) => (
                  <tr
                    key={v.orderId}
                    onClick={() => setSelectedReturn(selectedReturn?.orderId === v.orderId ? null : v)}
                    className="cursor-pointer hover:bg-blue-50"
                  >
                    <td className="px-4 py-2 text-gray-900">{v.vehicleModel}</td>
                    <td className="px-4 py-2 text-gray-600">{v.vehicleName}</td>
                    <td className="px-4 py-2 text-gray-600">{v.returnTime}</td>
                    <td className="px-4 py-2 text-gray-900">{v.customerName}</td>
                    <td className={`px-4 py-2 text-right font-medium ${v.balanceDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {formatCurrency(v.balanceDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedReturn && (
          <div className="mt-4 rounded-lg border border-teal-brand/20 bg-cream-brand p-5 relative">
            <button
              onClick={() => setSelectedReturn(null)}
              className="absolute right-3 top-3 font-lato text-lg font-bold text-charcoal-brand/40 hover:text-charcoal-brand"
            >
              ✕
            </button>
            <h3 className="font-headline text-lg text-teal-brand mb-4">
              {selectedReturn.vehicleName} — {selectedReturn.returnTime}
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <DetailItem label="Customer" value={selectedReturn.customerName} />
              <DetailItem label="Mobile" value={selectedReturn.customerMobile ?? '—'} />
              <DetailItem label="Vehicle Model" value={selectedReturn.vehicleModel} />
              <DetailItem label="Helmet Numbers" value={selectedReturn.helmetNumbers ?? 'Not recorded'} />
              <DetailItem
                label="Balance Due"
                value={formatCurrency(selectedReturn.balanceDue)}
                highlight={selectedReturn.balanceDue > 0}
              />
              <DetailItem label="Security Deposit" value={formatCurrency(selectedReturn.securityDeposit)} />
            </div>
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
      {metrics.cashBalances !== null && metrics.cashBalances.length > 0 && (
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
              <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
                  Deposits Held
                </p>
                <p className="text-2xl font-bold text-amber-700">
                  {formatCurrency(metrics.depositsWithheld ?? 0)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Security deposits on active rentals
                </p>
              </div>
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
                  margin={{ top: 5, right: 20, left: 10, bottom: 80 }}
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
                    wrapperStyle={{ paddingTop: '20px' }}
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
      {canViewFinancial && (metrics.expensesByCategory !== null || metrics.expensesByCategoryLastMonth !== null) && (
        <section>
          <SectionHeading>Expenses by Category</SectionHeading>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Expenses by Category — This Month vs Last Month
            </h3>
            {expenseCategoryData.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                No expenses recorded for this period
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={expenseCategoryData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 80 }}
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
                      name === 'thisMonth' ? 'This Month' : 'Last Month',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value) =>
                      value === 'thisMonth' ? 'This Month' : 'Last Month'
                    }
                  />
                  <Bar dataKey="thisMonth" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lastMonth" fill="#fb923c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      )}

      {/* SECTION 10 — Customer Breakdown */}
      {canViewFinancial && metrics.customerBreakdown !== null && (
        <section>
          <SectionHeading>Customer Breakdown</SectionHeading>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

            {/* By Country */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                By Country
              </h3>
              {(metrics.customerBreakdown?.byCountry ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No customer data</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.customerBreakdown?.byCountry ?? []}
                      dataKey="count"
                      nameKey="country"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ country, percent }: { country: string; percent: number }) =>
                        `${country} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {(metrics.customerBreakdown?.byCountry ?? []).map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} customers`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* By Continent */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                By Continent
              </h3>
              {(metrics.customerBreakdown?.byContinent ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No customer data</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.customerBreakdown?.byContinent ?? []}
                      dataKey="count"
                      nameKey="continent"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ continent, percent }: { continent: string; percent: number }) =>
                        `${continent} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {(metrics.customerBreakdown?.byContinent ?? []).map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} customers`, name]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

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

      {/* SECTION — BePawsitive Impact */}
      {charityImpact && (
        <section>
          <SectionHeading>🐾 BePawsitive Impact</SectionHeading>
          <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Total raised */}
              <div className="rounded-xl border border-teal-100 bg-teal-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-600">
                  Total Raised for BePawsitive
                </p>
                <p className="text-2xl font-bold" style={{ color: '#00577C' }}>
                  {formatCurrency(charityImpact.totalRaised)}
                </p>
                <p className="mt-1 text-xs text-teal-500">Since Oct 2022</p>
              </div>

              {/* From bookings */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  From Customer Bookings
                </p>
                <p className="text-2xl font-bold text-gray-800">
                  {formatCurrency(charityImpact.bookingContributions)}
                </p>
                <p className="mt-1 text-xs text-gray-400">Booking charity donations</p>
              </div>

              {/* Pending payout */}
              <div
                className={`rounded-xl border p-4 ${
                  charityImpact.pendingPayout > 0
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-green-100 bg-green-50'
                }`}
              >
                <p
                  className={`mb-1 text-xs font-semibold uppercase tracking-wide ${
                    charityImpact.pendingPayout > 0 ? 'text-amber-600' : 'text-green-600'
                  }`}
                >
                  Pending Payout
                </p>
                <p
                  className={`text-2xl font-bold ${
                    charityImpact.pendingPayout > 0 ? 'text-amber-700' : 'text-green-700'
                  }`}
                >
                  {formatCurrency(charityImpact.pendingPayout)}
                </p>
                <p
                  className={`mt-1 text-xs ${
                    charityImpact.pendingPayout > 0 ? 'text-amber-500' : 'text-green-500'
                  }`}
                >
                  {charityImpact.pendingPayout > 0 ? 'Awaiting transfer to BePawsitive' : 'All paid ✓'}
                </p>
              </div>
            </div>

            {/* Annual donation progress bar */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span className="font-medium">Annual Donation Progress</span>
                <span>
                  {formatCurrency(Math.min(charityImpact.annualDonated, charityImpact.annualCap))} of{' '}
                  {formatCurrency(charityImpact.annualCap)} annual cap
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (charityImpact.annualDonated / charityImpact.annualCap) * 100)}%`,
                    backgroundColor: '#00577C',
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                {((charityImpact.annualDonated / charityImpact.annualCap) * 100).toFixed(1)}% of ₱100,000 annual cap reached
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
