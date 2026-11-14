import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  Banknote,
  Bike,
  CalendarClock,
  CalendarDays,
  Car,
  ClipboardList,
  Gauge as GaugeIcon,
  Lock,
  Plane,
  Smartphone,
  Monitor,
  Wrench,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuthStore } from '../../../stores/auth-store.js';
import {
  useDashboardSummary,
  useDashboardInsights,
  useReferralStats,
  type StoreMetrics,
} from '../../../api/dashboard.js';
import { TodayMovements } from '../../../components/dashboard/TodayMovements.js';
import { OverdueReturnsModal } from '../../../components/dashboard/OverdueReturnsModal.js';
import { RevenueTransactionsModal } from '../../../components/dashboard/RevenueTransactionsModal.js';
import { useLostOpportunities, type LostOpportunityRow } from '../../../api/lost-opportunity.js';
import { useStores } from '../../../api/config.js';
import { usePartnerProtection } from '../../../api/fleet.js';
import { AvailabilityDetailModal } from '../../../components/dashboard/AvailabilityDetailModal.js';
import { WalkInBookingModal } from '../../../components/orders/WalkInBookingModal.js';
import {
  AttentionStrip,
  ChartCard,
  ChartSkeleton,
  CardLink,
  DonutChart,
  EmptyState,
  KpiCard,
  CHART_COLORS,
  formatPeso,
  shortDate,
  weekdayShort,
  type AttentionItem,
} from '../../../components/dashboard/ui/index.js';
import type { DashboardTabProps } from '../DashboardPage.js';

function manilaToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function manilaHour(): number {
  return Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }));
}

const LONG_REPAIR_DAYS = 7;

export default function TodayTab({ storeId, selectedStoreId }: DashboardTabProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canViewFinancial = hasPermission('can_view_dashboard');
  const canViewActive = hasPermission('can_view_active');
  const canViewLostOpp = hasPermission('can_view_lostopportunity');

  const { data, isLoading, error } = useDashboardSummary(storeId);
  const { data: insights, isLoading: insightsLoading } = useDashboardInsights(storeId);
  const { data: stores = [] } = useStores();
  const { data: protection = [] } = usePartnerProtection(storeId ?? 'all', hasPermission('can_view_fleet'));
  const { data: referralStats } = useReferralStats(selectedStoreId || undefined);

  const today = manilaToday();
  const tomorrow = manilaToday(1);
  const lostOppStoreId = selectedStoreId || (stores as Array<{ id: string }>)[0]?.id || '';
  const { data: lostOppsData } = useLostOpportunities(lostOppStoreId, today) as {
    data: LostOpportunityRow[] | undefined;
  };
  const lostOpps = lostOppsData ?? [];

  const [showAvailability, setShowAvailability] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [walkInVehicleId, setWalkInVehicleId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const canBookWalkIn = hasPermission('can_edit_orders') && !!storeId;
  const [showTomorrowAvailability, setShowTomorrowAvailability] = useState(false);

  const metrics: StoreMetrics | null = useMemo(() => {
    if (!data?.stores) return null;
    return data.stores[storeId ?? 'combined'] ?? Object.values(data.stores)[0] ?? null;
  }, [data, storeId]);

  const protectedSummary = useMemo(() => {
    const byPartner = new Map<string, number>();
    for (const v of protection.flatMap((s) => s.protectedVehicles)) {
      const name = v.partnerName ?? 'a partner';
      byPartner.set(name, (byPartner.get(name) ?? 0) + 1);
    }
    return [...byPartner].map(([name, n]) => `${n} protected for ${name}`).join(' · ');
  }, [protection]);

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    if (!data || !metrics) return items;
    if (data.overdueOrdersCount > 0) {
      items.push({
        id: 'overdue',
        tone: 'danger',
        label: `${data.overdueOrdersCount} overdue ${data.overdueOrdersCount === 1 ? 'return' : 'returns'}`,
        ...(canViewActive ? { onClick: () => setShowOverdue(true) } : { to: '/orders/active' }),
      });
    }
    if (metrics.availableVehicles === 0) {
      items.push({ id: 'sold-out', tone: 'danger', label: 'No vehicles available right now', onClick: () => setShowAvailability(true) });
    }
    if (data.cashupStatus !== 'closed' && manilaHour() >= 18) {
      items.push({
        id: 'cashup',
        tone: 'warning',
        label: data.cashupStatus === 'open' ? 'Cash-up still open' : 'Cash-up not started',
        to: '/cashup',
      });
    }
    const longRepairs = metrics.maintenanceVehicles.filter((v) => v.daysDown > LONG_REPAIR_DAYS);
    if (longRepairs.length > 0) {
      items.push({
        id: 'repairs',
        tone: 'warning',
        label: `${longRepairs.length} ${longRepairs.length === 1 ? 'vehicle' : 'vehicles'} in maintenance over ${LONG_REPAIR_DAYS} days`,
        to: '/maintenance',
      });
    }
    const owing = metrics.ninepmReturns.vehicles.filter((v) => v.balanceDue > 0);
    if (owing.length > 0) {
      items.push({
        id: 'ninepm-balance',
        tone: 'warning',
        label: `${owing.length} 9PM ${owing.length === 1 ? 'return' : 'returns'} with balance owing`,
      });
    }
    if (canViewLostOpp && lostOpps.length > 0) {
      items.push({
        id: 'lost-opps',
        tone: 'warning',
        label: `${lostOpps.length} missed ${lostOpps.length === 1 ? 'inquiry' : 'inquiries'} today`,
        to: '/lost-opportunity',
      });
    }
    if (canViewFinancial && referralStats && referralStats.unmatchedRawNames.length > 0) {
      items.push({
        id: 'aliases',
        tone: 'warning',
        label: `${referralStats.unmatchedRawNames.length} accommodation names need an alias`,
        to: '/dashboard?tab=marketing',
      });
    }
    return items;
  }, [data, metrics, lostOpps, canViewLostOpp, canViewFinancial, canViewActive, referralStats]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        Failed to load dashboard: {(error as Error).message}
      </div>
    );
  }

  const loading = isLoading || !metrics;
  const revenueToday = (metrics?.todayRevenue ?? 0) + (metrics?.miscSalesRevenue ?? 0);
  const sourceSplit = metrics?.bookingSourceSplit;
  const deviceSplit = metrics?.deviceSplit;
  const sourceSlices = sourceSplit
    ? [
        { name: 'Direct / online', value: sourceSplit.directWeb },
        { name: 'Walk-in', value: sourceSplit.walkIn },
        { name: 'Website (WooCommerce)', value: sourceSplit.wooCommerce },
        {
          name: 'Other',
          value: Math.max(0, sourceSplit.total - sourceSplit.directWeb - sourceSplit.walkIn - sourceSplit.wooCommerce),
        },
      ].filter((s) => s.value > 0)
    : [];
  const deposits = metrics?.depositsWithheldByMethod;
  const lostValue = lostOpps.reduce((sum, o) => sum + (o.estValue ?? 0), 0);

  return (
    <div className="space-y-6">
      {!loading && <AttentionStrip items={attention} />}

      <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${canViewFinancial ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
        <KpiCard loading={loading} label="Active rentals" value={String(metrics?.activeRentals ?? 0)} icon={Car} sub="vehicles out now" />
        <KpiCard
          loading={loading}
          label="Available now"
          value={String(metrics?.availableVehicles ?? 0)}
          icon={Bike}
          tone={metrics?.availableVehicles === 0 ? 'danger' : 'default'}
          sub={protectedSummary ? `incl. ${protectedSummary}` : 'tap for details'}
          onClick={() => setShowAvailability(true)}
        />
        <KpiCard
          loading={loading}
          label="Available tomorrow"
          value={String(metrics?.tomorrowAvailable ?? 0)}
          icon={CalendarDays}
          sub="tap for details"
          onClick={() => setShowTomorrowAvailability(true)}
        />
        <KpiCard loading={loading} label="Fleet on rent" value={`${metrics?.fleetUtilisation ?? 0}%`} icon={GaugeIcon} sub="of rentable vehicles">
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-teal-brand transition-all duration-500"
              style={{ width: `${Math.min(100, metrics?.fleetUtilisation ?? 0)}%` }}
            />
          </div>
        </KpiCard>
        {canViewFinancial && (
          <KpiCard
            loading={loading}
            label="Revenue today"
            value={formatPeso(revenueToday)}
            icon={Banknote}
            sub={metrics?.miscSalesRevenue ? `incl. ${formatPeso(metrics.miscSalesRevenue)} misc sales · tap for details` : 'tap to see transactions'}
            onClick={() => setShowRevenue(true)}
          />
        )}
        <KpiCard
          loading={loading}
          label="Overdue returns"
          value={String(data?.overdueOrdersCount ?? 0)}
          icon={AlertOctagon}
          tone={(data?.overdueOrdersCount ?? 0) > 0 ? 'danger' : 'good'}
          sub={(data?.overdueOrdersCount ?? 0) > 0 ? (canViewActive ? 'tap to settle' : 'past drop-off time') : 'all on time'}
          onClick={canViewActive && (data?.overdueOrdersCount ?? 0) > 0 ? () => setShowOverdue(true) : undefined}
        />
      </div>

      <TodayMovements storeId={storeId} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title="Next 7 days"
          subtitle="Pickups and returns per day, and how much of the fleet is booked"
        >
          {insightsLoading || !insights ? (
            <ChartSkeleton />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={insights.next7Days.map((d, i) => ({
                    ...d,
                    label: i === 0 ? 'Today' : `${weekdayShort(d.date)} ${shortDate(d.date)}`,
                  }))}
                  margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === 'Fleet booked' ? [`${value}%`, name] : [value, name]
                    }
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="count" dataKey="pickups" name="Pickups" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar yAxisId="count" dataKey="returns" name="Returns" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="bookedPct"
                    name="Fleet booked"
                    stroke={CHART_COLORS.charcoal}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard className="xl:col-span-4" title="Today's bookings" subtitle="Where today's new bookings came from">
          {loading ? (
            <ChartSkeleton height="h-40" />
          ) : sourceSlices.length === 0 ? (
            <EmptyState>No new bookings yet today</EmptyState>
          ) : (
            <DonutChart data={sourceSlices} centerValue={String(sourceSplit?.total ?? 0)} centerLabel="bookings" />
          )}
          {deviceSplit && deviceSplit.total > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
              <DeviceStat icon={Smartphone} label="Mobile" count={deviceSplit.mobile} total={deviceSplit.total} />
              <DeviceStat icon={Monitor} label="Desktop" count={deviceSplit.desktop} total={deviceSplit.total} />
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ChartCard title="Fleet health" action={<CardLink href="/maintenance">Maintenance →</CardLink>}>
            {loading ? (
              <ChartSkeleton height="h-20" />
            ) : metrics!.maintenanceVehicles.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-green-700">
                <Wrench className="h-4 w-4" /> All vehicles operational
              </p>
            ) : (
              <ul className="space-y-2">
                {[...metrics!.maintenanceVehicles]
                  .sort((a, b) => b.daysDown - a.daysDown)
                  .map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-gray-700">{v.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          v.daysDown > LONG_REPAIR_DAYS ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {v.daysDown} {v.daysDown === 1 ? 'day' : 'days'} down
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </ChartCard>

          <ChartCard title="Today at a glance">
            <ul className="divide-y divide-gray-50 text-sm">
              <StatusRow icon={Plane} label="Transfers today" value={String(data?.upcomingTransfersCount ?? 0)} href="/transfers" />
              <StatusRow icon={ClipboardList} label="Open tasks" value={String(data?.pendingInboxCount ?? 0)} href="/todo" />
              <StatusRow
                icon={Lock}
                label="Cash-up"
                href="/cashup"
                value={data?.cashupStatus === 'closed' ? 'Closed' : data?.cashupStatus === 'open' ? 'Open' : 'Not started'}
                valueClass={
                  data?.cashupStatus === 'closed'
                    ? 'text-green-700'
                    : data?.cashupStatus === 'open'
                      ? 'text-amber-700'
                      : 'text-gray-400'
                }
              />
              <StatusRow icon={CalendarClock} label="9PM returns" value={String(metrics?.ninepmReturns.count ?? 0)} />
            </ul>
          </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-12">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Deposits held</h3>
              <p className="mt-0.5 text-xs text-gray-400">Security deposits on active rentals, by where the money is</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{formatPeso(metrics?.depositsWithheld ?? 0)}</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Cash', amount: deposits?.cash ?? 0 },
              { label: 'GCash', amount: deposits?.gcash ?? 0 },
              { label: 'Bank', amount: deposits?.bank ?? 0 },
            ].map((p) => (
              <div key={p.label} className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">{p.label}</p>
                <p className="text-sm font-semibold tabular-nums text-gray-900">{formatPeso(p.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {canViewLostOpp && (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Lost opportunities today</h3>
                <p className="mt-0.5 text-xs text-gray-400">Customers we couldn't serve, logged by staff</p>
              </div>
              <CardLink href="/lost-opportunity">View all →</CardLink>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Missed inquiries</p>
                <p className="text-lg font-semibold tabular-nums text-gray-900">{lostOpps.length}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Estimated lost value</p>
                <p className={`text-lg font-semibold tabular-nums ${lostValue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatPeso(lostValue)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <AvailabilityDetailModal
        open={showAvailability}
        onClose={() => setShowAvailability(false)}
        storeId={selectedStoreId}
        onBookVehicle={
          canBookWalkIn
            ? (vehicleId) => {
                setShowAvailability(false);
                setWalkInVehicleId(vehicleId);
              }
            : undefined
        }
      />
      {canViewFinancial && showRevenue && (
        <RevenueTransactionsModal open onClose={() => setShowRevenue(false)} storeId={storeId} />
      )}
      {canViewActive && showOverdue && <OverdueReturnsModal open onClose={() => setShowOverdue(false)} storeId={storeId} />}

      {walkInVehicleId && (
        <WalkInBookingModal
          open
          onClose={() => {
            setWalkInVehicleId(null);
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            void queryClient.invalidateQueries({ queryKey: ['availability-detail'] });
          }}
          initialVehicleId={walkInVehicleId}
        />
      )}
      <AvailabilityDetailModal
        open={showTomorrowAvailability}
        onClose={() => setShowTomorrowAvailability(false)}
        storeId={selectedStoreId}
        date={tomorrow}
      />
    </div>
  );
}

function DeviceStat({
  icon: Icon,
  label,
  count,
  total,
}: {
  icon: typeof Smartphone;
  label: string;
  count: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-sm text-gray-600">{label}</span>
      <span className="ml-auto text-sm font-semibold tabular-nums text-gray-900">{count}</span>
      <span className="text-xs text-gray-400">{total > 0 ? Math.round((count / total) * 100) : 0}%</span>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  href,
  valueClass = 'text-gray-900',
}: {
  icon: typeof Plane;
  label: string;
  value: string;
  href?: string;
  valueClass?: string;
}) {
  const content = (
    <>
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-gray-600">{label}</span>
      <span className={`ml-auto font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <a href={href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50">
          {content}
        </a>
      ) : (
        <div className="flex items-center gap-3 py-2">{content}</div>
      )}
    </li>
  );
}
