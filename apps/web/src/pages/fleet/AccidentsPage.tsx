import { useState } from 'react';
import { AlertTriangle, Plus, ChevronRight } from 'lucide-react';
import { useAccidents } from '../../api/accidents.js';
import type { AccidentReport } from '../../api/accidents.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Badge } from '../../components/common/Badge.js';
import { AccidentReportModal } from '../../components/accidents/AccidentReportModal.js';
import { AccidentDetailModal } from '../../components/accidents/AccidentDetailModal.js';

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AccidentsPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useAccidents(
    storeId,
    statusFilter !== 'all' ? { status: statusFilter } : {},
  ) as { data: AccidentReport[]; isLoading: boolean };

  const filtered = reports.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const vehicleName = (r.fleet as { name?: string } | null)?.name ?? '';
    const orderRef = (r.orders as { booking_token?: string } | null)?.booking_token ?? '';
    const customer = r.orders
      ? ((r.orders as { customers?: { name?: string } | null } | null)?.customers?.name ?? '')
      : '';
    return (
      vehicleName.toLowerCase().includes(q) ||
      orderRef.toLowerCase().includes(q) ||
      customer.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    );
  });

  const openCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-red-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Accident Reports</h1>
            <p className="text-sm text-gray-500">
              {reports.length} total report{reports.length !== 1 ? 's' : ''}
              {openCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {openCount} open
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 active:scale-95 transition"
        >
          <Plus className="h-4 w-4" />
          Report Accident
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['all', 'open', 'closed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vehicle, order, customer..."
          className="flex-1 min-w-48 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">No accident reports found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Flags</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const vehicleName = (r.fleet as { name?: string } | null)?.name ?? '—';
                const plateNumber = (r.fleet as { plate_number?: string } | null)?.plate_number ?? '';
                const orderRef = (r.orders as { booking_token?: string } | null)?.booking_token ?? '—';
                const customerName = (r.orders as { customers?: { name?: string } | null } | null)?.customers?.name ?? '—';

                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setDetailId(r.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {formatDt(r.accidentAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{vehicleName}</div>
                      {plateNumber && <div className="text-xs text-gray-400">{plateNumber}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 font-mono text-xs">
                      {orderRef}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{customerName}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.customerInjured && <Badge color="red">Injured</Badge>}
                        {r.policeReportFiled && <Badge color="blue">Police</Badge>}
                        {r.peaceOfMindActive && <Badge color="green">POM</Badge>}
                        {r.emergencyServicesCalled && <Badge color="amber">Emergency</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={r.status === 'open' ? 'red' : 'gray'}>
                        {r.status === 'open' ? 'Open' : 'Closed'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AccidentReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSuccess={() => setReportOpen(false)}
      />

      {detailId && (
        <AccidentDetailModal
          open={!!detailId}
          onClose={() => setDetailId(null)}
          reportId={detailId}
        />
      )}
    </div>
  );
}
