import React, { useState, useMemo } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useTransfers, notifyDriver, moneyAmount, type TransferRow } from '../../api/transfers.js';
import { useToast } from '../../hooks/useToast.js';
import { Badge } from '../../components/common/Badge.js';
import { formatDate } from '../../utils/date.js';
import { formatCurrency } from '../../utils/currency.js';
import { AddTransferModal } from '../../components/transfers/AddTransferModal.js';
import { TransferPaymentModal } from '../../components/transfers/TransferPaymentModal.js';
import { DriverPaymentModal } from '../../components/transfers/DriverPaymentModal.js';
import { CollectTransferModal } from '../../components/transfers/CollectTransferModal.js';

/** Returns true when the route originates from General Luna (GL→IAO direction).
 *  The driver needs to collect the customer from their accommodation, so the
 *  pickup/accommodation field is operationally meaningful for these rows. */
function isGlToIao(route: string): boolean {
  const first = route.split(/→|->/).map((s) => s.trim().toLowerCase())[0] ?? '';
  return first.includes('luna') || first.includes('general');
}

const PAYMENT_STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red'> = {
  Paid: 'green',
  'Partially Paid': 'yellow',
  Pending: 'red',
};

const CUSTOMER_TYPE_COLORS: Record<string, 'blue' | 'purple'> = {
  'Walk-in': 'blue',
  Online: 'purple',
};

type TransferTab = 'upcoming' | 'unpaid' | 'completed';

/** Compute the driver cut for a single transfer given the route's driver_cut and pricing_type. */
function computeDriverCut(t: TransferRow): number {
  const cut = t.routeDriverCut ?? 0;
  if (cut === 0) return 0;
  return t.routePricingType === 'per_head' ? cut * t.paxCount : cut;
}

export default function TransfersPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';

  const [activeTab, setActiveTab] = useState<TransferTab>('upcoming');
  const [completedDateFrom, setCompletedDateFrom] = useState('');
  const [completedDateTo, setCompletedDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showAddModal, setShowAddModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<TransferRow | null>(null);
  const [driverTarget, setDriverTarget] = useState<TransferRow | null>(null);
  const [collectTarget, setCollectTarget] = useState<TransferRow | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const transferFilters = useMemo(() => {
    if (activeTab === 'upcoming') {
      return { dateFrom: todayStr };
    }
    if (activeTab === 'unpaid') {
      return { driverPaidStatus: 'unpaid' };
    }
    return {
      dateTo: completedDateTo || todayStr,
      ...(completedDateFrom ? { dateFrom: completedDateFrom } : {}),
    };
  }, [activeTab, completedDateFrom, completedDateTo, todayStr]);

  const { data: transfers, isLoading } = useTransfers(storeId, transferFilters);
  const { toasts, pushToast } = useToast();
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

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

  // Settlement summary derived from the visible rows
  const settlement = useMemo(() => {
    const outstanding = filtered.filter((t) => !t.collectedAt);
    const collected = filtered.filter((t) => !!t.collectedAt);
    const outstandingTotal = outstanding.reduce((s, t) => s + moneyAmount(t.totalPrice), 0);
    const collectedTotal = collected.reduce((s, t) => s + (t.collectedAmount ?? moneyAmount(t.totalPrice)), 0);
    const driverCutTotal = collected.reduce((s, t) => s + computeDriverCut(t), 0);
    return {
      outstandingCount: outstanding.length,
      outstandingTotal,
      collectedCount: collected.length,
      collectedTotal,
      driverCutTotal,
      netKeeps: collectedTotal - driverCutTotal,
    };
  }, [filtered]);

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

  function switchTab(tab: TransferTab) {
    setActiveTab(tab);
    setSearch('');
    setSelectedIds(new Set());
  }

  async function handleNotifyDriver(t: TransferRow) {
    setNotifyingId(t.id);
    try {
      await notifyDriver(t.id);
      pushToast('Driver notified', 'success');
    } catch {
      pushToast('Failed to notify driver', 'error');
    } finally {
      setNotifyingId(null);
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

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'unpaid', label: 'Unpaid to Driver' },
          { key: 'completed', label: 'Completed' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={`font-lato text-sm font-medium rounded-full px-4 py-2 transition-colors ${
              activeTab === tab.key
                ? 'bg-teal-brand text-white'
                : 'bg-sand-brand text-charcoal-brand hover:bg-teal-brand/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Completed date range */}
      {activeTab === 'completed' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="font-lato text-xs text-charcoal-brand/60">From</span>
            <input
              type="date"
              value={completedDateFrom}
              onChange={(e) => setCompletedDateFrom(e.target.value)}
              className="mt-1 block w-40 font-lato text-sm border border-charcoal-brand/20 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="font-lato text-xs text-charcoal-brand/60">To</span>
            <input
              type="date"
              value={completedDateTo}
              onChange={(e) => setCompletedDateTo(e.target.value)}
              className="mt-1 block w-40 font-lato text-sm border border-charcoal-brand/20 rounded-lg px-3 py-2"
            />
          </label>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Customer name, contact, route, or ID..."
          className="block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-sm text-gray-500 hover:text-gray-700"
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

      {/* Settlement summary panel */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-charcoal-brand/10 bg-sand-brand px-4 py-3">
            <p className="font-lato text-xs font-medium uppercase tracking-wider text-charcoal-brand/50">Outstanding</p>
            <p className="mt-1 font-lato text-lg font-bold text-charcoal-brand">
              {formatCurrency(settlement.outstandingTotal)}
            </p>
            <p className="font-lato text-xs text-charcoal-brand/60">{settlement.outstandingCount} transfer{settlement.outstandingCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-xl border border-teal-brand/20 bg-teal-brand/5 px-4 py-3">
            <p className="font-lato text-xs font-medium uppercase tracking-wider text-teal-brand/70">Collected</p>
            <p className="mt-1 font-lato text-lg font-bold text-teal-brand">
              {formatCurrency(settlement.collectedTotal)}
            </p>
            <p className="font-lato text-xs text-teal-brand/60">{settlement.collectedCount} transfer{settlement.collectedCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-xl border border-charcoal-brand/10 bg-sand-brand px-4 py-3">
            <p className="font-lato text-xs font-medium uppercase tracking-wider text-charcoal-brand/50">Driver Cut</p>
            <p className="mt-1 font-lato text-lg font-bold text-charcoal-brand">
              {formatCurrency(settlement.driverCutTotal)}
            </p>
            <p className="font-lato text-xs text-charcoal-brand/60">from collected transfers</p>
          </div>
          <div className="rounded-xl border border-teal-brand/30 bg-teal-brand px-4 py-3">
            <p className="font-lato text-xs font-medium uppercase tracking-wider text-white/70">Net Lola's Keeps</p>
            <p className="mt-1 font-lato text-lg font-bold text-white">
              {formatCurrency(settlement.netKeeps)}
            </p>
            <p className="font-lato text-xs text-white/60">collected − driver cut</p>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading transfers...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {search.trim()
            ? 'No transfers match your search.'
            : activeTab === 'upcoming'
            ? 'No upcoming transfers.'
            : activeTab === 'unpaid'
            ? 'All driver payments are up to date.'
            : 'No completed transfers in this date range.'}
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-lg border border-gray-200">
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
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Pickup / Accommodation</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Pax</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Van</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Total</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Driver Fee</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Net Profit</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Payment</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Driver Paid</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Collected</th>
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
                  <React.Fragment key={t.id}>
                    <tr
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
                      <td className="px-3 py-3 text-sm text-gray-600">
                        {isGlToIao(t.route) ? (t.accommodation ?? '—') : <span className="text-gray-300">—</span>}
                      </td>
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
                      <td className="px-3 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                        {t.collectedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                            ✓ {formatDate(t.collectedAt.slice(0, 10))}
                          </span>
                        ) : (
                          <button
                            onClick={() => setCollectTarget(t)}
                            className="rounded-md bg-teal-brand px-2 py-1 text-xs font-medium text-white hover:bg-teal-brand/80"
                          >
                            Collect
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">{t.bookingSource ?? '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${t.id}-actions`}>
                        <td colSpan={16} className="bg-gray-50 px-6 py-3">
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
                            {t.serviceDate >= todayStr && (
                              <button
                                disabled={notifyingId === t.id}
                                onClick={() => handleNotifyDriver(t)}
                                className="rounded-lg bg-teal-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-brand/80 disabled:opacity-50"
                              >
                                {notifyingId === t.id ? 'Sending…' : 'Notify Driver 🔔'}
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
                  </React.Fragment>
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
      {collectTarget && (
        <CollectTransferModal
          transfer={collectTarget}
          onClose={() => setCollectTarget(null)}
          onSuccess={(msg) => pushToast(msg, 'success')}
        />
      )}

      {/* Toast container */}
      <div className="fixed bottom-8 right-8 z-[60] flex flex-col-reverse items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-slide-up font-lato rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
              t.type === 'success' ? 'bg-teal-brand text-white' : 'bg-red-600 text-white'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
