import { useState, useMemo } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useMaintenanceRecords } from '../../api/maintenance.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { Button } from '../../components/common/Button.js';
import { Select } from '../../components/common/Select.js';
import { MaintenanceLogModal } from '../../components/maintenance/MaintenanceLogModal.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import type { MaintenanceRecordSummary } from '../../types/api.js';

function moneyVal(v: number | { amount: number } | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return v.amount ?? 0;
}

const STATUS_COLOR: Record<string, 'gray' | 'yellow' | 'green'> = {
  Reported: 'gray',
  'In Progress': 'yellow',
  Completed: 'green',
};

function downtimeLabel(r: MaintenanceRecordSummary): string {
  if (!r.downtimeStart) return '—';
  const start = r.downtimeStart;
  const end = r.downtimeEnd;
  if (end) {
    const days = r.totalDowntimeDays ?? Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
    );
    return `${days}d`;
  }
  const days = Math.ceil(
    (Date.now() - new Date(start).getTime()) / 86_400_000,
  );
  return `${days}d (ongoing)`;
}

export default function MaintenancePage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: records, isLoading } = useMaintenanceRecords(storeId, statusFilter ? { status: statusFilter } : {});
  const list = (records ?? []) as MaintenanceRecordSummary[];

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        r.vehicleName?.toLowerCase().includes(q) ||
        r.issueDescription?.toLowerCase().includes(q) ||
        r.mechanic?.toLowerCase().includes(q),
    );
  }, [list, search]);

  const columns = [
    { key: 'vehicleName', header: 'Vehicle', render: (r: MaintenanceRecordSummary) => r.vehicleName ?? '—' },
    {
      key: 'issueDescription',
      header: 'Issue',
      render: (r: MaintenanceRecordSummary) => (
        <span className="line-clamp-1 max-w-[200px]">{r.issueDescription ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: MaintenanceRecordSummary) => (
        <Badge color={STATUS_COLOR[r.status] ?? 'gray'}>{r.status}</Badge>
      ),
    },
    {
      key: 'downtime',
      header: 'Downtime',
      render: (r: MaintenanceRecordSummary) => downtimeLabel(r),
    },
    { key: 'mechanic', header: 'Mechanic', render: (r: MaintenanceRecordSummary) => r.mechanic ?? '—' },
    {
      key: 'partsCost',
      header: 'Parts',
      render: (r: MaintenanceRecordSummary) => {
        const v = moneyVal(r.partsCost);
        return v > 0 ? formatCurrency(v) : '—';
      },
    },
    {
      key: 'laborCost',
      header: 'Labour',
      render: (r: MaintenanceRecordSummary) => {
        const v = moneyVal(r.laborCost);
        return v > 0 ? formatCurrency(v) : '—';
      },
    },
    {
      key: 'totalCost',
      header: 'Total',
      render: (r: MaintenanceRecordSummary) => {
        const v = moneyVal(r.totalCost);
        return v > 0 ? <span className="font-medium">{formatCurrency(v)}</span> : '—';
      },
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (r: MaintenanceRecordSummary) => formatDate(r.createdAt),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'Reported', label: 'Reported' },
              { value: 'In Progress', label: 'In Progress' },
              { value: 'Completed', label: 'Completed' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New Maintenance</Button>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vehicle, issue, mechanic..."
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : (
        <Table<MaintenanceRecordSummary>
          columns={columns}
          data={filtered}
          keyFn={(r) => r.id}
          onRowClick={(r) => setSelectedRecordId(r.id)}
          emptyMessage="No maintenance records"
        />
      )}

      {createOpen && storeId && (
        <MaintenanceLogModal open onClose={() => setCreateOpen(false)} mode="create" storeId={storeId} />
      )}
      {selectedRecordId && storeId && (
        <MaintenanceLogModal open onClose={() => setSelectedRecordId(null)} mode="view" storeId={storeId} recordId={selectedRecordId} />
      )}
    </div>
  );
}
