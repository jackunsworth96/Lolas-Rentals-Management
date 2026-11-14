import { useMemo } from 'react';
import { Banknote, Bike, PiggyBank, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  useDashboardSummary,
  useDashboardInsights,
  useBasketAbandonmentSummary,
  useChatSummary,
  type StoreMetrics,
} from '../../../api/dashboard.js';
import { useAnalytics } from '../../../api/analytics.js';
import { InsightsPanel } from '../../../components/dashboard/InsightsPanel.js';
import {
  ChartCard,
  ChartSkeleton,
  CardLink,
  EmptyState,
  HBarList,
  KpiCard,
  CHART_COLORS,
  formatCompactPeso,
  formatPeso,
  pctChange,
} from '../../../components/dashboard/ui/index.js';
import { buildInsights } from '../insights.js';
import type { DashboardTabProps } from '../DashboardPage.js';

const pesoTooltip = (value: number) => formatPeso(value);

export default function BusinessTab({ storeId, selectedStoreId }: DashboardTabProps) {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(storeId);
  const { data: insights, isLoading: insightsLoading } = useDashboardInsights(storeId);
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(storeId, 30);
  const { data: basket } = useBasketAbandonmentSummary(selectedStoreId || undefined);
  const { data: chat } = useChatSummary();

  const metrics: StoreMetrics | null = useMemo(() => {
    if (!summary?.stores) return null;
    return summary.stores[storeId ?? 'combined'] ?? Object.values(summary.stores)[0] ?? null;
  }, [summary, storeId]);

  const expenseCategories = useMemo(() => {
    if (!metrics) return [];
    const totals = new Map<string, { thisMonth: number; lastMonth: number }>();
    const add = (category: string, field: 'thisMonth' | 'lastMonth', amount: number) => {
      const key = category.toLowerCase().startsWith('maintenance') ? 'Maintenance' : category;
      const row = totals.get(key) ?? { thisMonth: 0, lastMonth: 0 };
      row[field] += amount;
      totals.set(key, row);
    };
    for (const e of metrics.expensesByCategory ?? []) add(e.category, 'thisMonth', e.total);
    for (const e of metrics.expensesByCategoryLastMonth ?? []) add(e.category, 'lastMonth', e.total);
    return [...totals.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.thisMonth - a.thisMonth || b.lastMonth - a.lastMonth);
  }, [metrics]);

  const topModels = useMemo(
    () =>
      (analytics?.fleet.byModel ?? [])
        .map((m) => ({ ...m, revenue: m.revPAB * m.availableFleetDays }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
    [analytics],
  );

  const insightList = useMemo(
    () =>
      buildInsights({
        insights,
        analytics,
        expensesByCategory: expenseCategories,
        basket: basket ?? null,
        chat: chat ?? null,
      }),
    [insights, analytics, expenseCategories, basket, chat],
  );

  const mtd = insights?.mtd;
  const margin = mtd && mtd.revenue > 0 ? Math.round((mtd.profit / mtd.revenue) * 100) : null;
  const monthlyRevenue = (insights?.monthly ?? []).map((m) => m.revenue);
  const topWeekday = Math.max(0, ...(insights?.weekdayDemand ?? []).map((d) => d.pickups));
  const maintenanceTotal = (metrics?.maintenancePartsCost ?? 0) + (metrics?.maintenanceLabourCost ?? 0);
  const partsPct = maintenanceTotal > 0 ? Math.round(((metrics?.maintenancePartsCost ?? 0) / maintenanceTotal) * 100) : 0;
  const kpiLoading = insightsLoading || !mtd;
  const vsLabel = mtd ? `vs day ${mtd.dayOfMonth} last month` : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          loading={kpiLoading}
          label="Revenue this month"
          value={formatPeso(mtd?.revenue ?? 0)}
          icon={Banknote}
          delta={mtd ? pctChange(mtd.revenue, mtd.lastMonth.revenue) : null}
          deltaLabel={vsLabel}
          sparkline={monthlyRevenue.slice(-6)}
        />
        <KpiCard
          loading={kpiLoading}
          label="Expenses this month"
          value={formatPeso(mtd?.expenses ?? 0)}
          icon={Receipt}
          delta={mtd ? pctChange(mtd.expenses, mtd.lastMonth.expenses) : null}
          deltaLabel={vsLabel}
          goodWhen="down"
        />
        <KpiCard
          loading={kpiLoading}
          label="Profit this month"
          value={formatPeso(mtd?.profit ?? 0)}
          icon={PiggyBank}
          tone={(mtd?.profit ?? 0) < 0 ? 'danger' : 'good'}
          delta={mtd ? pctChange(mtd.profit, mtd.lastMonth.profit) : null}
          sub={margin != null ? `${margin}% margin` : undefined}
        />
        <KpiCard
          loading={kpiLoading}
          label="Average booking value"
          value={formatPeso(mtd?.avgBookingValue ?? 0)}
          icon={ShoppingCart}
          delta={mtd ? pctChange(mtd.avgBookingValue, mtd.lastMonth.avgBookingValue) : null}
          sub={mtd ? `${mtd.bookings} bookings` : undefined}
        />
        <KpiCard
          loading={analyticsLoading || !analytics}
          label="Revenue per bike per day"
          value={formatPeso(analytics?.fleet.overall.revPAB ?? 0)}
          icon={Bike}
          sub={analytics ? `${Math.round(analytics.fleet.overall.utilisationRate * 100)}% utilised, last 30 days` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title="Revenue: this month vs last month"
          subtitle="Running total by day of the month"
          action={mtd ? <span className="text-xl font-bold tabular-nums text-gray-900">{formatCompactPeso(mtd.revenue)}</span> : null}
        >
          {insightsLoading || !insights?.dailyRevenue ? (
            <ChartSkeleton height="h-72" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={insights.dailyRevenue} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revThis" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tickFormatter={formatCompactPeso} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip formatter={pesoTooltip} labelFormatter={(d) => `Day ${d}`} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="lastMonth"
                    name="Last month"
                    stroke={CHART_COLORS.accent}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    fill="none"
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="thisMonth"
                    name="This month"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2.5}
                    fill="url(#revThis)"
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <div className="xl:col-span-4">
          <InsightsPanel insights={insightList} loading={insightsLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title="Last 12 months"
          subtitle="Revenue and recorded expenses per month, with profit as a line"
        >
          {insightsLoading || !insights?.monthly ? (
            <ChartSkeleton height="h-72" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={insights.monthly} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatCompactPeso} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip formatter={pesoTooltip} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="expenses" name="Expenses" fill={CHART_COLORS.primarySoft} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke={CHART_COLORS.accent} strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard className="xl:col-span-4" title="Busiest days" subtitle="Average pickups per weekday, last 90 days">
          {insightsLoading || !insights ? (
            <ChartSkeleton height="h-72" />
          ) : topWeekday === 0 ? (
            <EmptyState>No pickups in the last 90 days</EmptyState>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights.weekdayDemand} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [`${v} per week`, 'Pickups']} />
                  <Bar dataKey="avgPerWeek" radius={[6, 6, 6, 6]} maxBarSize={32}>
                    {insights.weekdayDemand.map((d) => (
                      <Cell key={d.day} fill={d.pickups === topWeekday ? CHART_COLORS.primary : '#dbe7ec'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Expenses by category"
          subtitle="This month so far (teal) vs all of last month (gold)"
          action={<CardLink href="/expenses">Expenses →</CardLink>}
        >
          {summaryLoading ? (
            <ChartSkeleton />
          ) : expenseCategories.length === 0 ? (
            <EmptyState>No expenses recorded for this period</EmptyState>
          ) : (
            <HBarList
              rows={expenseCategories.slice(0, 10).map((e) => ({ label: e.category, value: e.thisMonth, compare: e.lastMonth }))}
              formatValue={formatPeso}
            />
          )}
          {maintenanceTotal > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="mb-1.5 flex justify-between text-xs text-gray-500">
                <span>Maintenance this month: {formatPeso(maintenanceTotal)}</span>
                <span>
                  {partsPct}% parts / {100 - partsPct}% labour
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-teal-brand" style={{ width: `${partsPct}%` }} />
                <div className="h-full bg-gold-brand" style={{ width: `${100 - partsPct}%` }} />
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Top-earning vehicle models"
          subtitle="Last 30 days. Utilisation is the share of days each model was out on rent."
          action={<CardLink href="/analytics">Analytics →</CardLink>}
        >
          {analyticsLoading ? (
            <ChartSkeleton />
          ) : topModels.length === 0 ? (
            <EmptyState>No rentals in the last 30 days</EmptyState>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 bg-gray-50/60 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-2">Model</th>
                    <th className="px-3 py-2 text-right">Rentals</th>
                    <th className="w-40 px-3 py-2">Utilisation</th>
                    <th className="px-5 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topModels.map((m) => {
                    const util = Math.round(m.utilisationRate * 100);
                    return (
                      <tr key={m.modelId}>
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-gray-900">{m.modelName}</p>
                          <p className="text-xs text-gray-400">{m.currentFleetSize} units</p>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{m.totalRentals}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full ${util >= 85 ? 'bg-green-600' : util < 40 ? 'bg-red-400' : 'bg-teal-brand'}`}
                                style={{ width: `${Math.min(100, util)}%` }}
                              />
                            </div>
                            <span className="w-9 text-right text-xs tabular-nums text-gray-500">{util}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-gray-900">{formatPeso(m.revenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ChartCard title="Cash balances" subtitle="Cash, GCash and bank accounts right now" action={<Wallet className="h-5 w-5 text-gray-300" />}>
          {summaryLoading ? (
            <ChartSkeleton height="h-32" />
          ) : (metrics?.cashBalances ?? []).length === 0 ? (
            <EmptyState>No cash account data available</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-50">
              {[...(metrics?.cashBalances ?? [])]
                .sort((a, b) => b.balance - a.balance)
                .map((a) => (
                  <li key={a.accountId} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-600">{a.accountName}</span>
                    <span className={`font-semibold tabular-nums ${a.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatPeso(a.balance)}
                    </span>
                  </li>
                ))}
              <li className="flex items-center justify-between py-2 text-sm">
                <span className="text-amber-700">Customer deposits held (to be returned)</span>
                <span className="font-semibold tabular-nums text-amber-700">{formatPeso(metrics?.depositsWithheld ?? 0)}</span>
              </li>
            </ul>
          )}
        </ChartCard>

        <ChartCard
          title="Add-on sales today"
          subtitle={
            analytics
              ? `${Math.round(analytics.bookings.addonAttachRate * 100)}% of bookings in the last 30 days included an add-on`
              : 'Extras sold with rentals'
          }
        >
          {summaryLoading ? (
            <ChartSkeleton height="h-32" />
          ) : (metrics?.addonRevenue ?? []).length === 0 ? (
            <EmptyState>No add-on revenue recorded today</EmptyState>
          ) : (
            <HBarList
              rows={(metrics?.addonRevenue ?? []).map((a) => ({ label: a.addonName, value: a.total }))}
              formatValue={formatPeso}
              color={CHART_COLORS.accent}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
