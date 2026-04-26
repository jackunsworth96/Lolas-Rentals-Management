import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth-store.js';
import { useStores, useChartOfAccounts } from '../../api/config.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import {
  useCashupSummary,
  useReconcileCash,
  useOverrideCashup,
  useDepositFunds,
  useInterStoreTransfer,
  type TransactionRow,
  type MiscSaleRow,
  type ExpenseRow,
  type DepositRow,
  type DepositsHeldGroup,
  type TransferRow,
  type CharityDonationRow,
  type DiscountRow,
  type RefundRow,
  type DepositReturnRow,
} from '../../api/cashup.js';
import { BeforeCloseModal } from '../../components/cashup/BeforeCloseModal.js';
import { DenominationCounter } from '../../components/cashup/DenominationCounter.js';
import {
  ReconcileModal,
  InterStoreTransferModal,
} from '../../components/cashup/TransferReconciliation.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatTime } from '../../utils/date.js';
import { Button } from '../../components/common/Button.js';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1] as const;
const LOLAS_PRIORITY = /lola/i;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function freshDenoms(): Record<number, number> {
  return Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]));
}

function denomSum(denoms: Record<number, number>): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * (denoms[d] || 0), 0);
}

function varianceColor(v: number): string {
  if (v === 0) return 'text-green-600';
  if (Math.abs(v) <= 100) return 'text-amber-600';
  return 'text-red-600';
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

  // Lola's first, then everything else
  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      const aLola = LOLAS_PRIORITY.test(a.name) ? 0 : 1;
      const bLola = LOLAS_PRIORITY.test(b.name) ? 0 : 1;
      return aLola - bLola;
    });
  }, [stores]);

  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (!storeId && sortedStores.length > 0) {
      setStoreId(sortedStores[0].id);
    }
  }, [sortedStores, storeId]);

  const { data: summary, isLoading } = useCashupSummary(storeId, date);

  const reconcileMut = useReconcileCash();
  const overrideMut = useOverrideCashup();
  const depositMut = useDepositFunds();
  const transferMut = useInterStoreTransfer();

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canOverride = hasPermission('can_override_cashup');

  const currentStoreName =
    sortedStores.find((s) => s.id === storeId)?.name ?? storeId;
  const isLolasStore = LOLAS_PRIORITY.test(currentStoreName);

  // Denomination state: till + deposit envelope
  const [tillDenoms, setTillDenoms] = useState<Record<number, number>>(freshDenoms);
  const [depEnvDenoms, setDepEnvDenoms] = useState<Record<number, number>>(freshDenoms);

  const setTillDenom = useCallback((denom: number, count: number) => {
    setTillDenoms((prev) => ({ ...prev, [denom]: Math.max(0, count) }));
  }, []);
  const setDepEnvDenom = useCallback((denom: number, count: number) => {
    setDepEnvDenoms((prev) => ({ ...prev, [denom]: Math.max(0, count) }));
  }, []);

  const tillTotal = useMemo(() => denomSum(tillDenoms), [tillDenoms]);
  const depEnvTotal = useMemo(() => denomSum(depEnvDenoms), [depEnvDenoms]);

  // Expected figures split (includes cash misc sales in till calculation).
  // Subtract cash refunds (manual Issue Refund payments) and deposit returns
  // (settle-flow deposit refunds recorded as journal entries) — both represent
  // cash leaving the till and must reduce the expected count.
  const expectedCashSales = summary
    ? summary.openingFloat.amount +
      summary.totals.cashSalesTotal +
      (summary.totals.miscCashTotal ?? 0) +
      summary.totals.interStoreIn -
      summary.totals.expenseTotal -
      summary.totals.depositTotal -
      summary.totals.interStoreOut -
      (summary.totals.cashRefundTotal ?? 0) -
      (summary.totals.depositReturnTotal ?? 0)
    : 0;
  const expectedDepositsHeld = summary
    ? summary.totals.cashDepositsHeldTotal
    : 0;
  const tillVariance = tillTotal - expectedCashSales;
  const depVariance = depEnvTotal - expectedDepositsHeld;

  // Before-close gate
  const [showBeforeCloseModal, setShowBeforeCloseModal] = useState(false);

  // Modals
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNotes, setDepositNotes] = useState('');
  const [depositCashAcct, setDepositCashAcct] = useState('');
  const [depositBankAcct, setDepositBankAcct] = useState('');

  // Inter-store transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferFromAcct, setTransferFromAcct] = useState('');
  const [transferToAcct, setTransferToAcct] = useState('');

  const storeAccounts = useMemo(
    () =>
      allAccounts.filter((a) => {
        const sid = a.storeId ?? a.store_id ?? null;
        return sid === storeId || sid === 'company';
      }),
    [allAccounts, storeId],
  );
  const assetAccounts = useMemo(
    () =>
      storeAccounts.filter(
        (a) => (a.accountType ?? a.account_type) === 'Asset',
      ),
    [storeAccounts],
  );

  // Other store accounts for inter-store transfers
  const otherStoreIds = useMemo(
    () => (summary?.otherStores ?? []).map((s) => s.id),
    [summary],
  );
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

  useEffect(() => {
    if (routedCashAcct && !depositCashAcct) setDepositCashAcct(routedCashAcct);
  }, [routedCashAcct, depositCashAcct]);
  useEffect(() => {
    if (routedCardSettlement && !depositBankAcct) setDepositBankAcct(routedCardSettlement);
  }, [routedCardSettlement, depositBankAcct]);
  useEffect(() => {
    if (routedCashAcct && !transferFromAcct) setTransferFromAcct(routedCashAcct);
  }, [routedCashAcct, transferFromAcct]);
  useEffect(() => {
    if (routedOtherCashAcct && !transferToAcct) setTransferToAcct(routedOtherCashAcct);
  }, [routedOtherCashAcct, transferToAcct]);

  const isLocked = summary?.isLocked ?? false;

  // Restore denominations from a previous reconciliation
  const reconTillDenoms = summary?.reconciliation?.tillDenoms;
  const reconDepDenoms = summary?.reconciliation?.depositDenoms;
  const hasSavedDenoms = useMemo(
    () =>
      (reconTillDenoms && Object.values(reconTillDenoms).some((v) => v > 0)) ||
      (reconDepDenoms && Object.values(reconDepDenoms).some((v) => v > 0)),
    [reconTillDenoms, reconDepDenoms],
  );

  function loadSavedDenoms() {
    if (reconTillDenoms) {
      const loaded: Record<number, number> = {};
      for (const d of DENOMINATIONS) loaded[d] = reconTillDenoms[String(d)] ?? 0;
      setTillDenoms(loaded);
    }
    if (reconDepDenoms) {
      const loaded: Record<number, number> = {};
      for (const d of DENOMINATIONS) loaded[d] = reconDepDenoms[String(d)] ?? 0;
      setDepEnvDenoms(loaded);
    }
  }

  function handleReconcile() {
    if (!summary) return;
    reconcileMut.mutate(
      {
        storeId,
        date,
        openingBalance: summary.openingFloat.amount,
        expectedCash: summary.expectedCash,
        actualCounted: tillTotal + depEnvTotal,
        tillCounted: tillTotal,
        depositsCounted: depEnvTotal,
        tillDenoms,
        depositDenoms: depEnvDenoms,
        tillExpected: expectedCashSales,
        depositsExpected: expectedDepositsHeld,
        closingBalance: tillTotal,
      },
      { onSuccess: () => setShowReconcileModal(false) },
    );
  }

  function handleOverride() {
    if (!overrideReason.trim()) return;
    overrideMut.mutate(
      {
        storeId,
        date,
        actualCounted: tillTotal + depEnvTotal,
        reason: overrideReason,
      },
      {
        onSuccess: () => {
          setShowOverrideModal(false);
          setOverrideReason('');
        },
      },
    );
  }

  function handleDeposit() {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0 || !depositCashAcct || !depositBankAcct) return;
    depositMut.mutate(
      {
        storeId,
        date,
        amount: amt,
        cashAccountId: depositCashAcct,
        bankAccountId: depositBankAcct,
        notes: depositNotes || undefined,
      },
      {
        onSuccess: () => {
          setShowDepositModal(false);
          setDepositAmount('');
          setDepositNotes('');
        },
      },
    );
  }

  function openTransferModal() {
    const otherStore = summary?.otherStores?.[0];
    const defaultFloat = otherStore?.defaultFloatAmount ?? 3000;
    setTransferAmount(isLolasStore ? String(defaultFloat) : '');
    setTransferNotes('');
    setTransferFromAcct('');
    setTransferToAcct('');
    setShowTransferModal(true);
  }

  function handleTransfer() {
    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0 || !transferFromAcct || !transferToAcct) return;
    const otherStore = summary?.otherStores?.[0];
    if (!otherStore) return;

    const payload = isLolasStore
      ? {
          fromStoreId: storeId,
          toStoreId: otherStore.id,
          amount: amt,
          fromCashAccountId: transferFromAcct,
          toCashAccountId: transferToAcct,
          transferType: 'float' as const,
          date,
          notes: transferNotes || undefined,
        }
      : {
          fromStoreId: storeId,
          toStoreId: otherStore.id,
          amount: amt,
          fromCashAccountId: transferFromAcct,
          toCashAccountId: transferToAcct,
          transferType: 'consolidation' as const,
          date,
          notes: transferNotes || undefined,
        };

    transferMut.mutate(payload, {
      onSuccess: () => {
        setShowTransferModal(false);
        setTransferAmount('');
        setTransferNotes('');
      },
    });
  }

  const otherStoreName =
    summary?.otherStores?.[0]?.name ?? 'Other Store';

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Cash Up</h1>
        <div className="flex items-center gap-2">
          {!isLocked && summary?.otherStores && summary.otherStores.length > 0 && (
            <Button size="sm" variant="secondary" className="!py-2" onClick={openTransferModal}>
              {isLolasStore
                ? `Issue Float to ${otherStoreName}`
                : `Send Cash to ${otherStoreName}`}
            </Button>
          )}
          {!isLocked && (
            <Button
              size="sm"
              variant="secondary"
              className="!py-2"
              onClick={() => setShowDepositModal(true)}
            >
              Cash Deposited
            </Button>
          )}
        </div>
      </div>

      {/* Store tabs — Lola's first */}
      <div className="mb-4 border-l-2 border-teal-500 pl-3">
        <p className="mb-1.5 text-xs text-gray-400">Viewing:</p>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {sortedStores.map((s) => (
            <button
              key={s.id}
              onClick={() => setStoreId(s.id)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                storeId === s.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Date navigation */}
      <div className="mb-6 flex items-center gap-3">
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
          <p className="text-lg font-semibold text-gray-900">
            {formatDateLabel(date)}
          </p>
          {date === today() && (
            <span className="text-xs font-medium text-blue-600">Today</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, 1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
        >
          <span className="sr-only">Next day</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {/* Lock banner */}
          {isLocked && (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-sm font-medium text-green-800">
                  Reconciliation locked
                  {summary.reconciliation?.submittedAt &&
                    ` — submitted ${new Date(summary.reconciliation.submittedAt).toLocaleString('en-PH')}`}
                </span>
              </div>
              {canOverride && (
                <Button size="sm" variant="ghost" className="!py-2" onClick={() => setShowOverrideModal(true)}>
                  Override
                </Button>
              )}
            </div>
          )}

          {summary.reconciliation?.overrideReason && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">Overridden:</span>{' '}
              {summary.reconciliation.overrideReason}
            </div>
          )}

          {/* Summary: auto-fit grid avoids empty "holes" in the last row; Expected spans full width */}
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Opening &amp; sales
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,11.5rem),1fr))]">
                <SummaryCard
                  label="Opening Float"
                  value={summary.openingFloat.amount}
                  badge={
                    summary.openingFloat.source === 'none'
                      ? 'No prior'
                      : summary.openingFloat.source === 'override'
                        ? 'Override'
                        : 'Prev. close'
                  }
                  badgeColor={summary.openingFloat.source === 'override' ? 'amber' : 'gray'}
                />
                <SummaryCard label="Cash Sales" value={summary.totals.cashSalesTotal} color="green" subtitle="Income" />
                {(summary.totals.miscSalesTotal ?? 0) > 0 && (
                  <SummaryCard
                    label="Misc Sales"
                    value={summary.totals.miscSalesTotal}
                    color="emerald"
                    subtitle={`Cash ${formatCurrency(summary.totals.miscCashTotal ?? 0)}`}
                  />
                )}
                <SummaryCard label="GCash Sales" value={summary.totals.gcashSalesTotal} color="teal" subtitle="Income" />
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Deposits, bank &amp; day costs
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,11.5rem),1fr))]">
                <SummaryCard
                  label="Deposits Held"
                  value={summary.totals.depositsHeldTotal}
                  color="cyan"
                  subtitle="Liability — all methods"
                />
                <SummaryCard label="Cash Deposited" value={summary.totals.depositTotal} color="blue" subtitle="To bank" />
                {(summary.totals.interStoreIn > 0 || summary.totals.interStoreOut > 0) && (
                  <SummaryCard
                    label="Transfers"
                    value={summary.totals.interStoreIn - summary.totals.interStoreOut}
                    color="violet"
                    subtitle={`In ${formatCurrency(summary.totals.interStoreIn)} / Out ${formatCurrency(summary.totals.interStoreOut)}`}
                  />
                )}
                <SummaryCard label="Expenses" value={summary.totals.expenseTotal} color="red" subtitle="All methods" />
              </div>
            </div>

            {((summary.totals.refundTotal ?? 0) > 0 ||
              (summary.totals.depositReturnTotal ?? 0) > 0 ||
              (summary.totals.discountsTotal ?? 0) > 0) && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Outflows &amp; notes</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,11.5rem),1fr))]">
                  {(summary.totals.refundTotal ?? 0) > 0 && (
                    <SummaryCard
                      label="Refunds Out"
                      value={summary.totals.refundTotal}
                      color="red"
                      subtitle={
                        (summary.totals.cashRefundTotal ?? 0) < (summary.totals.refundTotal ?? 0)
                          ? `Cash ${formatCurrency(summary.totals.cashRefundTotal ?? 0)}`
                          : 'Manual refund payments'
                      }
                    />
                  )}
                  {(summary.totals.depositReturnTotal ?? 0) > 0 && (
                    <SummaryCard
                      label="Deposit Returns"
                      value={summary.totals.depositReturnTotal}
                      color="orange"
                      subtitle="Completed order deposits"
                    />
                  )}
                  {(summary.totals.discountsTotal ?? 0) > 0 && (
                    <SummaryCard
                      label="Discounts Given"
                      value={summary.totals.discountsTotal}
                      color="orange"
                      subtitle="Info only"
                    />
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-1">
              <SummaryCard
                label="Expected Cash"
                value={expectedCashSales}
                color="indigo"
                subtitle="Target for the main till (excludes the deposit envelope)"
                className="border-indigo-200 ring-1 ring-indigo-100"
              />
            </div>
          </div>

          {/* Transaction sections */}
          <div className="grid gap-6 lg:grid-cols-2">
            <TransactionSection
              title="Cash Sales"
              subtitle="Income"
              icon="💵"
              rows={summary.transactions.cashSales}
              total={summary.totals.cashSalesTotal}
              color="green"
              affectsTill
            />
            {(summary.transactions.miscSales?.cash?.length ?? 0) > 0 && (
              <MiscSalesSection
                title="Misc Sales (Cash)"
                icon="🪙"
                rows={summary.transactions.miscSales.cash}
                total={summary.totals.miscCashTotal ?? 0}
                color="emerald"
                affectsTill
              />
            )}
            <DepositsHeldSection
              groups={summary.transactions.depositsHeld}
              total={summary.totals.depositsHeldTotal}
            />
            <BankDepositSection
              deposits={summary.transactions.bankDeposits}
              total={summary.totals.depositTotal}
            />
            {(summary.transactions.transfersIn.length > 0 ||
              summary.transactions.transfersOut.length > 0) && (
              <TransferSection
                transfersIn={summary.transactions.transfersIn}
                transfersOut={summary.transactions.transfersOut}
                totalIn={summary.totals.interStoreIn}
                totalOut={summary.totals.interStoreOut}
              />
            )}
            <TransactionSection
              title="Card Sales"
              subtitle="Income"
              icon="💳"
              rows={summary.transactions.cardSales}
              total={summary.totals.cardSalesTotal}
              color="purple"
            />
            {(summary.transactions.miscSales?.card?.length ?? 0) > 0 && (
              <MiscSalesSection
                title="Misc Sales (Card)"
                icon="💳"
                rows={summary.transactions.miscSales.card}
                total={summary.totals.miscCardTotal ?? 0}
                color="purple"
              />
            )}
            <TransactionSection
              title="GCash Sales"
              subtitle="Income"
              icon="📱"
              rows={summary.transactions.gcashSales}
              total={summary.totals.gcashSalesTotal}
              color="teal"
            />
            {(summary.transactions.miscSales?.gcash?.length ?? 0) > 0 && (
              <MiscSalesSection
                title="Misc Sales (GCash)"
                icon="📱"
                rows={summary.transactions.miscSales.gcash}
                total={summary.totals.miscGcashTotal ?? 0}
                color="teal"
              />
            )}
            {(summary.transactions.pendingExtensions?.length ?? 0) > 0 && (
              <PendingExtensionsSection
                rows={summary.transactions.pendingExtensions}
                total={summary.totals.pendingExtensionsTotal ?? 0}
              />
            )}
            <TransactionSection
              title="Bank Transfers"
              icon="🏛️"
              rows={summary.transactions.bankTransfer}
              total={summary.totals.bankTransferTotal}
              color="gray"
            />
            {(summary.transactions.miscSales?.bank?.length ?? 0) > 0 && (
              <MiscSalesSection
                title="Misc Sales (Bank Transfer)"
                icon="🏛️"
                rows={summary.transactions.miscSales.bank}
                total={summary.totals.miscBankTotal ?? 0}
                color="gray"
              />
            )}
            <ExpenseSection
              expenses={summary.transactions.expenses}
              total={summary.totals.expenseTotal}
            />
            {(summary.totals.refundTotal ?? 0) > 0 && (
              <RefundsSection
                refunds={(summary.transactions.refunds ?? []) as RefundRow[]}
                total={summary.totals.refundTotal ?? 0}
              />
            )}
            {(summary.totals.depositReturnTotal ?? 0) > 0 && (
              <DepositReturnsSection
                returns={(summary.transactions.depositReturns ?? []) as DepositReturnRow[]}
                total={summary.totals.depositReturnTotal ?? 0}
              />
            )}
            {(summary.totals.charityDonationsTotal ?? 0) > 0 && (
              <CharityDonationsSection
                donations={summary.charityDonations ?? []}
                total={summary.totals.charityDonationsTotal}
              />
            )}
            {(summary.totals.discountsTotal ?? 0) > 0 && (
              <DiscountsSection
                discounts={summary.transactions.discounts ?? []}
                total={summary.totals.discountsTotal ?? 0}
              />
            )}
          </div>

          <DenominationCounter
            tillDenoms={tillDenoms}
            depEnvDenoms={depEnvDenoms}
            onTillDenomChange={setTillDenom}
            onDepEnvDenomChange={setDepEnvDenom}
            tillTotal={tillTotal}
            depEnvTotal={depEnvTotal}
            expectedCashSales={expectedCashSales}
            expectedDepositsHeld={expectedDepositsHeld}
            tillVariance={tillVariance}
            depVariance={depVariance}
            isLocked={isLocked}
            hasSavedDenoms={!!hasSavedDenoms}
            onLoadSavedDenoms={loadSavedDenoms}
          />

          {/* Action buttons */}
          {!isLocked && (
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => setShowBeforeCloseModal(true)}
                disabled={tillTotal === 0}
              >
                Reconcile Day
              </Button>
            </div>
          )}

          {/* Reconciliation info if locked */}
          {isLocked && summary.reconciliation && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                Reconciliation Record
              </h4>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm lg:grid-cols-4">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Till Counted</dt>
                  <dd className="font-medium">
                    {formatCurrency(summary.reconciliation.tillCounted ?? summary.reconciliation.actualCounted)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Deposits Counted</dt>
                  <dd className="font-medium">
                    {formatCurrency(summary.reconciliation.depositsCounted ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Variance</dt>
                  <dd className={`font-medium ${varianceColor(summary.reconciliation.variance)}`}>
                    {summary.reconciliation.variance > 0 ? '+' : ''}
                    {formatCurrency(summary.reconciliation.variance)}
                  </dd>
                </div>
                {summary.reconciliation.closingBalance != null && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Closing Balance</dt>
                    <dd className="font-medium">
                      {formatCurrency(summary.reconciliation.closingBalance)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">Select a store to view Cash Up</p>
        </div>
      )}

      {/* ── Before-close gate ── */}
      {showBeforeCloseModal && (
        <BeforeCloseModal
          storeId={storeId}
          date={date}
          onProceed={() => {
            setShowBeforeCloseModal(false);
            setShowReconcileModal(true);
          }}
          onCancel={() => setShowBeforeCloseModal(false)}
        />
      )}

      {/* ── Reconcile Confirmation Modal ── */}
      {showReconcileModal && summary && (
        <ReconcileModal
          summary={summary}
          dateLabel={formatDateLabel(date)}
          tillTotal={tillTotal}
          depEnvTotal={depEnvTotal}
          tillVariance={tillVariance}
          depVariance={depVariance}
          expectedCashSales={expectedCashSales}
          expectedDepositsHeld={expectedDepositsHeld}
          isPending={reconcileMut.isPending}
          onConfirm={handleReconcile}
          onCancel={() => setShowReconcileModal(false)}
        />
      )}

      {/* ── Override Modal ── */}
      {showOverrideModal && (
        <ModalOverlay onClose={() => setShowOverrideModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              Override Reconciliation
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              This will unlock the record and update the actual counted amount.
              A reason is required.
            </p>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Till Count</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(tillTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Deposit Envelope</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(depEnvTotal)}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Reason for Override *
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={3}
                placeholder="Explain why this override is necessary..."
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setShowOverrideModal(false); setOverrideReason(''); }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleOverride}
                loading={overrideMut.isPending}
                disabled={!overrideReason.trim()}
              >
                Override
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Cash Deposited Modal ── */}
      {showDepositModal && (
        <ModalOverlay onClose={() => setShowDepositModal(false)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              Record Cash Deposit
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
                <input
                  type="number"
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Cash Account (from) *</label>
                <select
                  value={depositCashAcct}
                  onChange={(e) => setDepositCashAcct(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select cash account...</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
              </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Destination Account (to) *</label>
                <select
                  value={depositBankAcct}
                  onChange={(e) => setDepositBankAcct(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select destination account...</option>
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
                  placeholder="Optional description"
                />
              </div>
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
                Record Deposit
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Inter-store Transfer Modal ── */}
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

/* ── Sub-components ── */

function SummaryCard({
  label,
  value,
  color,
  badge,
  badgeColor,
  subtitle,
  className,
}: {
  label: string;
  value: number;
  color?: string;
  badge?: string;
  badgeColor?: string;
  subtitle?: string;
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    green: 'text-green-700',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
    indigo: 'text-indigo-700',
    cyan: 'text-cyan-700',
    teal: 'text-teal-700',
    violet: 'text-violet-700',
    orange: 'text-orange-700',
  };
  const badgeMap: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <div
      className={['rounded-lg border border-gray-200 bg-white p-4', className].filter(Boolean).join(' ')}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeMap[badgeColor ?? 'gray'] ?? badgeMap.gray}`}>
            {badge}
          </span>
        )}
      </div>
      <p className={`mt-1 text-xl font-bold ${color ? colorMap[color] ?? 'text-gray-900' : 'text-gray-900'}`}>
        {formatCurrency(value)}
      </p>
      {subtitle && <p className="mt-0.5 text-[10px] text-gray-400">{subtitle}</p>}
    </div>
  );
}

function PendingExtensionsSection({ rows, total }: { rows: TransactionRow[]; total: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50">
      <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>⏳</span>
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Pending Extensions</h3>
            <p className="text-[10px] text-amber-700">Not yet collected — remind customers to pay</p>
          </div>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
            Info only
          </span>
        </div>
        <span className="text-sm font-bold text-amber-900">{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {rows.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between border-b border-amber-50 px-4 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-amber-900">
                {tx.customerName ?? 'Customer'}
              </p>
              <p className="text-xs text-amber-700">
                Extension{tx.settlementRef ? ` · ${tx.settlementRef}` : ''}
                {tx.createdAt && ` · ${formatTime(tx.createdAt)}`}
              </p>
            </div>
            <span className="ml-3 whitespace-nowrap text-sm font-medium text-amber-900">
              {formatCurrency(tx.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionSection({
  title,
  subtitle,
  icon,
  rows,
  total,
  color,
  affectsTill,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  rows?: TransactionRow[];
  total: number;
  color: string;
  affectsTill?: boolean;
}) {
  const borderColor: Record<string, string> = {
    green: 'border-l-green-500',
    blue: 'border-l-blue-500',
    purple: 'border-l-purple-500',
    teal: 'border-l-teal-500',
    cyan: 'border-l-cyan-500',
    gray: 'border-l-gray-400',
  };

  const items = rows ?? [];

  return (
    <div className={`rounded-lg border border-gray-200 border-l-4 bg-white ${borderColor[color] ?? 'border-l-gray-400'}`}>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-[10px] text-gray-400">{subtitle}</p>}
          </div>
          {!affectsTill && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              Info only
            </span>
          )}
        </div>
        <span className="text-sm font-bold text-gray-900">{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No transactions</p>
        ) : (
          items.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {tx.customerName ?? 'Unknown'}
                  {tx.wooOrderId && <span className="ml-1 text-xs text-gray-400">#{tx.wooOrderId}</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {tx.paymentType}
                  {tx.settlementRef && ` · ${tx.settlementRef}`}
                  {tx.createdAt && ` · ${formatTime(tx.createdAt)}`}
                </p>
              </div>
              <span className="ml-3 whitespace-nowrap text-sm font-medium text-gray-900">
                {formatCurrency(tx.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BankDepositSection({
  deposits,
  total,
}: {
  deposits: DepositRow[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 border-l-4 border-l-blue-500 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>🏦</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cash Deposited</h3>
            <p className="text-[10px] text-gray-400">Transferred from till</p>
          </div>
        </div>
        <span className="text-sm font-bold text-blue-700">{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {deposits.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No deposits</p>
        ) : (
          deposits.map((d) => (
            <div key={d.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {d.description ?? 'Cash deposit'}
                </p>
                <p className="text-xs text-gray-500">
                  {d.accountName && <span className="font-medium text-blue-600">{d.accountName}</span>}
                  {d.accountName && d.createdAt && ' · '}
                  {d.createdAt && formatTime(d.createdAt)}
                </p>
              </div>
              <span className="ml-3 whitespace-nowrap text-sm font-medium text-blue-700">
                {formatCurrency(d.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TransferSection({
  transfersIn,
  transfersOut,
  totalIn,
  totalOut,
}: {
  transfersIn: TransferRow[];
  transfersOut: TransferRow[];
  totalIn: number;
  totalOut: number;
}) {
  const net = totalIn - totalOut;
  return (
    <div className="rounded-lg border border-gray-200 border-l-4 border-l-violet-500 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>🔄</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Inter-store Transfers</h3>
            <p className="text-[10px] text-gray-400">
              In {formatCurrency(totalIn)} / Out {formatCurrency(totalOut)}
            </p>
          </div>
        </div>
        <span className={`text-sm font-bold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {net >= 0 ? '+' : ''}{formatCurrency(net)}
        </span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {transfersIn.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">{t.description ?? 'Transfer in'}</p>
              <p className="text-xs text-gray-500">{t.createdAt && formatTime(t.createdAt)}</p>
            </div>
            <span className="ml-3 whitespace-nowrap text-sm font-medium text-green-700">
              +{formatCurrency(t.amount)}
            </span>
          </div>
        ))}
        {transfersOut.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">{t.description ?? 'Transfer out'}</p>
              <p className="text-xs text-gray-500">{t.createdAt && formatTime(t.createdAt)}</p>
            </div>
            <span className="ml-3 whitespace-nowrap text-sm font-medium text-red-700">
              -{formatCurrency(t.amount)}
            </span>
          </div>
        ))}
        {transfersIn.length === 0 && transfersOut.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-400">No transfers</p>
        )}
      </div>
    </div>
  );
}

function DepositsHeldSection({
  groups,
  total,
}: {
  groups: DepositsHeldGroup[];
  total: number;
}) {
  const isEmpty = groups.length === 0 || groups.every((g) => g.rows.length === 0);
  return (
    <div className="rounded-lg border border-gray-200 border-l-4 border-l-cyan-500 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>🔒</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Security Deposits Held</h3>
            <p className="text-[10px] text-gray-400">Liability — held on behalf of customer</p>
          </div>
        </div>
        <span className="text-sm font-bold text-cyan-700">{formatCurrency(total)}</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {isEmpty ? (
          <p className="px-4 py-3 text-sm text-gray-400">No deposits collected</p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="flex items-center justify-between bg-gray-50 px-4 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group.label}</span>
                <span className="text-xs font-semibold text-gray-600">{formatCurrency(group.total)}</span>
              </div>
              {(group.rows as TransactionRow[]).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {tx.customerName ?? 'Unknown'}
                      {tx.wooOrderId && <span className="ml-1 text-xs text-gray-400">#{tx.wooOrderId}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tx.paymentType}
                      {tx.createdAt && ` · ${formatTime(tx.createdAt)}`}
                    </p>
                  </div>
                  <span className="ml-3 whitespace-nowrap text-sm font-medium text-cyan-700">
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ExpenseSection({
  expenses,
  total,
}: {
  expenses: ExpenseRow[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 border-l-4 border-l-red-500 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>🧾</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Expenses</h3>
            <p className="text-[10px] text-gray-400">All payment methods</p>
          </div>
        </div>
        <span className="text-sm font-bold text-red-700">{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {expenses.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No expenses</p>
        ) : (
          expenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {e.category}
                  {e.paidFromName && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {e.paidFromName}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {e.description}
                  {e.createdAt && ` · ${formatTime(e.createdAt)}`}
                </p>
              </div>
              <span className="ml-3 whitespace-nowrap text-sm font-medium text-red-700">
                -{formatCurrency(e.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MiscSalesSection({
  title,
  icon,
  rows,
  total,
  color,
  affectsTill,
}: {
  title: string;
  icon: string;
  rows: MiscSaleRow[];
  total: number;
  color: string;
  affectsTill?: boolean;
}) {
  const borderColor: Record<string, string> = {
    green: 'border-l-green-500',
    emerald: 'border-l-emerald-500',
    purple: 'border-l-purple-500',
    teal: 'border-l-teal-500',
    gray: 'border-l-gray-400',
  };
  const amountColor: Record<string, string> = {
    green: 'text-green-700',
    emerald: 'text-emerald-700',
    purple: 'text-purple-700',
    teal: 'text-teal-700',
    gray: 'text-gray-700',
  };

  return (
    <div className={`rounded-lg border border-gray-200 border-l-4 bg-white ${borderColor[color] ?? 'border-l-gray-400'}`}>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-[10px] text-gray-400">Misc income</p>
          </div>
          {!affectsTill && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              Info only
            </span>
          )}
        </div>
        <span className={`text-sm font-bold ${amountColor[color] ?? 'text-gray-900'}`}>
          {formatCurrency(total)}
        </span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No misc sales</p>
        ) : (
          rows.map((ms) => (
            <div key={ms.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {ms.description ?? 'Misc sale'}
                  {ms.category && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {ms.category}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {ms.accountName && <span className="font-medium">{ms.accountName}</span>}
                  {ms.accountName && ms.createdAt && ' · '}
                  {ms.createdAt && formatTime(ms.createdAt)}
                </p>
              </div>
              <span className={`ml-3 whitespace-nowrap text-sm font-medium ${amountColor[color] ?? 'text-gray-900'}`}>
                {formatCurrency(ms.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CharityDonationsSection({
  donations,
  total,
}: {
  donations: CharityDonationRow[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 border-l-4 border-l-teal-500 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>🐾</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Charity Donations — Be Pawsitive</h3>
            <p className="text-[10px] text-gray-400">Payable to Be Pawsitive NGO</p>
          </div>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
            Info only
          </span>
        </div>
        <span className="text-sm font-bold text-teal-700">{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {donations.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No donations today</p>
        ) : (
          donations.map((d) => (
            <div key={d.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {d.description ?? 'Charity donation'}
                </p>
                <p className="text-xs text-gray-500">
                  {d.createdAt && formatTime(d.createdAt)}
                </p>
              </div>
              <span className="ml-3 whitespace-nowrap text-sm font-medium text-teal-700">
                {formatCurrency(d.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DiscountsSection({
  discounts,
  total,
}: {
  discounts: DiscountRow[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-orange-200 border-l-4 border-l-orange-500 bg-white">
      <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>🏷️</span>
          <div>
            <h3 className="text-sm font-semibold text-orange-900">Discounts Given</h3>
            <p className="text-[10px] text-orange-700">Reduces revenue — already reflected in payment amounts</p>
          </div>
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
            Info only
          </span>
        </div>
        <span className="text-sm font-bold text-orange-700">-{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {discounts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No discounts</p>
        ) : (
          discounts.map((d) => (
            <div key={d.id} className="flex items-center justify-between border-b border-orange-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {d.customerName ?? 'Customer'}
                  {d.orderRef && <span className="ml-1 text-xs text-gray-400">#{d.orderRef}</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {d.vehicleName ?? 'Vehicle'}
                </p>
              </div>
              <span className="ml-3 whitespace-nowrap text-sm font-medium text-orange-700">
                -{formatCurrency(d.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RefundsSection({
  refunds,
  total,
}: {
  refunds: RefundRow[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-red-200 border-l-4 border-l-red-500 bg-white">
      <div className="flex items-center justify-between border-b border-red-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>↩️</span>
          <div>
            <h3 className="text-sm font-semibold text-red-900">Refunds Issued</h3>
            <p className="text-[10px] text-red-700">Cash paid back to customers — reduces till</p>
          </div>
        </div>
        <span className="text-sm font-bold text-red-700">-{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {refunds.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No refunds today</p>
        ) : (
          refunds.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-red-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {r.customerName ?? 'Customer'}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {r.paymentType} · {r.methodId}
                  {r.createdAt && ` · ${formatTime(r.createdAt)}`}
                </p>
              </div>
              <span className="ml-3 whitespace-nowrap text-sm font-medium text-red-700">
                -{formatCurrency(r.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DepositReturnsSection({
  returns: depositReturns,
  total,
}: {
  returns: DepositReturnRow[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-white">
      <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span>🔓</span>
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Deposit Returns</h3>
            <p className="text-[10px] text-amber-700">Deposits refunded at order settlement — reduces till</p>
          </div>
        </div>
        <span className="text-sm font-bold text-amber-700">-{formatCurrency(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {depositReturns.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No deposit returns today</p>
        ) : (
          depositReturns.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-amber-50 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {r.bookingToken ?? r.referenceId ?? 'Deposit return'}
                  {r.customerName && <span className="ml-1 font-normal text-gray-600">— {r.customerName}</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {r.createdAt && formatTime(r.createdAt)}
                </p>
              </div>
              <span className="ml-3 whitespace-nowrap text-sm font-medium text-amber-700">
                -{formatCurrency(r.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
