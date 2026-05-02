import { useMemo, useState } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import {
  useDashboardSummary,
  useCharityImpact,
  useBasketAbandonmentSummary,
  useChatSummary,
  type StoreMetrics,
  type AddonRevenueRow,
  type CashBalanceRow,
  type RevenueTrendRow,
  type MaintenanceVehicle,
  type NinePmVehicle,
} from '../../api/dashboard.js';
import { useLostOpportunities, type LostOpportunityRow } from '../../api/lost-opportunity.js';
import { useStores } from '../../api/config.js';
import { AvailabilityDetailModal } from '../../components/dashboard/AvailabilityDetailModal.js';
import { CharityDonationsModal } from '../../components/dashboard/CharityDonationsModal.js';
import { formatCurrency } from '../../utils/currency.js';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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

function SkeletonStatCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
      <div className="h-2.5 w-20 rounded bg-gray-200" />
      <div className="mt-2 h-7 w-16 rounded bg-gray-200" />
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
  const tomorrowManila = new Date();
  tomorrowManila.setDate(tomorrowManila.getDate() + 1);
  const tomorrowDate = tomorrowManila.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const lostOppStoreId = selectedStoreId || storeList[0]?.id || '';
  const { data: lostOpps = [] } = useLostOpportunities(lostOppStoreId, today) as {
    data: LostOpportunityRow[] | undefined;
  };
  const lostOpportunities = lostOpps ?? [];

  const canViewFinancial = hasPermission('can_view_dashboard');
  const canViewLostOpp = hasPermission('can_view_lostopportunity');

  const { data: charityImpact } = useCharityImpact();
  const { data: basketAbandon } = useBasketAbandonmentSummary(selectedStoreId || undefined);
  const { data: chatSummary } = useChatSummary();

  const [selectedReturn, setSelectedReturn] = useState<NinePmVehicle | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showTomorrowAvailability, setShowTomorrowAvailability] = useState(false);
  const [showCharityDonations, setShowCharityDonations] = useState(false);

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

  if (error) {
    return (
      <div className="py-12 text-center text-red-600">
        Failed to load dashboard: {(error as Error).message}
      </div>
    );
  }

  const storeName = storeIdForApi
    ? storeList.find((s) => s.id === storeIdForApi)?.name ?? storeIdForApi
    : 'All Stores';

  if (!isLoading && !metrics) {
    return <div className="py-12 text-center text-gray-500">No data available</div>;
  }

  return (
    <>
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{storeName} &middot; {data?.date ?? today}</p>
        </div>
      </div>

      {/* SECTION — Operations Status (quick stats, count-only queries) */}
      <section>
        <SectionHeading>Operations Status</SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {isLoading ? (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          ) : (
            <>
              <StatCard label="Active Rentals" value={String(data?.activeOrdersCount ?? 0)} />
              <StatCard label="Revenue Today" value={formatCurrency(data?.revenueToday ?? 0)} />
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cash-Up</p>
                <p className={`mt-1 text-2xl font-semibold ${
                  data?.cashupStatus === 'closed'
                    ? 'text-green-600'
                    : data?.cashupStatus === 'open'
                      ? 'text-amber-600'
                      : 'text-gray-400'
                }`}>
                  {data?.cashupStatus === 'closed'
                    ? 'Closed'
                    : data?.cashupStatus === 'open'
                      ? 'Open'
                      : 'Not started'}
                </p>
              </div>
              <StatCard label="Pending Tasks" value={String(data?.pendingInboxCount ?? 0)} />
              <StatCard label="Transfers Today" value={String(data?.upcomingTransfersCount ?? 0)} />
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Overdue Returns</p>
                <p className={`mt-1 text-2xl font-semibold ${
                  (data?.overdueOrdersCount ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {data?.overdueOrdersCount ?? 0}
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* SECTION 1 — Daily Pulse */}
      <section>
        <SectionHeading>Daily Pulse</SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {isLoading || !metrics ? (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          ) : (
            <>
              <StatCard label="Active Rentals" value={String(metrics.activeRentals)} />
              <button
                type="button"
                className="cursor-pointer text-left"
                onClick={() => setShowAvailability(true)}
              >
                <StatCard
                  label="Available Vehicles"
                  value={String(metrics.availableVehicles)}
                  sub="tap to see details"
                />
              </button>
              <button
                type="button"
                className="text-left w-full cursor-pointer"
                onClick={() => setShowTomorrowAvailability(true)}
              >
                <StatCard
                  label="Available Tomorrow"
                  value={String(metrics.tomorrowAvailable ?? 0)}
                  sub="tap to see details"
                />
              </button>
              <StatCard label="Fleet Utilisation" value={`${metrics.fleetUtilisation}%`} />
              <StatCard label="Deposits Withheld" value={formatCurrency(metrics.depositsWithheld)} />
            </>
          )}
        </div>
      </section>

      {/* SECTION — Today's Bookings by Source */}
      {metrics?.bookingSourceSplit != null && (
        <section>
          <SectionHeading>Today's Bookings by Source</SectionHeading>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="Direct / Online" value={String(metrics.bookingSourceSplit.directWeb)} />
            <StatCard label="Walk-in" value={String(metrics.bookingSourceSplit.walkIn)} />
            <StatCard label="Total Today" value={String(metrics.bookingSourceSplit.total)} />
          </div>
        </section>
      )}

      {/* SECTION — Today's Bookings by Device */}
      {metrics?.deviceSplit != null && metrics.deviceSplit.total > 0 && (
        <section>
          <SectionHeading>Today's Bookings by Device</SectionHeading>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Mobile</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{metrics.deviceSplit.mobile}</p>
              {metrics.deviceSplit.total > 0 && (
                <p className="mt-1 text-sm text-gray-400">
                  {Math.round((metrics.deviceSplit.mobile / metrics.deviceSplit.total) * 100)}%
                </p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Desktop / Web</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{metrics.deviceSplit.desktop}</p>
              {metrics.deviceSplit.total > 0 && (
                <p className="mt-1 text-sm text-gray-400">
                  {Math.round((metrics.deviceSplit.desktop / metrics.deviceSplit.total) * 100)}%
                </p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Tracked Today</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{metrics.deviceSplit.total}</p>
            </div>
          </div>
        </section>
      )}

      {/* SECTION — Basket Abandonment Summary */}
      {canViewFinancial && basketAbandon != null && (
        <section>
          <SectionHeading>Basket Abandonment (Last 30 Days)</SectionHeading>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Sessions Started"
              value={String(basketAbandon.total)}
              sub="vehicles added to basket"
            />
            <StatCard
              label="Converted"
              value={String(basketAbandon.converted)}
              sub="completed a booking"
            />
            <StatCard
              label="Abandoned"
              value={String(basketAbandon.abandoned)}
              sub="left without booking"
            />
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Conversion Rate</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{basketAbandon.conversionRate}%</p>
              <p className="mt-0.5 text-xs text-gray-400">basket → booking</p>
            </div>
          </div>

          {/* Funnel breakdown */}
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Checkout Funnel</p>
            {(() => {
              const stages = [
                { label: 'Hold Created', count: basketAbandon.total },
                { label: 'Basket Viewed', count: basketAbandon.basketViewed },
                { label: 'Details Started', count: basketAbandon.renterStarted },
                { label: 'Booking Confirmed', count: basketAbandon.converted },
              ];
              const maxCount = stages[0].count || 1;
              return (
                <div className="space-y-3">
                  {stages.map((stage, idx) => {
                    const widthPct = Math.round((stage.count / maxCount) * 100);
                    const dropOff = idx > 0 && stages[idx - 1].count > 0
                      ? Math.round(((stages[idx - 1].count - stage.count) / stages[idx - 1].count) * 100)
                      : null;
                    return (
                      <div key={stage.label}>
                        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                          <span className="font-medium text-gray-700">{stage.label}</span>
                          <span className="flex items-center gap-3">
                            {dropOff !== null && dropOff > 0 && (
                              <span className="text-red-500">−{dropOff}% drop-off</span>
                            )}
                            <span className="font-semibold text-gray-900">{stage.count}</span>
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-[#00577C] transition-all duration-300"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* SECTION 2 — 9PM Returns */}
      {metrics != null && <section>
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
      </section>}

      {/* SECTION 3 — Fleet Health */}
      {metrics != null && <section>
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
      </section>}

      {/* SECTION 4 — Financial Summary */}
      {canViewFinancial && metrics?.todayRevenue !== null && metrics != null && (
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
      {canViewFinancial && metrics?.addonRevenue !== null && metrics != null && (
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
      {metrics?.cashBalances != null && metrics.cashBalances.length > 0 && (
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
      {canViewFinancial && metrics != null && (metrics.revenueThisMonth !== null || metrics.revenueTrend !== null) && (
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
              <div className="h-48 w-full md:h-72">
                <ResponsiveContainer width="100%" height="100%">
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
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 9 — Expenses by Category */}
      {canViewFinancial && metrics != null && (metrics.expensesByCategory !== null || metrics.expensesByCategoryLastMonth !== null) && (
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
              <div className="h-48 w-full md:h-72">
                <ResponsiveContainer width="100%" height="100%">
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
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 10 — Customer Breakdown */}
      {canViewFinancial && metrics?.customerBreakdown !== null && metrics != null && (
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
                <div className="h-48 w-full md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
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
                </div>
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
                <div className="h-48 w-full md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
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
                </div>
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

      <AvailabilityDetailModal
        open={showAvailability}
        onClose={() => setShowAvailability(false)}
        storeId={selectedStoreId}
      />
      <AvailabilityDetailModal
        open={showTomorrowAvailability}
        onClose={() => setShowTomorrowAvailability(false)}
        storeId={selectedStoreId}
        date={tomorrowDate}
      />

      {/* SECTION — Lolo Chat Analytics */}
      {canViewFinancial && chatSummary && (
        <section>
          <SectionHeading>Lolo Chat Analytics (last 30 days)</SectionHeading>

          {/* KPI row */}
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total Sessions"
              value={String(chatSummary.total)}
              sub="Chat panels opened"
            />
            <StatCard
              label="Avg Messages"
              value={String(chatSummary.avgMessages)}
              sub="Per session"
            />
            <StatCard
              label="WhatsApp Handoffs"
              value={String(chatSummary.handoffs)}
              sub="Lolo couldn't fully answer"
            />
            <StatCard
              label="Handoff Rate"
              value={`${chatSummary.handoffRate}%`}
              sub={chatSummary.handoffRate > 20 ? 'Review system prompt' : 'Healthy'}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Sessions over time */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Sessions per Day
              </h3>
              {chatSummary.sessionsByDay.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No sessions yet</p>
              ) : (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chatSummary.sessionsByDay}>
                      <defs>
                        <linearGradient id="chatGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00577C" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#00577C" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value: number) => [value, 'Sessions']}
                        labelFormatter={(label: string) => `Date: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="sessions"
                        stroke="#00577C"
                        strokeWidth={2}
                        fill="url(#chatGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Page origin breakdown */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Where Chats Start
              </h3>
              {chatSummary.byPageOrigin.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No data yet</p>
              ) : (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chatSummary.byPageOrigin} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="page"
                        tick={{ fontSize: 11 }}
                        width={80}
                        tickFormatter={(v: string) =>
                          v.charAt(0).toUpperCase() + v.slice(1)
                        }
                      />
                      <Tooltip formatter={(value: number) => [value, 'Sessions']} />
                      <Bar dataKey="count" fill="#FCBC5A" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Device split — small inline pills */}
          {chatSummary.byDevice.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {chatSummary.byDevice.map(({ device, count }) => (
                <div
                  key={device}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm shadow-sm"
                >
                  <span className="font-medium capitalize text-gray-700">{device}</span>
                  <span className="text-gray-400">·</span>
                  <span className="font-semibold text-gray-900">{count}</span>
                  <span className="text-xs text-gray-400">
                    ({chatSummary.total > 0 ? Math.round((count / chatSummary.total) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION — Be Pawsitive Impact */}
      {charityImpact && (
        <section>
          <SectionHeading>🐾 Be Pawsitive Impact</SectionHeading>
          <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Total raised */}
              <div className="rounded-xl border border-teal-100 bg-teal-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-600">
                  Total Raised for Be Pawsitive
                </p>
                <p className="text-2xl font-bold" style={{ color: '#00577C' }}>
                  {formatCurrency(charityImpact.totalRaised)}
                </p>
                <p className="mt-1 text-xs text-teal-500">Since Oct 2022</p>
              </div>

              {/* From bookings */}
              <button
                type="button"
                onClick={() => setShowCharityDonations(true)}
                className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-left transition-colors hover:border-teal-200 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  From Customer Bookings
                </p>
                <p className="text-2xl font-bold text-gray-800">
                  {formatCurrency(charityImpact.bookingContributions)}
                </p>
                <p className="mt-1 text-xs text-gray-400">Booking charity donations · click to view</p>
              </button>

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
                  {charityImpact.pendingPayout > 0 ? 'Awaiting transfer to Be Pawsitive' : 'All paid ✓'}
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

    <CharityDonationsModal
      open={showCharityDonations}
      onClose={() => setShowCharityDonations(false)}
    />
    </>
  );
}
