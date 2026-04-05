import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFleetUtilization } from '../../api/fleet.js';
import { useStores } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';

type Period = '7d' | '30d' | '90d' | 'custom';

export default function UtilizationDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState<string>('all');

  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;

  const params =
    period === 'custom' && from && to
      ? { from, to, storeId: storeId === 'all' ? undefined : storeId }
      : { period: period === 'custom' ? '30d' : period, storeId: storeId === 'all' ? undefined : storeId };

  const { data, isLoading, error } = useFleetUtilization(params);

  const result = data as {
    from: string;
    to: string;
    fleetKpis: {
      utilisationPercent: number;
      averageRevenuePerVehicle: number;
      totalDowntimeDays: number;
      totalRentalDays: number;
      totalRevenue: number;
      vehicleCount: number;
    };
    vehicles: Array<{
      vehicleId: string;
      vehicleName: string;
      storeId: string;
      rentalDays: number;
      revenue: number;
      downtimeDays: number;
      utilisationRate: number;
    }>;
    previousPeriod?: { fleetKpis: typeof result.fleetKpis };
    deltas?: {
      utilisationPercentDelta: number;
      averageRevenuePerVehicleDelta: number;
      totalDowntimeDaysDelta: number;
    };
  } | undefined;

  const getStoreName = (id: string) => storeList.find((s) => s.id === id)?.name ?? id;

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading utilization...</div>;
  if (error) return <div className="py-12 text-center text-red-600">{(error as Error).message}</div>;
  if (!result) return null;

  const { fleetKpis, vehicles, deltas } = result;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Fleet utilization</h1>
          <Link to="/fleet" className="text-sm text-blue-600 hover:underline">
            ← Back to fleet
          </Link>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="border-l-2 border-teal-500 pl-3">
            <p className="mb-1 text-xs text-gray-400">Viewing:</p>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All stores</option>
              {storeList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Overrides your default store for this page</p>
          </div>
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            {(['7d', '30d', '90d', 'custom'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-sm ${period === p ? 'bg-gray-200 font-medium' : 'text-gray-600'}`}
              >
                {p === 'custom' ? 'Custom' : p}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </>
          )}
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Period: {result.from} to {result.to}
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Utilization %</p>
          <p className="text-2xl font-bold text-gray-900">{fleetKpis.utilisationPercent}%</p>
          {deltas && (
            <p className={`text-xs ${deltas.utilisationPercentDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {deltas.utilisationPercentDelta >= 0 ? '↑' : '↓'} {Math.abs(deltas.utilisationPercentDelta)}% vs previous period
            </p>
          )}
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Avg revenue per vehicle</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(fleetKpis.averageRevenuePerVehicle)}</p>
          {deltas && (
            <p className={`text-xs ${deltas.averageRevenuePerVehicleDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {deltas.averageRevenuePerVehicleDelta >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(deltas.averageRevenuePerVehicleDelta))} vs previous period
            </p>
          )}
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total downtime (days)</p>
          <p className="text-2xl font-bold text-gray-900">{fleetKpis.totalDowntimeDays}</p>
          {deltas && (
            <p className={`text-xs ${deltas.totalDowntimeDaysDelta <= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {deltas.totalDowntimeDaysDelta >= 0 ? '↑' : '↓'} {Math.abs(deltas.totalDowntimeDaysDelta)} days vs previous period
            </p>
          )}
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Vehicles</p>
          <p className="text-2xl font-bold text-gray-900">{fleetKpis.vehicleCount}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vehicle</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Store</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Rental days</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Revenue</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Downtime (days)</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Utilization %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {vehicles.map((v) => (
              <tr key={v.vehicleId}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{v.vehicleName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{getStoreName(v.storeId)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900">{v.rentalDays}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(v.revenue)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900">{v.downtimeDays}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900">{v.utilisationRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {vehicles.length === 0 && <div className="py-8 text-center text-sm text-gray-500">No vehicles in scope for this period.</div>}
    </div>
  );
}
