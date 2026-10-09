import { useState } from 'react';
import { AlertCircle, Plus, ChevronRight } from 'lucide-react';
import { useBreakdowns, ISSUE_TYPE_LABELS, RESOLUTION_TYPE_LABELS } from '../../api/breakdowns.js';
import type { BreakdownReport } from '../../api/breakdowns.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Badge } from '../../components/common/Badge.js';
import { BreakdownReportModal } from '../../components/breakdowns/BreakdownReportModal.js';
import { BreakdownDetailModal } from '../../components/breakdowns/BreakdownDetailModal.js';

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatMinutes(mins: number | null): string {
  if (mins == null) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function BreakdownsPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useBreakdowns(storeId) as { data: BreakdownReport[]; isLoading: boolean };

  const filtered = reports.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.fleet?.name ?? '').toLowerCase().includes(q) ||
      (r.orderReference ?? '').toLowerCase().includes(q) ||
      (r.customerName ?? '').toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    );
  });

  const openCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Breakdown Reports</h1>
            <p className="text-sm text-gray-500">
              {reports.length} report{reports.length !== 1 ? 's' : ''} on record
              {openCount > 0 && <span className="ml-1 text-amber-600">· {openCount} open</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 active:scale-95 transition"
        >
          <Plus className="h-4 w-4" />
          Report Breakdown
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vehicle, order, customer..."
          className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
        <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden">
          {(['all', 'open', 'resolved'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                statusFilter === s ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">No breakdown reports found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Resolution Time</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setDetailId(r.id)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {formatDt(r.breakdownAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{r.fleet?.name ?? '—'}</div>
                    {r.fleet?.plateNumber && <div className="text-xs text-gray-400">{r.fleet.plateNumber}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700">
                    {r.orderReference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.customerName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color="amber">{ISSUE_TYPE_LABELS[r.issueType]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'open' ? (
                      <Badge color="red">Open</Badge>
                    ) : (
                      <Badge color="green">{r.resolutionType ? RESOLUTION_TYPE_LABELS[r.resolutionType] : 'Resolved'}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatMinutes(r.resolutionMinutes)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BreakdownReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSuccess={() => setReportOpen(false)}
      />

      {detailId && (
        <BreakdownDetailModal
          open={!!detailId}
          onClose={() => setDetailId(null)}
          reportId={detailId}
        />
      )}
    </div>
  );
}
