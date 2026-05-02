import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp, Bike, Users, Calendar, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useAnalytics, type FleetModelMetrics } from '../../api/analytics.js';
import { useUIStore } from '../../stores/ui-store.js';

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

  const analytics = data;
  const fleet = analytics?.fleet;
  const bookings = analytics?.bookings;

  // Channel split chart data
  const channelData = bookings
    ? [
        { name: 'Online booking', value: (bookings.channelSplit.direct ?? 0) + (bookings.channelSplit.woocommerce ?? 0), fill: '#0d9488' },
        { name: 'Walk-in', value: bookings.channelSplit.walk_in ?? 0, fill: '#6366f1' },
      ]
    : [];

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
                sub={`${fleet!.overall.totalRentals} active rentals in period`}
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
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {pct(
                    (bookings!.channelSplit.walk_in ?? 0) /
                    Math.max(
                      Object.values(bookings!.channelSplit).reduce((s, v) => s + v, 0),
                      1,
                    ),
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">walk-in share</p>
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
                    WooCommerce: <strong>{bookings!.channelSplit.woocommerce ?? 0}</strong>
                  </span>
                  <span className="text-xs text-gray-500">
                    Walk-in: <strong>{bookings!.channelSplit.walk_in ?? 0}</strong>
                  </span>
                </div>
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
        </div>
      )}
    </div>
  );
}
