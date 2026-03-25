import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFleet, useFleetSync } from '../../api/fleet.js';
import { useStores, useVehicleModels } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { VehicleModal } from '../../components/fleet/VehicleModal.js';
import { AddVehicleModal } from '../../components/fleet/AddVehicleModal.js';
import { AssetManagementModal } from '../../components/fleet/AssetManagementModal.js';
import { ServiceHistoryModal } from '../../components/fleet/ServiceHistoryModal.js';
import { formatDate } from '../../utils/date.js';
import type { VehicleSummary } from '../../types/api.js';

const STATUS_COLOR: Record<string, 'green' | 'blue' | 'yellow' | 'gray' | 'red'> = {
  Available: 'green',
  Active: 'blue',
  'Under Maintenance': 'yellow',
  'Service Vehicle': 'gray',
  Sold: 'red',
  Closed: 'red',
  'Pending ORCR': 'yellow',
};

function isOrcrExpiringSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const expiry = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= 30;
}

export default function FleetPage() {
  const defaultStoreId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [fleetStoreFilter, setFleetStoreFilter] = useState<string>(defaultStoreId || 'all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [assetVehicleId, setAssetVehicleId] = useState<string | null>(null);
  const [serviceHistoryVehicle, setServiceHistoryVehicle] = useState<{ id: string; name: string; storeId: string } | null>(null);

  const storeIdForApi = fleetStoreFilter === 'all' || !fleetStoreFilter ? 'all' : fleetStoreFilter;
  const { data: vehicles, isLoading } = useFleet(storeIdForApi) as {
    data: VehicleSummary[] | undefined;
    isLoading: boolean;
  };
  const { data: stores = [] } = useStores();
  const { data: models = [] } = useVehicleModels();
  const syncFleet = useFleetSync();

  useEffect(() => {
    syncFleet.mutate();
  }, []);

  const storeList = stores as Array<{ id: string; name: string }>;
  const modelList = models as Array<{ id: string; name: string }>;
  const getModelNameById = (id: string | null | undefined) => {
    if (!id) return '—';
    return modelList.find((m) => m.id === id)?.name ?? id;
  };
  const filtered = (vehicles ?? []).filter(
    (v) =>
      v.name?.toLowerCase().includes(search.toLowerCase()) ||
      (v.plateNumber && String(v.plateNumber).toLowerCase().includes(search.toLowerCase())),
  );

  const statusColor = (s: string) => STATUS_COLOR[s] ?? 'gray';
  const getStoreName = (id: string) => storeList.find((s) => s.id === id)?.name ?? id;

  const columns = [
    { key: 'name', header: 'Vehicle' },
    { key: 'modelId', header: 'Model', render: (r: VehicleSummary) => getModelNameById(r.modelId) },
    { key: 'plateNumber', header: 'Plate', render: (r: VehicleSummary) => r.plateNumber ?? '—' },
    { key: 'storeId', header: 'Store', render: (r: VehicleSummary) => getStoreName(r.storeId) },
    {
      key: 'status',
      header: 'Status',
      render: (r: VehicleSummary) => <Badge color={statusColor(r.status)}>{r.status}</Badge>,
    },
    { key: 'currentMileage', header: 'Mileage', render: (r: VehicleSummary) => r.currentMileage ?? '—' },
    { key: 'gpsId', header: 'GPS ID', render: (r: VehicleSummary) => r.gpsId ?? '—' },
    {
      key: 'orcrExpiryDate',
      header: 'ORCR expiry',
      render: (r: VehicleSummary) => (r.orcrExpiryDate ? formatDate(r.orcrExpiryDate) : '—'),
    },
    {
      key: 'surfRack',
      header: 'Surf rack',
      render: (r: VehicleSummary) => (r.surfRack ? 'Yes' : '—'),
    },
    {
      key: 'actions',
      header: '',
      render: (r: VehicleSummary) => (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setServiceHistoryVehicle({ id: r.id, name: r.name, storeId: r.storeId }); }}
            className="text-sm text-blue-600 hover:underline"
          >
            Service History
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAssetVehicleId(r.id); }}
            className="text-sm text-blue-600 hover:underline"
          >
            Asset
          </button>
        </div>
      ),
    },
  ];

  const getRowClassName = (r: VehicleSummary) =>
    isOrcrExpiringSoon(r.orcrExpiryDate) ? 'bg-amber-50' : '';

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading fleet...</div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Fleet</h1>
          <Link
            to="/fleet/utilization"
            className="text-sm text-blue-600 hover:underline"
          >
            Utilization dashboard
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={fleetStoreFilter}
            onChange={(e) => setFleetStoreFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All stores</option>
            {storeList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or plate..."
            className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-md px-3 py-1.5 text-sm ${viewMode === 'list' ? 'bg-gray-200 font-medium' : 'text-gray-600'}`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-md px-3 py-1.5 text-sm ${viewMode === 'grid' ? 'bg-gray-200 font-medium' : 'text-gray-600'}`}
            >
              Grid
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAddVehicleOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add vehicle
          </button>
        </div>
      </div>

      {viewMode === 'list' && (
        <Table
          columns={columns}
          data={filtered}
          keyFn={(r) => r.id}
          onRowClick={(r) => setEditVehicleId(r.id)}
          getRowClassName={getRowClassName}
          emptyMessage="No vehicles found"
        />
      )}

      {viewMode === 'grid' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <div
              key={v.id}
              onClick={() => setEditVehicleId(v.id)}
              className={`cursor-pointer rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md ${getRowClassName(v)}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">{v.name}</p>
                  <p className="text-sm text-gray-500">{getModelNameById(v.modelId)} · {v.plateNumber ?? '—'}</p>
                </div>
                <Badge color={statusColor(v.status)}>{v.status}</Badge>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
                <dt>Store</dt>
                <dd>{getStoreName(v.storeId)}</dd>
                <dt>Mileage</dt>
                <dd>{v.currentMileage ?? '—'}</dd>
                <dt>ORCR expiry</dt>
                <dd>{v.orcrExpiryDate ? formatDate(v.orcrExpiryDate) : '—'}</dd>
                <dt>Surf rack</dt>
                <dd>{v.surfRack ? 'Yes' : '—'}</dd>
              </dl>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setServiceHistoryVehicle({ id: v.id, name: v.name, storeId: v.storeId }); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Service History
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setAssetVehicleId(v.id); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Asset
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {filtered.length === 0 && viewMode === 'grid' && (
        <div className="py-12 text-center text-sm text-gray-500">No vehicles found</div>
      )}

      {editVehicleId && (
        <VehicleModal
          open
          onClose={() => setEditVehicleId(null)}
          vehicleId={editVehicleId}
        />
      )}
      {addVehicleOpen && (
        <AddVehicleModal open onClose={() => setAddVehicleOpen(false)} />
      )}
      {assetVehicleId && (
        <AssetManagementModal
          open
          onClose={() => setAssetVehicleId(null)}
          vehicleId={assetVehicleId}
        />
      )}
      {serviceHistoryVehicle && (
        <ServiceHistoryModal
          open
          onClose={() => setServiceHistoryVehicle(null)}
          vehicleId={serviceHistoryVehicle.id}
          vehicleName={serviceHistoryVehicle.name}
          storeId={serviceHistoryVehicle.storeId}
        />
      )}
    </div>
  );
}
