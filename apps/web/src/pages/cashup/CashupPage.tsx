import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuthStore } from '../../stores/auth-store.js';
import { useStores, useChartOfAccounts } from '../../api/config.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import {
  useCashupSummary,
  useDepositRegister,
  useReopenCashup,
  useDepositFunds,
  useInterStoreTransfer,
  type CashLedgerItem,
  type CashupSummary,
  type MiscSaleRow,
  type TransactionRow,
} from '../../api/cashup.js';
import { BeforeCloseModal } from '../../components/cashup/BeforeCloseModal.js';
import { CloseDayWizard } from '../../components/cashup/CloseDayWizard.js';
import { CashupHistoryStrip } from '../../components/cashup/CashupHistoryStrip.js';
import { OrderLookupPanel } from '../../components/cashup/OrderLookup.js';
import { InterStoreTransferModal } from '../../components/cashup/TransferReconciliation.js';
import {
  Banner,
  ExpectedBreakdownCard,
  RowsSection,
  methodCategory,
  shortDate,
  type ListRow,
} from '../../components/cashup/CashupParts.js';
import { denomSum, denomsFromRecord, formatVariance, varianceColor } from '../../components/cashup/DenominationCounter.js';
import { useCashupDraft } from '../../components/cashup/use-cashup-draft.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDateTime, formatTime, manilaToday } from '../../utils/date.js';
import { Button } from '../../components/common/Button.js';

const LOLAS_PRIORITY = /lola/i;

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

function ledgerRows(items: CashLedgerItem[], kinds: string[]): ListRow[] {
  return items
    .filter((i) => kinds.includes(i.kind))
    .map((i) => ({
      id: i.id,
      ref: i.bookingToken,
      title: i.customerName ? `${i.customerName} · ${i.label}` : i.label,
      subtitle: i.createdAt ? formatTime(i.createdAt) : null,
      amount: i.amount,
      sign: i.amount < 0 ? ('-' as const) : ('+' as const),
    }));
}

function sumRows(rows: ListRow[]): number {
  return Math.round(rows.reduce((s, r) => s + Math.abs(r.amount), 0) * 100) / 100;
}

function txRows(rows: TransactionRow[]): ListRow[] {
  return rows.map((r) => ({
    id: r.id,
    ref: r.bookingToken ?? r.wooOrderId,
    title: r.customerName ?? r.paymentType,
    subtitle: [r.paymentType.replace(/_/g, ' '), r.methodId, r.settlementRef, formatTime(r.createdAt)]
      .filter(Boolean)
      .join(' · '),
    amount: r.amount,
  }));
}

function miscRows(rows: MiscSaleRow[]): ListRow[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.description ?? r.category ?? 'Misc sale',
    subtitle: [r.category, r.accountName, formatTime(r.createdAt)].filter(Boolean).join(' · '),
    amount: r.amount,
  }));
}

function matchesQuery(row: ListRow, q: string): boolean {
  if (!q) return true;
  return [row.ref, row.title, row.subtitle, row.badge].some((v) => v?.toLowerCase().includes(q));
}

function ModalOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}

export default function CashupPage() {
  const { data: stores = [] } = useStores() as {
    data: Array<{ id: string; name: string }> | undefined;
  };
  const { data: allAccounts = [] } = useChartOfAccounts() as {
    data:
      | Array<{
          id: string;
          name: string;
          accountType: string;
          account_type?: string;
          storeId?: string | null;
          store_id?: string | null;
        }>
      | undefined;
  };

  const sortedStores = useMemo(
    () =>
      [...stores].sort((a, b) => (LOLAS_PRIORITY.test(a.name) ? 0 : 1) - (LOLAS_PRIORITY.test(b.name) ? 0 : 1)),
    [stores],
  );

  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(manilaToday());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!storeId && sortedStores.length > 0) setStoreId(sortedStores[0].id);
  }, [sortedStores, storeId]);

  const { data: summary, isLoading, refetch } = useCashupSummary(storeId, date);
  const refreshSummary = useCallback(() => {
    void refetch();
  }, [refetch]);

  const { draft, update, setTillDenom, setEnvelopeDenom, clear } = useCashupDraft(storeId, date);

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('can_override_cashup');

  const currentStoreName = sortedStores.find((s) => s.id === storeId)?.name ?? storeId;
  const isLolasStore = LOLAS_PRIORITY.test(currentStoreName);
  const todayStr = summary?.today ?? manilaToday();
  const isLocked = summary?.isLocked ?? false;
  const isFuture = summary?.isFuture ?? date > todayStr;

  const storeAccounts = useMemo(
    () =>
      allAccounts.filter((a) => {
        const sid = a.storeId ?? a.store_id ?? null;
        return sid === storeId || sid === 'company';
      }),
    [allAccounts, storeId],
  );
  const assetAccounts = useMemo(
    () => storeAccounts.filter((a) => (a.accountType ?? a.account_type) === 'Asset'),
    [storeAccounts],
  );
  const otherStoreIds = useMemo(() => (summary?.otherStores ?? []).map((s) => s.id), [summary]);
  const otherStoreAccounts = useMemo(
    () =>
      allAccounts.filter((a) => {
        const sid = a.storeId ?? a.store_id ?? null;
        const typ = a.accountType ?? a.account_type;
        return sid && (otherStoreIds.includes(sid) || sid === 'company') && typ === 'Asset';
      }),
    [allAccounts, otherStoreIds],
  );

  const routing = usePaymentRouting();
  const routedCashAcct = routing.getCashAccount(storeId);
  const routedCardSettlement = routing.getCardSettlement(storeId);
  const otherStoreId = summary?.otherStores?.[0]?.id ?? '';
  const routedOtherCashAcct = routing.getCashAccount(otherStoreId);
  const otherStoreName = summary?.otherStores?.[0]?.name ?? 'Other Store';

  // ── Close-of-day flow ──
  const [showBeforeClose, setShowBeforeClose] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  function startClose() {
    const rec = summary?.reconciliation;
    const draftEmpty = denomSum(draft.tillDenoms) === 0 && denomSum(draft.envelopeDenoms) === 0;
    if (draftEmpty && rec && (rec.tillDenoms || rec.depositDenoms)) {
      update({
        tillDenoms: denomsFromRecord(rec.tillDenoms),
        envelopeDenoms: denomsFromRecord(rec.depositDenoms),
        varianceNote: draft.varianceNote || rec.varianceNote || '',
      });
    }
    setShowBeforeClose(true);
  }

  // ── Reopen ──
  const reopenMut = useReopenCashup();
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  function handleReopen() {
    if (!reopenReason.trim()) return;
    reopenMut.mutate(
      { storeId, date, reason: reopenReason.trim() },
      {
        onSuccess: () => {
          setShowReopen(false);
          setReopenReason('');
        },
      },
    );
  }

  // ── Mid-day cash to bank ──
  const depositMut = useDepositFunds();
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNotes, setDepositNotes] = useState('');
  const [depositCashAcct, setDepositCashAcct] = useState('');
  const [depositBankAcct, setDepositBankAcct] = useState('');

  useEffect(() => {
    if (routedCashAcct && !depositCashAcct) setDepositCashAcct(routedCashAcct);
  }, [routedCashAcct, depositCashAcct]);
  useEffect(() => {
    if (routedCardSettlement && !depositBankAcct) setDepositBankAcct(routedCardSettlement);
  }, [routedCardSettlement, depositBankAcct]);

  function handleDeposit() {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0 || !depositCashAcct || !depositBankAcct) return;
    depositMut.mutate(
      { storeId, date, amount: amt, cashAccountId: depositCashAcct, bankAccountId: depositBankAcct, notes: depositNotes || undefined },
      {
        onSuccess: () => {
          setShowDepositModal(false);
          setDepositAmount('');
          setDepositNotes('');
        },
      },
    );
  }

  // ── Inter-store transfer ──
  const transferMut = useInterStoreTransfer();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferFromAcct, setTransferFromAcct] = useState('');
  const [transferToAcct, setTransferToAcct] = useState('');

  useEffect(() => {
    if (routedCashAcct && !transferFromAcct) setTransferFromAcct(routedCashAcct);
  }, [routedCashAcct, transferFromAcct]);
  useEffect(() => {
    if (routedOtherCashAcct && !transferToAcct) setTransferToAcct(routedOtherCashAcct);
  }, [routedOtherCashAcct, transferToAcct]);

  function openTransferModal() {
    const otherStore = summary?.otherStores?.[0];
    setTransferAmount(isLolasStore ? String(otherStore?.defaultFloatAmount ?? 3000) : '');
    setTransferNotes('');
    setTransferFromAcct('');
    setTransferToAcct('');
    setShowTransferModal(true);
  }

  function handleTransfer() {
    const amt = parseFloat(transferAmount);
    const otherStore = summary?.otherStores?.[0];
    if (!amt || amt <= 0 || !transferFromAcct || !transferToAcct || !otherStore) return;
    transferMut.mutate(
      {
        fromStoreId: storeId,
        toStoreId: otherStore.id,
        amount: amt,
        fromCashAccountId: transferFromAcct,
        toCashAccountId: transferToAcct,
        transferType: isLolasStore ? 'float' : 'consolidation',
        date,
        notes: transferNotes || undefined,
      },
      {
        onSuccess: () => {
          setShowTransferModal(false);
          setTransferAmount('');
          setTransferNotes('');
        },
      },
    );
  }

  const draftTill = denomSum(draft.tillDenoms);
  const draftEnvelope = denomSum(draft.envelopeDenoms);
  const canAct = !isLocked && !isFuture;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Cash Up</h1>
        {canAct && (
          <div className="flex flex-wrap items-center gap-2">
            {summary?.otherStores && summary.otherStores.length > 0 && (
              <Button size="sm" variant="secondary" className="!py-2" onClick={openTransferModal}>
                {isLolasStore ? `Issue float to ${otherStoreName}` : `Send cash to ${otherStoreName}`}
              </Button>
            )}
            <Button size="sm" variant="secondary" className="!py-2" onClick={() => setShowDepositModal(true)}>
              Cash taken to bank
            </Button>
          </div>
        )}
      </div>

      {/* Store tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {sortedStores.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStoreId(s.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              storeId === s.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Date navigation */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, -1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
        >
          <span className="sr-only">Previous day</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <p className="text-lg font-semibold text-gray-900">{formatDateLabel(date)}</p>
          {date === todayStr ? (
            <span className="text-xs font-medium text-blue-600">Today</span>
          ) : (
            <button type="button" onClick={() => setDate(todayStr)} className="text-xs font-medium text-blue-600 hover:underline">
              Back to today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, 1))}
          disabled={date >= todayStr}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Next day</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <input
          type="date"
          value={date}
          max={todayStr}
          onChange={(e) => e.target.value && setDate(e.target.value > todayStr ? todayStr : e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {storeId && (
        <div className="mb-4">
          <CashupHistoryStrip storeId={storeId} selectedDate={date} onSelectDate={setDate} showStaffSummary={canManage} />
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find an order on this page or any day — booking ref, order number or customer name"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
        />
        {search.trim().length >= 3 && (
          <div className="mt-2">
            <OrderLookupPanel storeId={storeId} query={search} onSelectDate={setDate} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : summary ? (
        <CashupDay
          summary={summary}
          storeId={storeId}
          date={date}
          query={search.trim().toLowerCase()}
          canManage={canManage}
          canAct={canAct}
          draftTill={draftTill}
          draftEnvelope={draftEnvelope}
          onStartClose={startClose}
          onReopen={() => setShowReopen(true)}
          onSelectDate={setDate}
        />
      ) : (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">Select a store to view Cash Up</p>
        </div>
      )}

      {showBeforeClose && (
        <BeforeCloseModal
          storeId={storeId}
          date={date}
          onProceed={() => {
            setShowBeforeClose(false);
            setShowWizard(true);
          }}
          onCancel={() => setShowBeforeClose(false)}
        />
      )}

      {showWizard && summary && (
        <CloseDayWizard
          summary={summary}
          storeId={storeId}
          storeName={currentStoreName}
          date={date}
          dateLabel={formatDateLabel(date)}
          draft={draft}
          onDraftChange={update}
          onTillDenom={setTillDenom}
          onEnvelopeDenom={setEnvelopeDenom}
          assetAccounts={assetAccounts}
          routedCashAcct={routedCashAcct}
          defaultDropAcct={routedCardSettlement}
          onRefresh={refreshSummary}
          onClose={() => setShowWizard(false)}
          onLocked={() => {
            setShowWizard(false);
            clear();
          }}
        />
      )}

      {showReopen && summary && (
        <ModalOverlay onClose={() => setShowReopen(false)}>
          <div className="rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">Reopen {shortDate(date)}</h2>
            <p className="mb-4 text-sm text-gray-600">
              This unlocks the day so it can be recounted. The original count stays on record until the day is locked again.
            </p>
            {summary.laterLockedDate && (
              <div className="mb-4">
                <Banner tone="amber" title={`${shortDate(summary.laterLockedDate)} is already locked`}>
                  Its opening float came from this day&apos;s close. After you re-lock this day, reopen and recount{' '}
                  {shortDate(summary.laterLockedDate)} as well.
                </Banner>
              </div>
            )}
            <label className="mb-1 block text-sm font-medium text-gray-700">Reason *</label>
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              placeholder="e.g. ₱1,000 found in the safe that belonged to the till"
            />
            {reopenMut.isError && (
              <p className="mb-3 text-sm text-red-700">{(reopenMut.error as Error).message}</p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowReopen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleReopen}
                loading={reopenMut.isPending}
                disabled={!reopenReason.trim()}
              >
                Reopen day
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showDepositModal && (
        <ModalOverlay onClose={() => setShowDepositModal(false)}>
          <div className="rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-gray-900">Cash taken to bank</h2>
            <p className="mb-4 text-xs text-gray-500">
              For cash removed from the till during the day. At close, use the last step of the close-day flow instead.
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
              {!routedCashAcct && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Cash account (from) *</label>
                  <select
                    value={depositCashAcct}
                    onChange={(e) => setDepositCashAcct(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select cash account…</option>
                    {assetAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Destination account (to) *</label>
                <select
                  value={depositBankAcct}
                  onChange={(e) => setDepositBankAcct(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select destination account…</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <input
                  type="text"
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
              {depositMut.isError && <p className="text-sm text-red-700">{(depositMut.error as Error).message}</p>}
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDepositModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleDeposit}
                loading={depositMut.isPending}
                disabled={!depositAmount || parseFloat(depositAmount) <= 0 || !depositCashAcct || !depositBankAcct}
              >
                Record
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showTransferModal && (
        <InterStoreTransferModal
          isLolasStore={isLolasStore}
          currentStoreName={currentStoreName}
          otherStoreName={otherStoreName}
          transferAmount={transferAmount}
          onTransferAmountChange={setTransferAmount}
          transferNotes={transferNotes}
          onTransferNotesChange={setTransferNotes}
          transferFromAcct={transferFromAcct}
          onTransferFromAcctChange={setTransferFromAcct}
          transferToAcct={transferToAcct}
          onTransferToAcctChange={setTransferToAcct}
          assetAccounts={assetAccounts}
          otherStoreAccounts={otherStoreAccounts}
          routedCashAcct={routedCashAcct}
          routedOtherCashAcct={routedOtherCashAcct}
          isPending={transferMut.isPending}
          onConfirm={handleTransfer}
          onCancel={() => setShowTransferModal(false)}
        />
      )}
    </div>
  );
}

function CashupDay({
  summary,
  storeId,
  date,
  query,
  canManage,
  canAct,
  draftTill,
  draftEnvelope,
  onStartClose,
  onReopen,
  onSelectDate,
}: {
  summary: CashupSummary;
  storeId: string;
  date: string;
  query: string;
  canManage: boolean;
  canAct: boolean;
  draftTill: number;
  draftEnvelope: number;
  onStartClose: () => void;
  onReopen: () => void;
  onSelectDate: (d: string) => void;
}) {
  const [showNonCash, setShowNonCash] = useState(false);
  const { data: register } = useDepositRegister(storeId);
  const rec = summary.reconciliation;
  const isLocked = summary.isLocked;
  const tx = summary.transactions;
  const ledger = summary.cashLedger;
  const filter = (rows: ListRow[]) => (query ? rows.filter((r) => matchesQuery(r, query)) : rows);
  const searching = query.length > 0;

  const till = {
    sales: ledgerRows(ledger, ['cash_sale', 'misc_cash']),
    refunds: ledgerRows(ledger, ['cash_refund']),
    expenses: ledgerRows(ledger, ['cash_expense']),
    banked: ledgerRows(ledger, ['bank_deposit']),
    interStore: ledgerRows(ledger, ['inter_store_in', 'inter_store_out']),
    crossMethod: ledgerRows(ledger, ['deposit_return_till', 'deposit_release_in']),
  };
  const envelope = {
    taken: ledgerRows(ledger, ['deposit_in']),
    returned: ledgerRows(ledger, ['deposit_return']),
    applied: ledgerRows(ledger, ['deposit_applied']),
    released: ledgerRows(ledger, ['deposit_release_out']),
  };
  const crossOrderIds = new Set((tx.crossMethodDepositReturns ?? []).map((r) => r.orderId));
  const nonCashReturns: ListRow[] = tx.depositReturns
    .filter((r) => !r.affectsEnvelope)
    .map((r) => ({
      id: r.id,
      ref: r.bookingToken,
      title: r.customerName ?? r.description ?? 'Deposit return',
      subtitle: [r.methodId, formatTime(r.createdAt)].filter(Boolean).join(' · '),
      amount: r.amount,
      sign: '-' as const,
      badge: 'Not from envelope',
    }));
  const mismatchIds = new Set(
    tx.depositReturns
      .filter((r) => r.collectedMethodId && methodCategory(r.collectedMethodId) !== r.methodCategory && !crossOrderIds.has(r.orderId))
      .map((r) => r.id),
  );
  envelope.returned = envelope.returned.map((r) =>
    mismatchIds.has(r.id) ? { ...r, tone: 'warning' as const, badge: 'Taken by a different method' } : r,
  );

  const nonCashDeposits: ListRow[] = tx.depositsHeld
    .filter((g) => g.label !== 'Cash')
    .flatMap((g) => txRows(g.rows).map((r) => ({ ...r, badge: g.label })));
  const nonCashRefunds = txRows(tx.refunds.filter((r) => methodCategory(r.methodId) !== 'cash'));
  const nonCashExpenses: ListRow[] = tx.expenses
    .filter((e) => !e.isCash)
    .map((e) => ({
      id: e.id,
      title: e.description || e.category,
      subtitle: [e.category, e.paidFromName, formatTime(e.createdAt)].filter(Boolean).join(' · '),
      amount: e.amount,
    }));
  const nonCash = {
    card: filter([...txRows(tx.cardSales), ...miscRows(summary.transactions.miscSales.card)]),
    gcash: filter([...txRows(tx.gcashSales), ...miscRows(summary.transactions.miscSales.gcash)]),
    bank: filter([...txRows(tx.bankTransfer), ...miscRows(summary.transactions.miscSales.bank)]),
    deposits: filter(nonCashDeposits),
    refunds: filter(nonCashRefunds),
    expenses: filter(nonCashExpenses),
    pending: filter(txRows(tx.pendingExtensions)),
    discounts: filter(
      tx.discounts.map((d) => ({
        id: d.id,
        ref: d.orderRef,
        title: d.customerName ?? 'Discount',
        subtitle: d.vehicleName,
        amount: d.amount,
      })),
    ),
    charity: filter(
      summary.charityDonations.map((c) => ({
        id: c.id,
        title: c.description ?? 'Charity donation',
        subtitle: formatTime(c.createdAt),
        amount: c.amount,
      })),
    ),
  };
  const nonCashCount = Object.values(nonCash).reduce((s, rows) => s + rows.length, 0);
  const nonCashOpen = showNonCash || (searching && nonCashCount > 0);

  const openingLabel = summary.openingFloat.previousDate
    ? `Opening float (${shortDate(summary.openingFloat.previousDate)} close)`
    : 'Opening float (no earlier cash-up)';

  return (
    <div className="space-y-6">
      {/* Banners */}
      <div className="space-y-2">
        {summary.isFuture && <Banner tone="red" title="This date is in the future — nothing can be recorded or closed yet." />}

        {summary.gapTooLong ? (
          <Banner tone="red" title="No locked cash-up in the last month">
            The opening float can&apos;t be trusted. A manager should check the last locked day before this one is closed.
          </Banner>
        ) : summary.missingDays.length > 0 ? (
          <Banner
            tone="amber"
            title={`${summary.missingDays.length} earlier day(s) were never cashed up`}
            action={
              <Button size="sm" variant="secondary" onClick={() => onSelectDate(summary.missingDays[0])}>
                Go to {shortDate(summary.missingDays[0])}
              </Button>
            }
          >
            {summary.missingDays.map(shortDate).join(', ')}. Their cash movements are carried into today&apos;s expected
            figures. Closing those days first gives a cleaner count.
          </Banner>
        ) : null}

        {summary.openingFloat.source === 'none' && !summary.gapTooLong && (
          <Banner tone="blue" title="No earlier locked cash-up — opening float starts at ₱0" />
        )}

        {summary.carry.map((g) => (
          <Banner key={g.label} tone="amber" title={`Carried in: ${g.label}`}>
            {g.items.length} entr{g.items.length === 1 ? 'y' : 'ies'} — till {formatVariance(g.tillNet)}, envelope{' '}
            {formatVariance(g.envelopeNet)}. These are included in today&apos;s expected figures.
          </Banner>
        ))}

        {isLocked && rec && (
          <Banner
            tone="green"
            title={`Locked${rec.submittedByName ? ` by ${rec.submittedByName}` : ''}${rec.submittedAt ? ` · ${formatDateTime(rec.submittedAt)}` : ''}`}
            action={
              canManage ? (
                <Button size="sm" variant="secondary" onClick={onReopen}>
                  Reopen day
                </Button>
              ) : undefined
            }
          />
        )}

        {summary.postedAfterLock && summary.postedAfterLock.items.length > 0 && (
          <Banner tone="amber" title={`${summary.postedAfterLock.items.length} entr${summary.postedAfterLock.items.length === 1 ? 'y was' : 'ies were'} posted after this day was locked`}>
            They stay on this date for the books, and are carried into the next cash-up as &quot;After last cash-up&quot;: till{' '}
            {formatVariance(summary.postedAfterLock.tillNet)}, envelope {formatVariance(summary.postedAfterLock.envelopeNet)}.
            <ul className="mt-1 list-disc pl-5">
              {summary.postedAfterLock.items.map((i) => (
                <li key={i.id}>
                  {i.bookingToken && <strong>{i.bookingToken} </strong>}
                  {i.label} {i.amount < 0 ? '−' : '+'}
                  {formatCurrency(Math.abs(i.amount))}
                  {i.createdAt ? ` at ${formatDateTime(i.createdAt)}` : ''}
                </li>
              ))}
            </ul>
          </Banner>
        )}

        {!isLocked && rec?.overrideReason && (
          <Banner tone="amber" title={`Reopened${rec.overriddenByName ? ` by ${rec.overriddenByName}` : ''}`}>
            {rec.overrideReason}
          </Banner>
        )}
      </div>

      {/* Close-day call to action */}
      {canAct && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Close {shortDate(date)}</h2>
            <p className="text-sm text-gray-600">
              {draftTill > 0 || draftEnvelope > 0
                ? `Count in progress on this device — till ${formatCurrency(draftTill)}, envelope ${formatCurrency(draftEnvelope)}.`
                : 'Count the till and the deposit envelope, explain any difference, then lock the day.'}
            </p>
          </div>
          <Button onClick={onStartClose}>{draftTill > 0 || draftEnvelope > 0 ? 'Continue count' : 'Start cash-up'}</Button>
        </div>
      )}

      {/* Locked record */}
      {isLocked && rec && <ReconciliationRecordCard rec={rec} />}

      {/* Expected breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ExpectedBreakdownCard
          title="Main till"
          subtitle={isLocked ? 'Live figures — includes anything posted after lock' : undefined}
          openingLabel={openingLabel}
          breakdown={summary.expected.till}
        />
        <ExpectedBreakdownCard
          title="Deposit envelope"
          subtitle={isLocked ? 'Live figures — includes anything posted after lock' : undefined}
          openingLabel="Envelope at last close"
          breakdown={summary.expected.envelope}
          footer={
            register?.held && (
              <DepositsHeldSplit
                held={register.held}
                envelopeExpected={date === manilaToday() ? summary.expected.envelope.total : null}
              />
            )
          }
        />
      </div>

      {/* Till movements */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Main till — cash</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <RowsSection title="Cash taken" accent="green" rows={filter(till.sales)} total={sumRows(till.sales)} totalSign="+" forceExpanded={searching} />
          <RowsSection title="Cash expenses" accent="red" rows={filter(till.expenses)} total={sumRows(till.expenses)} totalSign="-" forceExpanded={searching} />
          <RowsSection title="Cash refunds" accent="orange" rows={filter(till.refunds)} total={sumRows(till.refunds)} totalSign="-" hideWhenEmpty forceExpanded={searching} />
          <RowsSection title="Cash taken to bank" accent="blue" rows={filter(till.banked)} total={sumRows(till.banked)} totalSign="-" hideWhenEmpty forceExpanded={searching} />
          <RowsSection title="Between stores" accent="violet" rows={filter(till.interStore)} total={Math.abs(till.interStore.reduce((s, r) => s + r.amount, 0))} hideWhenEmpty forceExpanded={searching} />
          <RowsSection
            title="Deposits refunded by a different method"
            subtitle="Cash paid out for GCash/bank deposits, or envelope cash moved into the till"
            accent="amber"
            rows={filter(till.crossMethod)}
            total={Math.abs(till.crossMethod.reduce((s, r) => s + r.amount, 0))}
            hideWhenEmpty
            forceExpanded={searching}
          />
        </div>
      </section>

      {/* Envelope movements */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deposit envelope — cash</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <RowsSection title="Deposits taken" accent="cyan" rows={filter(envelope.taken)} total={sumRows(envelope.taken)} totalSign="+" forceExpanded={searching} />
          <RowsSection
            title="Deposit returns"
            subtitle="Listed on the day the order was settled"
            accent="amber"
            rows={filter([...envelope.returned, ...nonCashReturns])}
            total={sumRows(envelope.returned)}
            totalSign="-"
            forceExpanded={searching}
          />
          <RowsSection
            title="Deposits applied to rentals"
            subtitle="Moved from the envelope into the till"
            accent="teal"
            rows={filter(envelope.applied)}
            total={sumRows(envelope.applied)}
            totalSign="-"
            hideWhenEmpty
            forceExpanded={searching}
          />
          <RowsSection
            title="Cash deposits refunded by GCash/bank"
            subtitle="Move this cash from the envelope into the till"
            accent="amber"
            rows={filter(envelope.released)}
            total={sumRows(envelope.released)}
            totalSign="-"
            hideWhenEmpty
            forceExpanded={searching}
          />
        </div>
      </section>

      {/* Non-cash, information only */}
      <section className="rounded-xl border border-gray-200 bg-gray-50">
        <button
          type="button"
          onClick={() => setShowNonCash((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span>
            <span className="text-sm font-semibold text-gray-900">Card, GCash &amp; bank — not in the till</span>
            <span className="ml-2 text-xs text-gray-500">
              Card {formatCurrency(summary.totals.cardSalesTotal + summary.totals.miscCardTotal)} · GCash{' '}
              {formatCurrency(summary.totals.gcashSalesTotal + summary.totals.miscGcashTotal)} · Bank{' '}
              {formatCurrency(summary.totals.bankTransferTotal + summary.totals.miscBankTotal)}
            </span>
          </span>
          <span className="text-sm text-blue-700">{nonCashOpen ? 'Hide' : 'Show'}</span>
        </button>
        {nonCashOpen && (
          <div className="grid gap-3 border-t border-gray-200 p-4 lg:grid-cols-2">
            <RowsSection title="Card" accent="purple" rows={nonCash.card} total={sumRows(nonCash.card)} hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="GCash" accent="teal" rows={nonCash.gcash} total={sumRows(nonCash.gcash)} hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="Bank transfer" accent="blue" rows={nonCash.bank} total={sumRows(nonCash.bank)} hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="Deposits held (non-cash)" accent="cyan" rows={nonCash.deposits} total={sumRows(nonCash.deposits)} hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="Refunds (non-cash)" accent="orange" rows={nonCash.refunds} total={sumRows(nonCash.refunds)} totalSign="-" hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="Expenses (non-cash)" accent="red" rows={nonCash.expenses} total={sumRows(nonCash.expenses)} totalSign="-" hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="Unpaid extensions" accent="amber" rows={nonCash.pending} total={sumRows(nonCash.pending)} hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="Discounts given" accent="gray" rows={nonCash.discounts} total={sumRows(nonCash.discounts)} hideWhenEmpty forceExpanded={searching} />
            <RowsSection title="Charity donations" accent="green" rows={nonCash.charity} total={sumRows(nonCash.charity)} hideWhenEmpty forceExpanded={searching} />
            {nonCashCount === 0 && <p className="text-sm text-gray-500">Nothing recorded.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Every deposit open orders hold right now, by where the money sits. Only the
 * cash is in the envelope. The register is live, so the comparison is today-only.
 */
function DepositsHeldSplit({
  held,
  envelopeExpected,
}: {
  held: { cash: number; gcash: number; bank: number };
  envelopeExpected: number | null;
}) {
  const total = held.cash + held.gcash + held.bank;
  const gap = envelopeExpected == null ? 0 : Math.round((envelopeExpected - held.cash) * 100) / 100;
  const rows = [
    { label: 'Cash — in the envelope', amount: held.cash },
    { label: 'GCash', amount: held.gcash },
    ...(held.bank > 0 ? [{ label: 'Bank', amount: held.bank }] : []),
  ];
  return (
    <div className="mt-4 border-t border-gray-200 pt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Deposits held for open orders</p>
      <dl className="space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3">
            <dt className="text-gray-600">{r.label}</dt>
            <dd className="tabular-nums font-medium">{formatCurrency(r.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-gray-100 pt-1">
          <dt className="font-semibold text-gray-900">Total held</dt>
          <dd className="tabular-nums font-semibold">{formatCurrency(total)}</dd>
        </div>
      </dl>
      {gap !== 0 && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          The envelope should hold {formatCurrency(Math.abs(gap))} {gap > 0 ? 'more' : 'less'} than the cash deposits on open
          orders. Check the deposit register when counting.
        </p>
      )}
    </div>
  );
}

function ReconciliationRecordCard({ rec }: { rec: NonNullable<CashupSummary['reconciliation']> }) {
  const rows = [
    { label: 'Main till', expected: rec.tillExpected, counted: rec.tillCounted, variance: rec.tillVariance },
    { label: 'Deposit envelope', expected: rec.depositsExpected, counted: rec.depositsCounted, variance: rec.depositVariance },
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-base font-semibold text-gray-900">Cash-up record</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="pb-2 font-medium" />
            <th className="pb-2 text-right font-medium">Expected</th>
            <th className="pb-2 text-right font-medium">Counted</th>
            <th className="pb-2 text-right font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-gray-100">
              <td className="py-2 font-medium text-gray-800">{r.label}</td>
              <td className="py-2 text-right tabular-nums">{r.expected != null ? formatCurrency(r.expected) : '—'}</td>
              <td className="py-2 text-right tabular-nums">{r.counted != null ? formatCurrency(r.counted) : '—'}</td>
              <td className={`py-2 text-right font-semibold tabular-nums ${varianceColor(r.variance ?? 0)}`}>
                {r.variance != null ? formatVariance(r.variance) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-3 grid gap-2 border-t border-gray-100 pt-3 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Float left for next day</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(rec.closingBalance ?? rec.tillCounted ?? 0)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Envelope carried forward</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(rec.depositsClosingBalance ?? rec.depositsCounted ?? 0)}</dd>
        </div>
      </dl>
      {rec.varianceNote && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium">Explanation:</span> {rec.varianceNote}
        </p>
      )}
      {rec.overrideReason && (
        <p className="mt-2 text-xs text-gray-500">
          Previously reopened{rec.overriddenByName ? ` by ${rec.overriddenByName}` : ''}: {rec.overrideReason}
        </p>
      )}
    </div>
  );
}
