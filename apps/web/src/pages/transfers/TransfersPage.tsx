import { useState, useMemo } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useTransfers, moneyAmount, type TransferRow } from '../../api/transfers.js';
import { Badge } from '../../components/common/Badge.js';
import { formatDate } from '../../utils/date.js';
import { formatCurrency } from '../../utils/currency.js';
import { AddTransferModal } from '../../components/transfers/AddTransferModal.js';
import { TransferPaymentModal } from '../../components/transfers/TransferPaymentModal.js';
import { DriverPaymentModal } from '../../components/transfers/DriverPaymentModal.js';

const PAYMENT_STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red'> = {
  Paid: 'green',
  'Partially Paid': 'yellow',
  Pending: 'red',
};

const CUSTOMER_TYPE_COLORS: Record<string, 'blue' | 'purple'> = {
  'Walk-in': 'blue',
  Online: 'purple',
};

export default function TransfersPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showAddModal, setShowAddModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<TransferRow | null>(null);
  const [driverTarget, setDriverTarget] = useState<TransferRow | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data: transfers, isLoading } = useTransfers(storeId, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    paymentStatus: paymentFilter || undefined,
  });

  const filtered = useMemo(() => {
    if (!transfers) return [];
    if (!search.trim()) return transfers;
    const q = search.toLowerCase();
    return transfers.filter(
      (t) =>
        t.customerName.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.contactNumber && t.contactNumber.toLowerCase().includes(q)) ||
        t.route.toLowerCase().includes(q),
    );
  }, [transfers, search]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
    }
  }

  if (!storeId) {
    return (
      <div className="py-12 text-center text-gray-500">
        Select a store to view transfers.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Transfers</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Transfer
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-500">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500">Payment Status</span>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="mt-1 block w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
          </select>
        </label>
        <label className="block flex-1">
          <span className="text-xs font-medium text-gray-500">Search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer name, contact, route, or ID..."
            className="mt-1 block w-full min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {(dateFrom || dateTo || paymentFilter || search) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setPaymentFilter(''); setSearch(''); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* Batch actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-blue-300 px-2 py-1 text-xs hover:bg-blue-100"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading transfers...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {transfers && transfers.length > 0 ? 'No transfers match your search.' : 'No transfers found.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contact</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Route</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Pax</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Van</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Total</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Driver Fee</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Net Profit</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Payment</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Driver Paid</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((t) => {
                const total = moneyAmount(t.totalPrice);
                const driverFee = moneyAmount(t.driverFee);
                const netProfit = moneyAmount(t.netProfit) || (total - driverFee);
                const isExpanded = expandedRow === t.id;
                return (
                  <>
                    <tr
                      key={t.id}
                      onClick={() => setExpandedRow(isExpanded ? null : t.id)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">
                        {formatDate(t.serviceDate)}
                        {t.flightTime && (
                          <span className="ml-1 text-xs text-gray-500">{t.flightTime}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-gray-900">{t.customerName}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{t.contactNumber ?? '—'}</td>
                      <td className="px-3 py-3 text-sm">
                        {t.customerType ? (
                          <Badge color={CUSTOMER_TYPE_COLORS[t.customerType] ?? 'gray'}>{t.customerType}</Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-900">{t.route}</td>
                      <td className="px-3 py-3 text-center text-sm text-gray-900">{t.paxCount}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{t.vanType ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-gray-900">
                        {formatCurrency(total)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-600">
                        {driverFee > 0 ? formatCurrency(driverFee) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-gray-900">
                        {total > 0 ? formatCurrency(netProfit) : '—'}
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <Badge color={PAYMENT_STATUS_COLORS[t.paymentStatus] ?? 'gray'}>
                          {t.paymentStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        {t.driverPaidStatus === 'Paid' ? (
                          <Badge color="green">Paid</Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">{t.bookingSource ?? '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${t.id}-actions`}>
                        <td colSpan={14} className="bg-gray-50 px-6 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            {t.paymentStatus !== 'Paid' && (
                              <button
                                onClick={() => { setPaymentTarget(t); setExpandedRow(null); }}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                              >
                                Record Payment
                              </button>
                            )}
                            {t.driverPaidStatus !== 'Paid' && (
                              <button
                                onClick={() => { setDriverTarget(t); setExpandedRow(null); }}
                                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                              >
                                Record Driver Payment
                              </button>
                            )}
                            <div className="ml-auto space-y-0.5 text-right text-xs text-gray-500">
                              {t.accommodation && <p>Hotel: {t.accommodation}</p>}
                              {t.opsNotes && <p>Notes: {t.opsNotes}</p>}
                              {t.customerEmail && <p>Email: {t.customerEmail}</p>}
                              <p className="font-mono text-gray-400">{t.id}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          <span>{filtered.length} transfer{filtered.length !== 1 ? 's' : ''}</span>
          <span>
            Total: <span className="font-medium text-gray-900">{formatCurrency(filtered.reduce((s, t) => s + moneyAmount(t.totalPrice), 0))}</span>
          </span>
          <span>
            Driver Fees: <span className="font-medium text-gray-900">{formatCurrency(filtered.reduce((s, t) => s + moneyAmount(t.driverFee), 0))}</span>
          </span>
          <span>
            Net Profit: <span className="font-medium text-gray-900">
              {formatCurrency(
                filtered.reduce((s, t) => {
                  const tot = moneyAmount(t.totalPrice);
                  const fee = moneyAmount(t.driverFee);
                  return s + (moneyAmount(t.netProfit) || (tot - fee));
                }, 0),
              )}
            </span>
          </span>
        </div>
      )}

      {/* Modals */}
      <AddTransferModal open={showAddModal} onClose={() => setShowAddModal(false)} storeId={storeId} />
      {paymentTarget && (
        <TransferPaymentModal
          open={!!paymentTarget}
          onClose={() => setPaymentTarget(null)}
          transfer={paymentTarget}
          storeId={storeId}
        />
      )}
      {driverTarget && (
        <DriverPaymentModal
          open={!!driverTarget}
          onClose={() => setDriverTarget(null)}
          transfer={driverTarget}
          storeId={storeId}
        />
      )}
    </div>
  );
}
