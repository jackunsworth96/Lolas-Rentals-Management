import { useMemo, useState } from 'react';
import { HandHeart, Handshake, MessageCircle, MousePointerClick, Repeat } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useAuthStore } from '../../../stores/auth-store.js';
import {
  useDashboardSummary,
  useCharityImpact,
  useBasketAbandonmentSummary,
  useChatSummary,
  usePartnerDashboardSummary,
  useReferralStats,
  type StoreMetrics,
} from '../../../api/dashboard.js';
import { useAnalytics } from '../../../api/analytics.js';
import { CharityDonationsModal } from '../../../components/dashboard/CharityDonationsModal.js';
import { AccommodationAliasModal } from '../../../components/dashboard/AccommodationAliasModal.js';
import {
  ChartCard,
  ChartSkeleton,
  CardLink,
  DonutCard,
  EmptyState,
  FunnelCard,
  GaugeCard,
  HBarList,
  KpiCard,
  CHART_COLORS,
  formatPeso,
} from '../../../components/dashboard/ui/index.js';
import type { DashboardTabProps } from '../DashboardPage.js';

const TOP_COUNTRIES = 10;
const TOP_QUESTIONS = 6;

export default function MarketingTab({ storeId, selectedStoreId }: DashboardTabProps) {
  const canManageAliases = useAuthStore((s) => s.hasPermission)('can_view_dashboard');
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(storeId);
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(storeId, 30);
  const { data: referralStats, isLoading: referralLoading } = useReferralStats(selectedStoreId || undefined);
  const { data: basket } = useBasketAbandonmentSummary(selectedStoreId || undefined);
  const { data: partnerSummary } = usePartnerDashboardSummary(selectedStoreId || undefined);
  const { data: chat } = useChatSummary();
  const { data: charity } = useCharityImpact();

  const [showAccommodations, setShowAccommodations] = useState(false);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [showCharityDonations, setShowCharityDonations] = useState(false);
  const [showAliasManager, setShowAliasManager] = useState(false);

  const metrics: StoreMetrics | null = useMemo(() => {
    if (!summary?.stores) return null;
    return summary.stores[storeId ?? 'combined'] ?? Object.values(summary.stores)[0] ?? null;
  }, [summary, storeId]);

  const countries = metrics?.customerBreakdown?.byCountry ?? [];
  const knownCountries = countries.filter((c) => c.country !== 'Unknown');
  const unknownCustomers = countries.find((c) => c.country === 'Unknown')?.count ?? 0;
  const continents = (metrics?.customerBreakdown?.byContinent ?? [])
    .filter((c) => c.continent !== 'Unknown')
    .map((c) => ({ name: c.continent, value: c.count }));
  const knownTotal = knownCountries.reduce((s, c) => s + c.count, 0);

  const repeatPct = analytics ? analytics.bookings.repeatCustomerRate * 100 : 0;
  const annualPct = charity && charity.annualCap > 0 ? (charity.annualDonated / charity.annualCap) * 100 : 0;
  const questions = chat?.topQuestions ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          loading={!basket}
          label="Website conversion"
          value={`${basket?.conversionRate ?? 0}%`}
          icon={MousePointerClick}
          sub={basket ? `${basket.converted} of ${basket.total} baskets, 30 days` : undefined}
        />
        <KpiCard
          loading={analyticsLoading || !analytics}
          label="Returning customers"
          value={`${Math.round(repeatPct)}%`}
          icon={Repeat}
          sub={analytics ? `${analytics.bookings.returningCustomers} of ${analytics.bookings.totalUniqueCustomers}, 30 days` : undefined}
        />
        <KpiCard
          loading={!partnerSummary}
          label="Partner bookings"
          value={String(partnerSummary?.totalAttributedBookings ?? 0)}
          icon={Handshake}
          sub={partnerSummary ? `${formatPeso(partnerSummary.totalCommission)} commission due` : undefined}
        />
        <KpiCard
          loading={!chat}
          label="Lolo chats"
          value={String(chat?.total ?? 0)}
          icon={MessageCircle}
          tone={(chat?.handoffRate ?? 0) > 20 ? 'warning' : 'default'}
          sub={chat ? `${chat.handoffRate}% handed to WhatsApp` : undefined}
        />
        <KpiCard
          loading={!charity}
          label="Raised for NGOs"
          value={formatPeso(charity?.totalRaised ?? 0)}
          icon={HandHeart}
          sub="since Oct 2022"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title="How customers heard about us"
          subtitle={referralStats ? `${referralStats.total} answers from signed waivers (all time)` : undefined}
          action={
            canManageAliases && referralStats ? (
              <button
                type="button"
                onClick={() => setShowAliasManager(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-brand hover:underline"
              >
                {referralStats.unmatchedRawNames.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                    {referralStats.unmatchedRawNames.length} unaliased
                  </span>
                )}
                Manage aliases →
              </button>
            ) : null
          }
        >
          {referralLoading ? (
            <ChartSkeleton />
          ) : !referralStats || referralStats.total === 0 ? (
            <EmptyState>No referral answers yet</EmptyState>
          ) : (
            <>
              <HBarList
                rows={referralStats.breakdown.map((r) => ({ key: r.source, label: r.label, value: r.count }))}
                showShare
                highlightTop
              />
              {referralStats.accommodationBreakdown.length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAccommodations((v) => !v)}
                    className="text-xs font-medium text-teal-brand hover:underline"
                  >
                    {showAccommodations ? 'Hide' : 'Show'} which hotels send us customers ({referralStats.accommodationBreakdown.length})
                  </button>
                  {showAccommodations && (
                    <div className="mt-3">
                      <HBarList
                        rows={referralStats.accommodationBreakdown.map((a) => ({ label: a.name, value: a.count }))}
                        color={CHART_COLORS.accent}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </ChartCard>

        <div className="xl:col-span-4">
          <GaugeCard
            title="Repeat customer rate"
            value={repeatPct}
            caption="Customers in the last 30 days who had rented before"
            footer={
              analytics ? (
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl bg-gray-50 py-2">
                    <p className="text-lg font-semibold tabular-nums text-gray-900">{analytics.bookings.returningCustomers}</p>
                    <p className="text-xs text-gray-500">returning</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 py-2">
                    <p className="text-lg font-semibold tabular-nums text-gray-900">
                      {analytics.bookings.totalUniqueCustomers - analytics.bookings.returningCustomers}
                    </p>
                    <p className="text-xs text-gray-500">first-time</p>
                  </div>
                </div>
              ) : null
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title="Where customers come from"
          subtitle={`Top ${TOP_COUNTRIES} countries, based on phone number country code${unknownCustomers > 0 ? ` (${unknownCustomers} without one)` : ''}`}
        >
          {summaryLoading ? (
            <ChartSkeleton />
          ) : knownCountries.length === 0 ? (
            <EmptyState>No customer data</EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
              {[knownCountries.slice(0, 5), knownCountries.slice(5, TOP_COUNTRIES)].map((chunk, i) => (
                <HBarList
                  key={i}
                  rows={chunk.map((c) => ({
                    label: c.country,
                    value: c.count,
                    sub: knownTotal > 0 ? `${Math.round((c.count / knownTotal) * 100)}%` : undefined,
                  }))}
                />
              ))}
            </div>
          )}
        </ChartCard>
        <div className="xl:col-span-4">
          <DonutCard
            title="By continent"
            data={continents}
            centerValue={String(knownTotal)}
            centerLabel="customers"
            emptyText="No customer data"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {basket ? (
          <FunnelCard
            title="Website checkout funnel"
            subtitle="Last 30 days, from adding a vehicle to a confirmed booking"
            stages={[
              { label: 'Vehicle added to basket', count: basket.total },
              { label: 'Basket viewed', count: basket.basketViewed },
              { label: 'Started entering details', count: basket.renterStarted },
              { label: 'Booking confirmed', count: basket.converted },
            ]}
            footer={
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                <span>
                  Abandoned: <strong className="text-gray-900">{basket.abandoned}</strong>
                </span>
                <span>
                  Clicks to book: <strong className="text-gray-900">{basket.avgClicksCompleted ?? '—'}</strong>
                </span>
                <span>
                  Clicks before giving up: <strong className="text-gray-900">{basket.avgClicksAbandoned ?? '—'}</strong>
                </span>
              </div>
            }
          />
        ) : (
          <ChartCard title="Website checkout funnel">
            <ChartSkeleton />
          </ChartCard>
        )}

        <ChartCard
          title="Partner referrals this month"
          subtitle="Bookings via hotel and partner links"
          action={<CardLink href="/partners">Manage partners →</CardLink>}
        >
          {!partnerSummary ? (
            <ChartSkeleton />
          ) : partnerSummary.byPartner.length === 0 ? (
            <EmptyState>No partner bookings this month yet</EmptyState>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 bg-gray-50/60 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-2">Partner</th>
                    <th className="px-3 py-2 text-right">Bookings</th>
                    <th className="px-3 py-2 text-right">Commissionable</th>
                    <th className="px-5 py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {partnerSummary.byPartner.map((p) => (
                    <tr key={p.partnerId}>
                      <td className="px-5 py-2.5 font-medium text-gray-900">{p.partnerName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{p.totalBookings}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{p.commissionableBookings}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-teal-brand">{formatPeso(p.commissionDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Lolo chat assistant"
        subtitle={
          chat
            ? `Last 30 days · ${chat.avgMessages} messages per chat on average · ${chat.handoffs} handed to WhatsApp`
            : 'Last 30 days'
        }
      >
        {!chat ? (
          <ChartSkeleton />
        ) : chat.total === 0 ? (
          <EmptyState>No chat sessions yet</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Chats per day</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chat.sessionsByDay} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => [v, 'Chats']} />
                    <Area type="monotone" dataKey="sessions" stroke={CHART_COLORS.primary} strokeWidth={2} fill={CHART_COLORS.primary} fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {chat.byPageOrigin.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  Most chats start on the{' '}
                  <strong className="capitalize text-gray-700">{chat.byPageOrigin[0].page}</strong> page.
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">What people ask about</p>
              {chat.topTopics.length === 0 ? (
                <p className="text-sm text-gray-400">Topics appear after conversations close</p>
              ) : (
                <HBarList
                  rows={chat.topTopics.slice(0, 6).map((t) => ({ label: t.topic.charAt(0).toUpperCase() + t.topic.slice(1), value: t.count }))}
                  color={CHART_COLORS.accent}
                />
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Top first questions</p>
              <ol className="space-y-2">
                {(showAllQuestions ? questions : questions.slice(0, TOP_QUESTIONS)).map(({ question, count }, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">
                      {i + 1}
                    </span>
                    <span className="line-clamp-2 flex-1 leading-snug text-gray-700">{question}</span>
                    {count > 1 && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">×{count}</span>
                    )}
                  </li>
                ))}
              </ol>
              {questions.length > TOP_QUESTIONS && (
                <button
                  type="button"
                  onClick={() => setShowAllQuestions((v) => !v)}
                  className="mt-2 text-xs font-medium text-teal-brand hover:underline"
                >
                  {showAllQuestions ? 'Show fewer' : `Show all ${questions.length}`}
                </button>
              )}
            </div>
          </div>
        )}
      </ChartCard>

      {charity && (
        <ChartCard title="NGO impact" subtitle="Money raised for local animal welfare NGOs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-teal-brand/5 p-4">
              <p className="text-xs font-medium text-teal-brand">Total raised</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-teal-brand">{formatPeso(charity.totalRaised)}</p>
              <p className="mt-0.5 text-xs text-gray-400">Since Oct 2022</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCharityDonations(true)}
              className="rounded-xl bg-gray-50 p-4 text-left transition-colors hover:bg-teal-brand/5"
            >
              <p className="text-xs font-medium text-gray-500">From customer bookings</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{formatPeso(charity.bookingContributions)}</p>
              <p className="mt-0.5 text-xs text-gray-400">Click to see donations</p>
            </button>
            <div className={`rounded-xl p-4 ${charity.pendingPayout > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
              <p className={`text-xs font-medium ${charity.pendingPayout > 0 ? 'text-amber-700' : 'text-green-700'}`}>Pending payout</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${charity.pendingPayout > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {formatPeso(charity.pendingPayout)}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {charity.pendingPayout > 0 ? 'Awaiting transfer to NGOs' : 'All paid'}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-xs text-gray-500">
              <span className="font-medium">Donated this year</span>
              <span>
                {formatPeso(Math.min(charity.annualDonated, charity.annualCap))} of {formatPeso(charity.annualCap)} annual cap ({annualPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-teal-brand transition-all duration-700" style={{ width: `${Math.min(100, annualPct)}%` }} />
            </div>
          </div>
        </ChartCard>
      )}

      <CharityDonationsModal open={showCharityDonations} onClose={() => setShowCharityDonations(false)} />
      <AccommodationAliasModal
        open={showAliasManager}
        onClose={() => setShowAliasManager(false)}
        unmatchedRawNames={referralStats?.unmatchedRawNames ?? []}
      />
    </div>
  );
}
