import { useMemo, useState } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useTransfers, notifyDriver, formatVanType, type TransferCollector, type TransferRow } from '../../api/transfers.js';
import { useStores } from '../../api/config.js';
import { useToast } from '../../hooks/useToast.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Badge } from '../../components/common/Badge.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { AddTransferModal } from '../../components/transfers/AddTransferModal.js';
import { ReceivePaymentModal } from '../../components/transfers/ReceivePaymentModal.js';
import { DriverSettlementModal } from '../../components/transfers/DriverSettlementModal.js';
import { TransferDetailsModal } from '../../components/transfers/TransferDetailsModal.js';
import {
  customerTypeLabel,
  flightTimeLabel,
  isFromAccommodation,
  isReadyToSettle,
  moneyState,
  MONEY_TONE_CLASSES,
  needsCollection,
  pickupWindow,
  primaryAction,
  serviceDateLabel,
  settlementNet,
  shortRoute,
  transferCut,
  transferDue,
  transferTotal,
  type PrimaryAction,
} from '../../components/transfers/transfer-state.js';

type TransferTab = 'upcoming' | 'collect' | 'settle' | 'completed';

const TABS: Array<{ key: TransferTab; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'collect', label: 'To collect' },
  { key: 'settle', label: 'Driver settlement' },
  { key: 'completed', label: 'Completed' },
];

const ACTION_LABELS: Record<Exclude<PrimaryAction, null>, string> = {
  receive: 'Receive payment',
  'driver-collected': 'Driver collected',
  settle: 'Settle',
  notify: 'Email driver',
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function matchesSearch(t: TransferRow, q: string): boolean {
  return (
    t.customerName.toLowerCase().includes(q)
    || t.id.toLowerCase().includes(q)
    || (t.contactNumber ?? '').toLowerCase().includes(q)
    || t.route.toLowerCase().includes(q)
    || (t.accommodation ?? '').toLowerCase().includes(q)
    || (t.orderId ?? '').toLowerCase().includes(q)
  );
}

function MoneyPill({ t }: { t: TransferRow }) {
  const s = moneyState(t);
  return (
    <span
      title={s.hint}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset ${MONEY_TONE_CLASSES[s.tone]}`}
    >
      {s.label}
    </span>
  );
}

function DriverStatus({ t }: { t: TransferRow }) {
  if (t.driverSettledAt) return <span className="text-xs text-gray-500">Settled {t.driverSettledAt.slice(5, 10)}</span>;
  if (t.driverConfirmed) return <Badge color="green">Confirmed</Badge>;
  return <span className="text-xs text-gray-400">Not confirmed</span>;
}

function WhenCell({ t, today }: { t: TransferRow; today: string }) {
  const pickup = pickupWindow(t);
  const flight = flightTimeLabel(t.flightTime);
  return (
    <div className="tabular-nums">
      <p className="whitespace-nowrap text-sm font-medium text-gray-900">{serviceDateLabel(t.serviceDate, today)}</p>
      <p className="whitespace-nowrap text-xs text-gray-500">
        {pickup ? `Pickup ${pickup}` : flight ? `Flight ${flight}` : 'No time set'}
      </p>
    </div>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="px-3 py-4">
              <div className="h-3 w-full max-w-[8rem] rounded bg-gray-200" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
  onClick?: () => void;
}

function SummaryCard({ label, value, sub, emphasis, onClick }: SummaryCardProps) {
  const base = emphasis
    ? 'border-teal-brand/30 bg-teal-brand text-white'
    : 'border-charcoal-brand/10 bg-sand-brand text-charcoal-brand';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left tabular-nums ${base} ${onClick ? 'hover:opacity-90' : 'cursor-default'}`}
    >
      <p className={`text-xs font-medium uppercase tracking-wider ${emphasis ? 'text-white/70' : 'text-charcoal-brand/50'}`}>{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      <p className={`text-xs ${emphasis ? 'text-white/70' : 'text-charcoal-brand/60'}`}>{sub}</p>
    </button>
  );
}

export default function TransfersPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const archiveMode = useUIStore((s) => s.archiveMode);
  const isMobile = useIsMobile();
  const { data: stores } = useStores();
  const storeName = (stores as Array<{ id: string; name: string }> | undefined)?.find((s) => s.id === storeId)?.name ?? "Lola's";
  const today = manilaToday();

  const [activeTab, setActiveTab] = useState<TransferTab>(archiveMode ? 'completed' : 'upcoming');
  const [completedFrom, setCompletedFrom] = useState(() => addDays(manilaToday(), -30));
  const [completedTo, setCompletedTo] = useState(() => manilaToday());
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showAdd, setShowAdd] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<{ transfer: TransferRow; collector: TransferCollector } | null>(null);
  const [settleRows, setSettleRows] = useState<TransferRow[] | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const { toasts, pushToast } = useToast();

  const openQuery = useTransfers(storeId, { scope: 'open' }, !archiveMode);
  const closedQuery = useTransfers(
    storeId,
    { scope: 'closed', dateFrom: completedFrom || undefined, dateTo: completedTo || undefined },
    activeTab === 'completed',
  );

  const buckets = useMemo(() => {
    const open = (openQuery.data ?? []).filter((t) => t.status !== 'cancelled');
    return {
      upcoming: open.filter((t) => t.serviceDate >= today).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || (a.pickupTime ?? '').localeCompare(b.pickupTime ?? '')),
      collect: open.filter((t) => needsCollection(t, today)).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate)),
      settle: open.filter((t) => isReadyToSettle(t, today)).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate)),
      completed: [...(closedQuery.data ?? [])].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)),
      open,
    };
  }, [openQuery.data, closedQuery.data, today]);

  const tabRows = buckets[activeTab];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tabRows.filter((t) => matchesSearch(t, q)) : tabRows;
  }, [tabRows, search]);

  const isLoading = activeTab === 'completed' ? closedQuery.isLoading : openQuery.isLoading;
  const loadError = activeTab === 'completed' ? closedQuery.error : openQuery.error;
  const detailsRow = detailsId ? [...buckets.open, ...buckets.completed].find((t) => t.id === detailsId) ?? null : null;

  const summary = useMemo(() => {
    const todayRows = buckets.open.filter((t) => t.serviceDate === today);
    const unpaid = buckets.open.filter((t) => transferDue(t) > 0);
    const settleNet = buckets.settle.reduce((s, t) => s + settlementNet(t), 0);
    return {
      todayCount: todayRows.length,
      todayUnconfirmed: todayRows.filter((t) => !t.driverConfirmed).length,
      overdueTotal: buckets.collect.reduce((s, t) => s + transferDue(t), 0),
      overdueCount: buckets.collect.length,
      unpaidUpcoming: unpaid.filter((t) => t.serviceDate > today).reduce((s, t) => s + transferDue(t), 0),
      settleCount: buckets.settle.length,
      settleNet: Math.round(settleNet * 100) / 100,
    };
  }, [buckets, today]);

  const selectedRows = rows.filter((t) => selectedIds.has(t.id));
  const selectionNet = selectedRows.reduce((s, t) => s + settlementNet(t), 0);

  function switchTab(tab: TransferTab) {
    setActiveTab(tab);
    setSearch('');
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === rows.length ? new Set() : new Set(rows.map((t) => t.id)));
  }

  async function handleNotify(t: TransferRow) {
    setNotifyingId(t.id);
    try {
      await notifyDriver(t.id);
      pushToast(`Driver emailed about ${t.customerName}`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to email driver', 'error');
    } finally {
      setNotifyingId(null);
    }
  }

  function runAction(t: TransferRow, action: PrimaryAction) {
    if (action === 'receive') setReceiveTarget({ transfer: t, collector: 'lolas' });
    else if (action === 'driver-collected') setReceiveTarget({ transfer: t, collector: 'driver' });
    else if (action === 'settle') setSettleRows([t]);
    else if (action === 'notify') void handleNotify(t);
  }

  function renderActions(t: TransferRow) {
    const action = archiveMode ? null : primaryAction(t, today);
    return (
      <div className="flex items-center justify-end gap-1.5">
        {action && (
          <button
            type="button"
            disabled={action === 'notify' && notifyingId === t.id}
            onClick={() => runAction(t, action)}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
              action === 'notify'
                ? 'border border-teal-brand text-teal-brand hover:bg-teal-brand/10'
                : 'bg-teal-brand text-white hover:bg-teal-brand/90'
            }`}
          >
            {action === 'notify' && notifyingId === t.id ? 'Sending…' : ACTION_LABELS[action]}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDetailsId(t.id)}
          className="whitespace-nowrap rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Details
        </button>
      </div>
    );
  }

  function renderEmpty() {
    if (search.trim()) {
      return (
        <EmptyBox message="No transfers match your search." actionLabel="Clear search" onAction={() => setSearch('')} />
      );
    }
    switch (activeTab) {
      case 'upcoming':
        return archiveMode
          ? <EmptyBox message="No upcoming transfers." />
          : <EmptyBox message="No upcoming transfers." actionLabel="Add transfer" onAction={() => setShowAdd(true)} />;
      case 'collect':
        return <EmptyBox message="Nothing left to collect — every past transfer is paid." actionLabel="View upcoming" onAction={() => switchTab('upcoming')} />;
      case 'settle':
        return <EmptyBox message="The driver is fully settled." actionLabel="View completed" onAction={() => switchTab('completed')} />;
      case 'completed':
        return (
          <EmptyBox
            message="No completed transfers in this date range."
            actionLabel="Show the last 90 days"
            onAction={() => { setCompletedFrom(addDays(today, -90)); setCompletedTo(today); }}
          />
        );
    }
  }

  if (!storeId) {
    return <div className="py-12 text-center text-gray-500">Select a store to view transfers.</div>;
  }

  const showSelection = activeTab === 'settle' && !archiveMode;
  const colCount = showSelection ? 9 : 8;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Transfers</h1>
        {!archiveMode && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-brand/90"
          >
            + Add transfer
          </button>
        )}
      </div>

      {!archiveMode && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {openQuery.isLoading ? (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-charcoal-brand/10 bg-sand-brand px-4 py-3">
                <div className="h-3 w-20 rounded bg-charcoal-brand/10" />
                <div className="mt-2 h-6 w-16 rounded bg-charcoal-brand/15" />
                <div className="mt-1 h-3 w-24 rounded bg-charcoal-brand/10" />
              </div>
            ))
          ) : (
            <>
              <SummaryCard
                label="Today"
                value={`${summary.todayCount} transfer${summary.todayCount !== 1 ? 's' : ''}`}
                sub={summary.todayUnconfirmed > 0 ? `${summary.todayUnconfirmed} not confirmed by driver` : 'All confirmed'}
                onClick={() => switchTab('upcoming')}
              />
              <SummaryCard
                label="To collect"
                value={formatCurrency(summary.overdueTotal)}
                sub={`${summary.overdueCount} past or today, unpaid`}
                onClick={() => switchTab('collect')}
              />
              <SummaryCard
                label="Unpaid upcoming"
                value={formatCurrency(summary.unpaidUpcoming)}
                sub="due on future transfers"
                onClick={() => switchTab('upcoming')}
              />
              <SummaryCard
                emphasis
                label="Driver settlement"
                value={formatCurrency(Math.abs(summary.settleNet))}
                sub={
                  summary.settleCount === 0
                    ? 'Nothing to settle'
                    : summary.settleNet >= 0
                      ? `Driver owes Lola's · ${summary.settleCount} trips`
                      : `Lola's owes driver · ${summary.settleCount} trips`
                }
                onClick={() => switchTab('settle')}
              />
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {TABS.filter((tab) => !archiveMode || tab.key === 'completed').map((tab) => {
          const count = tab.key === 'completed' ? null : buckets[tab.key].length;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                active ? 'bg-teal-brand text-white' : 'bg-sand-brand text-charcoal-brand hover:bg-teal-brand/10'
              }`}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/20' : 'bg-charcoal-brand/10'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, contact, route, hotel, order…"
          aria-label="Search transfers"
          className="block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {activeTab === 'completed' && (
          <>
            <label className="block">
              <span className="text-xs text-gray-500">From</span>
              <input type="date" value={completedFrom} onChange={(e) => setCompletedFrom(e.target.value)} className="mt-1 block w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">To</span>
              <input type="date" value={completedTo} onChange={(e) => setCompletedTo(e.target.value)} className="mt-1 block w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </>
        )}
      </div>

      {showSelection && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-teal-50 px-4 py-2.5 text-sm text-teal-900 tabular-nums">
          {selectedRows.length > 0 ? (
            <>
              <span className="font-medium">{selectedRows.length} selected</span>
              <span>
                {selectionNet >= 0
                  ? `Driver hands over ${formatCurrency(selectionNet)}`
                  : `Lola's pays driver ${formatCurrency(-selectionNet)}`}
              </span>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs underline">
                Clear
              </button>
            </>
          ) : (
            <span className="text-pretty">Tick the trips you are settling now, or settle everything below.</span>
          )}
          <button
            type="button"
            onClick={() => setSettleRows(selectedRows.length > 0 ? selectedRows : rows)}
            className="ml-auto rounded-lg bg-teal-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-brand/90"
          >
            {selectedRows.length > 0 ? `Settle ${selectedRows.length} selected` : `Settle all ${rows.length}`}
          </button>
        </div>
      )}

      {loadError ? (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load transfers: {loadError instanceof Error ? loadError.message : 'unknown error'}
        </div>
      ) : isMobile ? (
        <div className="flex flex-col gap-3">
          {isLoading ? (
            Array.from({ length: 4 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-gray-100" />)
          ) : rows.length === 0 ? (
            renderEmpty()
          ) : (
            rows.map((t) => (
              <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {showSelection && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.customerName}`}
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-gray-900">{t.customerName}</p>
                      <p className="text-sm text-teal-brand">{shortRoute(t.route)} · {t.paxCount} pax · {formatVanType(t.vanType)}</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(transferTotal(t))}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <WhenCell t={t} today={today} />
                  <MoneyPill t={t} />
                </div>
                {isFromAccommodation(t.route) && t.accommodation && (
                  <p className="mt-1 truncate text-xs text-gray-600">From {t.accommodation}</p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <DriverStatus t={t} />
                  {renderActions(t)}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="max-h-[70dvh] overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {showSelection && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </th>
                )}
                <th className="px-3 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Trip</th>
                <th className="px-3 py-3 font-medium">Pickup from</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Money</th>
                <th className="px-3 py-3 font-medium">Driver</th>
                <th className="px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                <SkeletonRows cols={colCount} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount}>{renderEmpty()}</td>
                </tr>
              ) : (
                rows.map((t) => {
                  const type = customerTypeLabel(t);
                  const fromHotel = isFromAccommodation(t.route);
                  return (
                    <tr key={t.id} className="align-top hover:bg-gray-50">
                      {showSelection && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${t.customerName}`}
                            checked={selectedIds.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3"><WhenCell t={t} today={today} /></td>
                      <td className="max-w-[14rem] px-3 py-3">
                        <p className="truncate text-sm font-medium text-gray-900">{t.customerName}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge color={type.tone}>{type.label}</Badge>
                          {t.contactNumber && <span className="truncate text-xs text-gray-500 tabular-nums">{t.contactNumber}</span>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm">
                        <p className="font-medium text-gray-900" title={t.route}>{shortRoute(t.route)}</p>
                        <p className="text-xs text-gray-500 tabular-nums">{t.paxCount} pax · {formatVanType(t.vanType)}</p>
                      </td>
                      <td className="max-w-[12rem] px-3 py-3 text-sm text-gray-600">
                        {fromHotel
                          ? <span className="block truncate" title={t.accommodation ?? undefined}>{t.accommodation ?? <span className="text-amber-700">Add hotel</span>}</span>
                          : <span className="text-gray-400">Airport</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        <p className="text-sm font-medium text-gray-900">{formatCurrency(transferTotal(t))}</p>
                        <p className="text-xs text-gray-500">cut {formatCurrency(transferCut(t))}</p>
                      </td>
                      <td className="px-3 py-3"><MoneyPill t={t} /></td>
                      <td className="px-3 py-3"><DriverStatus t={t} /></td>
                      <td className="px-3 py-3">{renderActions(t)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 tabular-nums">
          <span>{rows.length} transfer{rows.length !== 1 ? 's' : ''}</span>
          <span>Fares <span className="font-medium text-gray-900">{formatCurrency(rows.reduce((s, t) => s + transferTotal(t), 0))}</span></span>
          <span>Driver cuts <span className="font-medium text-gray-900">{formatCurrency(rows.reduce((s, t) => s + transferCut(t), 0))}</span></span>
          <span>Still due <span className="font-medium text-gray-900">{formatCurrency(rows.reduce((s, t) => s + transferDue(t), 0))}</span></span>
        </div>
      )}

      {!archiveMode && (
        <AddTransferModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          storeId={storeId}
          onSuccess={(msg) => pushToast(msg, 'success')}
        />
      )}
      {receiveTarget && (
        <ReceivePaymentModal
          transfer={receiveTarget.transfer}
          initialCollector={receiveTarget.collector}
          onClose={() => setReceiveTarget(null)}
          onSuccess={(msg) => pushToast(msg, 'success')}
        />
      )}
      {settleRows && (
        <DriverSettlementModal
          transfers={settleRows}
          storeId={storeId}
          storeName={storeName}
          onClose={() => setSettleRows(null)}
          onSuccess={(msg) => { pushToast(msg, 'success'); setSelectedIds(new Set()); }}
        />
      )}
      {detailsRow && (
        <TransferDetailsModal
          key={detailsRow.id}
          transfer={detailsRow}
          readOnly={archiveMode}
          today={today}
          onClose={() => setDetailsId(null)}
          onToast={pushToast}
        />
      )}

      <div className="fixed bottom-8 right-8 z-[60] flex flex-col-reverse items-end gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-slide-up rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
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

function EmptyBox({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-pretty text-sm text-gray-500">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg border border-teal-brand px-3 py-1.5 text-sm font-medium text-teal-brand hover:bg-teal-brand/10"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
