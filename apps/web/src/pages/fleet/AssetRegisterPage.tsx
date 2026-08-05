import { useMemo, useState } from 'react';
import { useFleet } from '../../api/fleet.js';
import { useStores, useVehicleModels } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import { Badge } from '../../components/common/Badge.js';
import type { VehicleSummary } from '../../types/api.js';

const TODAY = new Date();
const TODAY_LABEL = TODAY.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

type AssetStatus = 'Active' | 'Retired' | 'Sold';
type StatusFilter = 'All' | AssetStatus;

const ACTIVE_STATUSES = new Set(['Available', 'Active', 'Service Vehicle']);

function assetStatus(fleetStatus: string): AssetStatus {
  if (fleetStatus === 'Sold') return 'Sold';
  if (ACTIVE_STATUSES.has(fleetStatus)) return 'Active';
  return 'Retired';
}

function calcMonthlyDep(v: VehicleSummary): number {
  if (!v.usefulLifeMonths || v.usefulLifeMonths <= 0) return 0;
  const purchasePrice = v.purchasePrice ?? 0;
  const salvage = v.salvageValue ?? 0;
  const bookVal = v.bookValue ?? 0;
  if (bookVal <= salvage) return 0;
  return Math.max(0, (purchasePrice - salvage) / v.usefulLifeMonths);
}

function monthsSince(dateStr: string): number {
  const d = new Date(dateStr);
  return (
    (TODAY.getFullYear() - d.getFullYear()) * 12 +
    (TODAY.getMonth() - d.getMonth())
  );
}

function bookValueColorClass(v: VehicleSummary): string {
  if (v.purchasePrice == null || v.purchasePrice === 0) return 'text-gray-700';
  const bv = v.bookValue ?? 0;
  if (bv <= v.purchasePrice * 0.10) return 'text-red-600 font-medium';
  if (bv >= v.purchasePrice * 0.75) return 'text-green-600 font-medium';
  return 'text-gray-700';
}

function StatusBadge({ v }: { v: VehicleSummary }) {
  const s = assetStatus(v.status);
  const fullyDep = (v.bookValue ?? 0) <= (v.salvageValue ?? 0);
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge color={s === 'Active' ? 'green' : s === 'Retired' ? 'amber' : 'gray'}>{s}</Badge>
      {fullyDep && <Badge color="amber">Fully depreciated</Badge>}
    </span>
  );
}

export default function AssetRegisterPage() {
  const [storeFilter, setStoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  const { data: allVehicles = [], isLoading } = useFleet('all');
  const { data: stores = [] } = useStores();
  const { data: models = [] } = useVehicleModels();

  const storeList = stores as Array<{ id: string; name: string }>;
  const modelList = models as Array<{ id: string; name: string }>;

  const getModelName = (id: string | null | undefined) =>
    modelList.find((m) => m.id === id)?.name ?? null;
  const getStoreName = (id: string) =>
    storeList.find((s) => s.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    let list = allVehicles;
    if (storeFilter !== 'all') list = list.filter((v) => v.storeId === storeFilter);
    if (statusFilter !== 'All') list = list.filter((v) => assetStatus(v.status) === statusFilter);
    return list;
  }, [allVehicles, storeFilter, statusFilter]);

  const summary = useMemo(() => {
    const totalAssetCost = filtered.reduce((s, v) => s + (v.purchasePrice ?? v.totalBikeCost ?? 0), 0);
    const totalBookValue = filtered.reduce((s, v) => s + (v.bookValue ?? 0), 0);
    const totalMonthlyDep = filtered.reduce((s, v) => s + calcMonthlyDep(v), 0);

    const withAge = filtered.filter((v) => v.purchaseDate && (v.purchasePrice ?? v.totalBikeCost ?? 0) > 0);
    const weightSum = withAge.reduce((s, v) => s + (v.purchasePrice ?? v.totalBikeCost ?? 0), 0);
    const weightedAgeSum = withAge.reduce((s, v) => {
      const weight = v.purchasePrice ?? v.totalBikeCost ?? 0;
      return s + monthsSince(v.purchaseDate!) * weight;
    }, 0);
    const avgAgeMonths = weightSum > 0 ? Math.round(weightedAgeSum / weightSum) : 0;

    return { totalAssetCost, totalBookValue, totalMonthlyDep, avgAgeMonths };
  }, [filtered]);

  const totals = useMemo(() => ({
    cost: filtered.reduce((s, v) => s + (v.purchasePrice ?? v.totalBikeCost ?? 0), 0),
    accumDep: filtered.reduce((s, v) => s + (v.accumulatedDepreciation ?? 0), 0),
    bookValue: filtered.reduce((s, v) => s + (v.bookValue ?? 0), 0),
    monthlyDep: filtered.reduce((s, v) => s + calcMonthlyDep(v), 0),
  }), [filtered]);

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading asset register…</div>;

  return (
    <div className="font-lato">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl text-teal-brand">Asset Register</h1>
          <p className="mt-0.5 text-sm text-gray-500">Fixed asset schedule as at {TODAY_LABEL}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* POST DEPRECIATION BUTTON — added in separate session */}
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
        >
          <option value="all">All stores</option>
          {storeList.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          {(['All', 'Active', 'Retired', 'Sold'] as StatusFilter[]).map((opt, i) => (
            <button
              key={opt}
              type="button"
              onClick={() => setStatusFilter(opt)}
              className={[
                'px-3 py-2 text-sm font-medium transition',
                i > 0 ? 'border-l border-gray-200' : '',
                statusFilter === opt
                  ? 'bg-teal-brand text-white'
                  : 'bg-white text-charcoal-brand hover:bg-gray-50',
              ].join(' ')}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Asset Cost</p>
          <p className="mt-1 font-lato text-xl font-bold tabular-nums text-gray-900">
            {formatCurrency(summary.totalAssetCost)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Book Value</p>
          <p className="mt-1 font-lato text-xl font-bold tabular-nums text-gray-900">
            {formatCurrency(summary.totalBookValue)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Monthly Dep.</p>
          <p className="mt-1 font-lato text-xl font-bold tabular-nums text-gray-900">
            {formatCurrency(summary.totalMonthlyDep)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Avg. Asset Age</p>
          <p className="mt-1 font-lato text-xl font-bold tabular-nums text-gray-900">
            {summary.avgAgeMonths} <span className="text-sm font-normal text-gray-500">mo.</span>
          </p>
        </div>
      </div>

      {/* ── Asset register table ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">No assets found</div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Asset</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Store</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Purchase Date</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Cost</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Accum. Dep.</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Book Value</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Monthly Dep.</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const monthlyDep = calcMonthlyDep(v);
                  const fullyDep = (v.bookValue ?? 0) <= (v.salvageValue ?? 0);
                  const modelName = getModelName(v.modelId);
                  const cost = v.purchasePrice ?? v.totalBikeCost ?? 0;
                  return (
                    <tr
                      key={v.id}
                      className={`border-b border-gray-100 ${fullyDep ? 'opacity-75' : ''}`}
                    >
                      <td className="px-4 py-3 text-gray-900">
                        <span className="font-medium">{v.name}</span>
                        {modelName && (
                          <span className="ml-1 text-xs text-gray-500">· {modelName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{getStoreName(v.storeId)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {v.purchaseDate ? formatDate(v.purchaseDate) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-lato tabular-nums text-gray-700">
                        {cost > 0 ? formatCurrency(cost) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-lato tabular-nums text-gray-700">
                        {(v.accumulatedDepreciation ?? 0) > 0
                          ? formatCurrency(v.accumulatedDepreciation ?? 0)
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-lato tabular-nums ${bookValueColorClass(v)}`}>
                        {formatCurrency(v.bookValue ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-lato tabular-nums">
                        {monthlyDep > 0
                          ? <span className="text-gray-700">{formatCurrency(monthlyDep)}</span>
                          : <span className="text-gray-400">₱0.00</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge v={v} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* ── Totals row ────────────────────────────────────────── */}
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 font-semibold text-gray-700">Totals</td>
                  <td className="px-4 py-3 text-right font-lato font-bold tabular-nums text-gray-900">
                    {formatCurrency(totals.cost)}
                  </td>
                  <td className="px-4 py-3 text-right font-lato font-bold tabular-nums text-gray-900">
                    {formatCurrency(totals.accumDep)}
                  </td>
                  <td className="px-4 py-3 text-right font-lato font-bold tabular-nums text-gray-900">
                    {formatCurrency(totals.bookValue)}
                  </td>
                  <td className="px-4 py-3 text-right font-lato font-bold tabular-nums text-gray-900">
                    {formatCurrency(totals.monthlyDep)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
