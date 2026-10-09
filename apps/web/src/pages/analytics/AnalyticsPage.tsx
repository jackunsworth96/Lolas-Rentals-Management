import { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp, Bike, Users, Calendar, ArrowUp, ArrowDown, Minus, Link2, Target, ShieldCheck } from 'lucide-react';
import {
  useAnalytics,
  useFleetForecast,
  useConfidenceReport,
  type FleetModelMetrics,
} from '../../api/analytics.js';
import { useUIStore } from '../../stores/ui-store.js';

const CHART_COLORS = ['#0d9488', '#6366f1', '#d97706', '#dc2626', '#7c3aed'];

const PERIODS = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
];

const TARGET_UTILISATION = 0.8;

function pct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function formatPhp(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-teal-200 bg-teal-50' : 'border-gray-200 bg-white'}`}>
      <p className={`text-xs font-medium ${accent ? 'text-teal-600' : 'text-gray-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-teal-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Utilisation bar ──────────────────────────────────────────────────────────

function UtilBar({ rate }: { rate: number }) {
  const pctVal = Math.min(rate * 100, 100);
  const color = rate >= TARGET_UTILISATION
    ? 'bg-green-500'
    : rate >= TARGET_UTILISATION * 0.75
    ? 'bg-amber-400'
    : 'bg-red-400';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full bg-gray-100 h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pctVal}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{pct(rate)}</span>
    </div>
  );
}

// ── Fleet delta badge ────────────────────────────────────────────────────────

function FleetDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
        <Minus className="h-3 w-3" /> On target
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
        <ArrowUp className="h-3 w-3" /> +{delta} needed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700">
      <ArrowDown className="h-3 w-3" /> {Math.abs(delta)} excess
    </span>
  );
}

// ── Fleet model card ─────────────────────────────────────────────────────────

function FleetModelCard({ model, days }: { model: FleetModelMetrics; days: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{model.modelName}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Fleet: {model.currentFleetSize} unit{model.currentFleetSize !== 1 ? 's' : ''} &middot; {model.totalRentals} rental{model.totalRentals !== 1 ? 's' : ''} in {days}d
          </p>
        </div>
        <FleetDeltaBadge delta={model.fleetDelta} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-500">Utilisation</p>
          <p className="text-xs text-gray-400">Target: {pct(TARGET_UTILISATION)}</p>
        </div>
        <UtilBar rate={model.utilisationRate} />
        <p className="text-xs text-gray-400 mt-1">
          {model.rentalDaysUsed} rental-days used / {model.availableFleetDays} available
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
        <div>
          <p className="text-xs text-gray-400">RevPAB</p>
          <p className="text-sm font-semibold text-gray-900">{formatPhp(model.revPAB)}</p>
          <p className="text-[11px] text-gray-400">per bike/day</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Avg duration</p>
          <p className="text-sm font-semibold text-gray-900">{model.avgRentalDuration}d</p>
          <p className="text-[11px] text-gray-400">per rental</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Extension rate</p>
          <p className="text-sm font-semibold text-gray-900">{pct(model.extensionRate)}</p>
          <p className="text-[11px] text-gray-400">of rentals extended</p>
        </div>
      </div>

      {model.currentFleetSize !== model.recommendedFleetSize && (
        <div className={`rounded-lg px-3 py-2 text-xs ${
          model.fleetDelta > 0
            ? 'bg-amber-50 border border-amber-100 text-amber-700'
            : 'bg-blue-50 border border-blue-100 text-blue-700'
        }`}>
          At current demand, recommended fleet is <strong>{model.recommendedFleetSize} unit{model.recommendedFleetSize !== 1 ? 's' : ''}</strong> to run at {pct(TARGET_UTILISATION)} efficiency
          {model.fleetDelta > 0
            ? ` — consider adding ${model.fleetDelta} more.`
            : ` — ${Math.abs(model.fleetDelta)} unit${Math.abs(model.fleetDelta) !== 1 ? 's' : ''} appear underutilised.`}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const selectedStoreId = useUIStore((s) => s.selectedStoreId);
  const storeId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : undefined;

  const { data, isLoading, isError } = useAnalytics(storeId, days);
  const { data: forecast, isLoading: isForecastLoading } = useFleetForecast(storeId);
  const { data: confidence, isLoading: isConfidenceLoading } = useConfidenceReport(storeId);

  const analytics = data;
  const fleet = analytics?.fleet;
  const bookings = analytics?.bookings;
  const affiliates = analytics?.affiliates;

  // Channel split chart data — system channel a booking was created through
  // (WooCommerce was retired and is no longer tracked here).
  const channelData = bookings
    ? [
        { name: 'Online booking', value: bookings.channelSplit.direct ?? 0, fill: '#0d9488' },
        { name: 'Walk-in (system)', value: bookings.channelSplit.walk_in ?? 0, fill: '#6366f1' },
      ]
    : [];

  // Quarterly forecast chart data — one line per vehicle model, x-axis is quarter.
  const forecastModelNames = Array.from(
    new Set(forecast?.quarters.flatMap((q) => q.byModel.map((m) => m.modelName)) ?? []),
  );
  const forecastChartData = (forecast?.quarters ?? []).map((q) => {
    const row: Record<string, string | number> = {
      quarter: q.isCurrentQuarter ? `${q.label} (so far)` : q.label,
    };
    for (const m of q.byModel) row[m.modelName] = m.perDay;
    return row;
  });

  // Lead time chart data
  const leadTimeData = bookings
    ? [
        { name: 'Same day', value: bookings.leadTimeBuckets.same_day },
        { name: '1–3 days', value: bookings.leadTimeBuckets.one_to_three },
        { name: '4–7 days', value: bookings.leadTimeBuckets.four_to_seven },
        { name: '7+ days', value: bookings.leadTimeBuckets.seven_plus },
      ]
    : [];

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-teal-600" />
              Business Analytics
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">Fleet efficiency, revenue quality, and booking patterns</p>
          </div>

          {/* Period selector */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  days === p.value
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Loading analytics…
          </div>
        </div>
      )}

      {isError && (
        <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load analytics data. You may need the View Dashboard permission.
        </div>
      )}

      {analytics && (
        <div className="flex-1 p-6 space-y-8">

          {/* ── SECTION 1: Fleet Performance ─────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bike className="h-5 w-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800">Fleet Performance</h2>
              <span className="text-xs text-gray-400">last {days} days</span>
            </div>

            {/* Overall fleet stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatTile
                label="Overall utilisation"
                value={pct(fleet!.overall.utilisationRate)}
                sub={`Target: ${pct(TARGET_UTILISATION)}`}
                accent={fleet!.overall.utilisationRate >= TARGET_UTILISATION}
              />
              <StatTile
                label="RevPAB"
                value={formatPhp(fleet!.overall.revPAB)}
                sub="Revenue per available bike/day"
              />
              <StatTile
                label="Extension rate"
                value={pct(fleet!.overall.extensionRate)}
                sub="Rentals extended after booking"
              />
              <StatTile
                label="Cancellation rate"
                value={pct(fleet!.overall.cancellationRate)}
                sub="Share of orders placed in period that were cancelled"
              />
            </div>

            {/* Per-model cards */}
            {fleet!.byModel.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                No rental data found for this period
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {fleet!.byModel.map((model) => (
                  <FleetModelCard key={model.modelId} model={model} days={days} />
                ))}
              </div>
            )}
          </section>

          {/* ── SECTION 2: Booking Patterns ──────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800">Booking Patterns</h2>
              <span className="text-xs text-gray-400">last {days} days</span>
            </div>

            {/* Booking metric tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatTile
                label="Repeat customer rate"
                value={pct(bookings!.repeatCustomerRate)}
                sub={`${bookings!.returningCustomers} returning / ${bookings!.totalUniqueCustomers} unique`}
              />
              <StatTile
                label="Add-on attach rate"
                value={pct(bookings!.addonAttachRate)}
                sub="Bookings with at least one add-on"
              />
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium text-gray-500">Advance bookings</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {pct(
                    (bookings!.leadTimeBuckets.four_to_seven + bookings!.leadTimeBuckets.seven_plus) /
                    Math.max(
                      bookings!.leadTimeBuckets.same_day + bookings!.leadTimeBuckets.one_to_three +
                      bookings!.leadTimeBuckets.four_to_seven + bookings!.leadTimeBuckets.seven_plus,
                      1,
                    ),
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">booked 4+ days ahead</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium text-gray-500">Walk-in vs online</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{pct(bookings!.walkInShare)}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  customer-reported walk-in share ({bookings!.walkInResponses} responses)
                </p>
              </div>
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Booking channel chart */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-gray-400" /> Booking channel split
                </p>
                {channelData.every((d) => d.value === 0) ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No booking data</p>
                ) : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [v, 'Bookings']} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {channelData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-xs text-gray-500">
                    Online (direct app): <strong>{(bookings!.channelSplit.direct ?? 0)}</strong>
                  </span>
                  <span className="text-xs text-gray-500">
                    Walk-in (system): <strong>{bookings!.channelSplit.walk_in ?? 0}</strong>
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">
                  Reflects which internal tool created the booking — see "Walk-in vs online" above for the
                  customer-reported figure, which captures walk-ins staff booked through the direct flow too.
                </p>
              </div>

              {/* Lead time distribution chart */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-gray-400" /> Booking lead time
                </p>
                {leadTimeData.every((d) => d.value === 0) ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No booking data</p>
                ) : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={leadTimeData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v: number) => [v, 'Bookings']}
                          labelFormatter={(label) => `Lead time: ${label}`}
                        />
                        <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-3 text-xs text-gray-400">
                  How many days before pickup customers book. Higher advance = better for planning and partner commissions.
                </p>
              </div>
            </div>
          </section>

          {/* ── SECTION 3: Affiliate Bookings ─────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="h-5 w-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800">Affiliate Bookings</h2>
              <span className="text-xs text-gray-400">last {days} days</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <StatTile
                label="Bookings via affiliates"
                value={affiliates!.attributedBookings}
                sub={`${pct(affiliates!.attributedSharePct)} of ${affiliates!.totalBookings} bookings in period`}
                accent={affiliates!.attributedBookings > 0}
              />
              <StatTile
                label="Affiliates with bookings"
                value={affiliates!.byPartner.length}
                sub="Partners with at least 1 attributed booking"
              />
              <StatTile
                label="Top affiliate"
                value={affiliates!.byPartner[0]?.partnerName ?? '—'}
                sub={
                  affiliates!.byPartner[0]
                    ? `${affiliates!.byPartner[0].bookings} booking${affiliates!.byPartner[0].bookings !== 1 ? 's' : ''} — ${pct(
                        affiliates!.byPartner[0].bookings / Math.max(affiliates!.attributedBookings, 1),
                      )} of affiliate volume`
                    : 'No attributed bookings yet'
                }
              />
            </div>

            {affiliates!.byPartner.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                No affiliate-attributed bookings in this period
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                      <th className="px-4 py-2.5">Affiliate</th>
                      <th className="px-4 py-2.5 text-right">Bookings</th>
                      <th className="px-4 py-2.5 text-right">Scooters needed/day</th>
                      <th className="px-4 py-2.5 text-right">TukTuks needed/day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliates!.byPartner.map((p) => (
                      <tr key={p.partnerId} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{p.partnerName}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{p.bookings}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">
                          {p.scooterAvgPerDay !== null ? p.scooterAvgPerDay.toFixed(2) : `${p.scooterDays}d total`}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">
                          {p.tuktukAvgPerDay !== null ? p.tuktukAvgPerDay.toFixed(2) : `${p.tuktukDays}d total`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
                  Units-needed-per-day is only shown once a partner has {affiliates!.minBookingsForDailyAvg}+
                  attributed bookings in the period — below that, total rental-days are shown instead of a
                  daily average, since the average would be more noise than signal.
                </p>
              </div>
            )}
          </section>

          {/* ── SECTION 4: Quarterly Fleet Forecast ───────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800">Quarterly Fleet Forecast</h2>
              <span className="text-xs text-gray-400">70–80% target utilisation</span>
            </div>

            {isForecastLoading && (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                Loading forecast…
              </div>
            )}

            {!isForecastLoading && (!forecast || forecast.quarters.length === 0) && (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                Not enough rental history yet to build a quarterly forecast
              </div>
            )}

            {!isForecastLoading && forecast && forecast.quarters.length > 0 && (
              <>
                <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
                  <p className="text-sm font-semibold text-gray-800 mb-1">Rental-days per day, by quarter</p>
                  <p className="text-xs text-gray-400 mb-4">
                    Average daily demand for each vehicle type, per calendar quarter. Uses today's fleet size
                    against historical demand — not a snapshot of the fleet at that time.
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart data={forecastChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: 'units/day', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [v, 'units/day']} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {forecastModelNames.map((name, idx) => (
                          <Line
                            key={name}
                            type="monotone"
                            dataKey={name}
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        ))}
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {forecast.projection && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {forecast.projection.byModel.map((m) => (
                      <div key={m.modelId} className="rounded-xl border border-gray-200 bg-white p-5">
                        <p className="font-semibold text-gray-900">{m.modelName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Current fleet: {m.currentFleetSize} units</p>
                        <p className="mt-3 text-2xl font-bold text-gray-900">
                          {m.recommendedFleetRange.low === m.recommendedFleetRange.high
                            ? `${m.recommendedFleetRange.low} units`
                            : `${m.recommendedFleetRange.low}–${m.recommendedFleetRange.high} units`}
                        </p>
                        <p className="text-xs text-gray-400">
                          recommended for {forecast.projection!.label} to hold 70–80% utilisation
                          (mid target: {m.recommendedFleetRange.mid})
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          Projected demand: {m.projectedPerDay} units/day &middot; ~{m.projectedRentalDays} rental-days
                        </p>
                        {m.currentFleetSize !== m.recommendedFleetRange.mid && (
                          <div
                            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                              m.recommendedFleetRange.mid > m.currentFleetSize
                                ? 'bg-amber-50 border border-amber-100 text-amber-700'
                                : 'bg-blue-50 border border-blue-100 text-blue-700'
                            }`}
                          >
                            {m.recommendedFleetRange.mid > m.currentFleetSize
                              ? `Consider adding ${m.recommendedFleetRange.mid - m.currentFleetSize} unit(s) before ${forecast.projection!.label}.`
                              : `Current fleet may be ${m.currentFleetSize - m.recommendedFleetRange.mid} unit(s) larger than projected demand needs.`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {forecast.projection && (
                  <div
                    className={`mt-4 rounded-lg px-3 py-2 text-xs ${
                      forecast.projection.confidence === 'low'
                        ? 'bg-amber-50 border border-amber-100 text-amber-700'
                        : 'bg-blue-50 border border-blue-100 text-blue-700'
                    }`}
                  >
                    {forecast.projection.confidence === 'low' ? 'Low confidence: ' : 'Trend projection: '}
                    based on {forecast.projection.basedOnQuarters.join(', ')} only. This is a trailing-trend
                    projection, not a seasonal forecast — Siargao's high/low tourist season isn't detectable
                    yet with this little history. Revisit once 12+ months of clean data have accumulated.
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── SECTION 5: Customer Confidence ───────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-5 w-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800">Customer Confidence</h2>
              <span className="text-xs text-gray-400">issue-free rentals by quarter</span>
            </div>

            {isConfidenceLoading && (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                Loading confidence report…
              </div>
            )}

            {!isConfidenceLoading && (!confidence || confidence.quarters.length === 0) && (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                No quarterly customer data yet. Log breakdowns as they happen to start building this report.
              </div>
            )}

            {!isConfidenceLoading && confidence && confidence.quarters.length > 0 && (() => {
              const latestElapsed = [...confidence.quarters].reverse().find((q) => !q.isCurrentQuarter)
                ?? confidence.quarters[confidence.quarters.length - 1];
              const chartData = confidence.quarters.map((q) => ({
                quarter: q.isCurrentQuarter ? `${q.label} (so far)` : q.label,
                issueFreePct: Math.round(q.issueFreeRate * 100),
              }));
              const ISSUE_LABELS: Record<string, string> = {
                flat_tyre: 'Flat tyre',
                flat_battery: 'Flat / dead battery',
                engine_mechanical: 'Engine / mechanical',
                electrical: 'Electrical fault',
                other: 'Other',
              };

              function formatMins(mins: number | null): string {
                if (mins == null) return '—';
                if (mins < 60) return `${mins} min`;
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return m > 0 ? `${h}h ${m}m` : `${h}h`;
              }

              return (
                <>
                  <p className="text-xs text-gray-400 mb-4">
                    Headline numbers use {latestElapsed.isCurrentQuarter ? 'the current quarter so far' : latestElapsed.label}{' '}
                    (the latest fully elapsed quarter when available). Issue-free = customers whose rental had no accident and no breakdown.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                    <StatTile
                      label="Customers served"
                      value={latestElapsed.totalCustomers.toLocaleString()}
                      sub={latestElapsed.label}
                    />
                    <StatTile
                      label="Issue-free rate"
                      value={pct(latestElapsed.issueFreeRate)}
                      sub={`${latestElapsed.affectedCustomers} customer${latestElapsed.affectedCustomers !== 1 ? 's' : ''} had an issue`}
                      accent={latestElapsed.issueFreeRate >= 0.95}
                    />
                    <StatTile
                      label="Accidents"
                      value={latestElapsed.accidentCount}
                      sub="reports in quarter"
                    />
                    <StatTile
                      label="Breakdowns"
                      value={latestElapsed.breakdownCount}
                      sub="reports in quarter"
                    />
                    <StatTile
                      label="Avg. resolution"
                      value={formatMins(latestElapsed.avgResolutionMinutes)}
                      sub={
                        latestElapsed.pctResolvedWithin30Min != null
                          ? `${pct(latestElapsed.pctResolvedWithin30Min)} resolved in 30 min`
                          : 'no resolved breakdowns yet'
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-semibold text-gray-800 mb-4">Issue-free rate by quarter</p>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                            <Tooltip formatter={(v: number) => [`${v}%`, 'Issue-free']} />
                            <Bar dataKey="issueFreePct" fill="#0d9488" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-semibold text-gray-800 mb-1">Breakdown types — {latestElapsed.label}</p>
                      <p className="text-xs text-gray-400 mb-4">
                        {latestElapsed.breakdownCount} breakdown{latestElapsed.breakdownCount !== 1 ? 's' : ''} logged
                      </p>
                      {latestElapsed.breakdownCount === 0 ? (
                        <p className="text-sm text-gray-400 py-8 text-center">No breakdowns in this quarter</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(latestElapsed.issueTypeSplit).map(([key, count]) => (
                            <div key={key} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">{ISSUE_LABELS[key] ?? key}</span>
                              <span className="font-semibold text-gray-900">{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                          <th className="px-4 py-2.5">Quarter</th>
                          <th className="px-4 py-2.5 text-right">Customers</th>
                          <th className="px-4 py-2.5 text-right">Issue-free %</th>
                          <th className="px-4 py-2.5 text-right">Accidents</th>
                          <th className="px-4 py-2.5 text-right">Breakdowns</th>
                          <th className="px-4 py-2.5 text-right">Avg resolution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {confidence.quarters.map((q) => (
                          <tr key={q.label} className="border-b border-gray-50 last:border-0">
                            <td className="px-4 py-2.5 font-medium text-gray-900">
                              {q.label}{q.isCurrentQuarter ? ' (so far)' : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{q.totalCustomers.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{pct(q.issueFreeRate)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{q.accidentCount}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{q.breakdownCount}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{formatMins(q.avgResolutionMinutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
                      Copy these numbers for quarterly marketing — e.g. &ldquo;{latestElapsed.totalCustomers.toLocaleString()} customers, {pct(latestElapsed.issueFreeRate)} issue-free.&rdquo;
                    </p>
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      )}
    </div>
  );
}
