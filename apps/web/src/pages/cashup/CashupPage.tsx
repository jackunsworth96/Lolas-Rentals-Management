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
} from '../../api/cashup.js';
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

function varianceBg(v: number): string {
  if (v === 0) return 'bg-green-50 border-green-200';
  if (Math.abs(v) <= 100) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
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

  // Expected figures split (includes cash misc sales in till calculation)
  const expectedCashSales = summary
    ? summary.openingFloat.amount +
      summary.totals.cashSalesTotal +
      (summary.totals.miscCashTotal ?? 0) +
      summary.totals.interStoreIn -
      summary.totals.expenseTotal -
      summary.totals.depositTotal -
      summary.totals.interStoreOut
    : 0;
  const expectedDepositsHeld = summary
    ? summary.totals.cashDepositsHeldTotal
    : 0;
  const tillVariance = tillTotal - expectedCashSales;
  const depVariance = depEnvTotal - expectedDepositsHeld;

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
            <Button size="sm" variant="secondary" onClick={openTransferModal}>
              {isLolasStore
                ? `Issue Float to ${otherStoreName}`
                : `Send Cash to ${otherStoreName}`}
            </Button>
          )}
          {!isLocked && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowDepositModal(true)}
            >
              Cash Deposited
            </Button>
          )}
        </div>
      </div>

      {/* Store tabs — Lola's first */}
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
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

      {/* Date navigation */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => setDate(shiftDate(date, -1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          onClick={() => setDate(shiftDate(date, 1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <Button size="sm" variant="ghost" onClick={() => setShowOverrideModal(true)}>
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

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-8">
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
              <SummaryCard label="Misc Sales" value={summary.totals.miscSalesTotal} color="emerald" subtitle={`Cash ${formatCurrency(summary.totals.miscCashTotal ?? 0)}`} />
            )}
            <SummaryCard label="GCash Sales" value={summary.totals.gcashSalesTotal} color="teal" subtitle="Income" />
            <SummaryCard label="Deposits Held" value={summary.totals.depositsHeldTotal} color="cyan" subtitle="Liability — all methods" />
            <SummaryCard label="Expenses" value={summary.totals.expenseTotal} color="red" subtitle="All methods" />
            <SummaryCard label="Cash Deposited" value={summary.totals.depositTotal} color="blue" />
            {(summary.totals.interStoreIn > 0 || summary.totals.interStoreOut > 0) && (
              <SummaryCard
                label="Transfers"
                value={summary.totals.interStoreIn - summary.totals.interStoreOut}
                color="violet"
                subtitle={`In ${formatCurrency(summary.totals.interStoreIn)} / Out ${formatCurrency(summary.totals.interStoreOut)}`}
              />
            )}
            <SummaryCard label="Expected Cash" value={expectedCashSales} color="indigo" subtitle="Sales only" />
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
            {(summary.totals.charityDonationsTotal ?? 0) > 0 && (
              <CharityDonationsSection
                donations={summary.charityDonations ?? []}
                total={summary.totals.charityDonationsTotal}
              />
            )}
          </div>

          {/* Denomination Counting + Expected vs Actual */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Till denomination grid */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                  Till Count
                </h3>
                {hasSavedDenoms && !isLocked && (
                  <Button size="sm" variant="ghost" onClick={loadSavedDenoms}>
                    Load saved
                  </Button>
                )}
              </div>
              <DenominationGrid
                denoms={tillDenoms}
                onChange={setTillDenom}
                disabled={isLocked}
              />
              <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">
                    Total Till
                  </span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(tillTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Deposit envelope denomination grid */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="mb-4 text-base font-semibold text-gray-900">
                Deposit Envelope Count
              </h3>
              <DenominationGrid
                denoms={depEnvDenoms}
                onChange={setDepEnvDenom}
                disabled={isLocked}
              />
              <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">
                    Total Deposits
                  </span>
                  <span className="text-lg font-bold text-cyan-700">
                    {formatCurrency(depEnvTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Expected vs Actual — two rows */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={`rounded-lg border p-5 ${varianceBg(tillVariance)}`}>
              <h3 className="mb-4 text-base font-semibold text-gray-900">
                Expected Cash vs Actual Counted
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Expected Cash (sales)</span>
                  <span className="font-medium">{formatCurrency(expectedCashSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Actual Counted (till)</span>
                  <span className="font-medium">{formatCurrency(tillTotal)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold">Variance</span>
                    <span className={`text-lg font-bold ${varianceColor(tillVariance)}`}>
                      {tillVariance > 0 ? '+' : ''}
                      {formatCurrency(tillVariance)}
                    </span>
                  </div>
                  {tillVariance !== 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {tillVariance > 0 ? 'Over' : 'Short'} by{' '}
                      {formatCurrency(Math.abs(tillVariance))}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className={`rounded-lg border p-5 ${varianceBg(depVariance)}`}>
              <h3 className="mb-4 text-base font-semibold text-gray-900">
                Expected Deposits Held vs Envelope
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Expected Deposits (cash)</span>
                  <span className="font-medium">{formatCurrency(expectedDepositsHeld)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Deposit Envelope Count</span>
                  <span className="font-medium">{formatCurrency(depEnvTotal)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold">Variance</span>
                    <span className={`text-lg font-bold ${varianceColor(depVariance)}`}>
                      {depVariance > 0 ? '+' : ''}
                      {formatCurrency(depVariance)}
                    </span>
                  </div>
                  {depVariance !== 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {depVariance > 0 ? 'Over' : 'Short'} by{' '}
                      {formatCurrency(Math.abs(depVariance))}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {!isLocked && (
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => setShowReconcileModal(true)}
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

      {/* ── Reconcile Confirmation Modal ── */}
      {showReconcileModal && summary && (
        <ModalOverlay onClose={() => setShowReconcileModal(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              Confirm Reconciliation
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              This will lock the cash up record for{' '}
              <span className="font-medium">{formatDateLabel(date)}</span>.
            </p>
            <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
              <Row label="Opening Float" value={summary.openingFloat.amount} />
              <Row label="Cash Sales (income)" value={summary.totals.cashSalesTotal} color="green" />
              {(summary.totals.miscCashTotal ?? 0) > 0 && (
                <Row label="Misc Sales — Cash (income)" value={summary.totals.miscCashTotal} color="green" />
              )}
              <Row label="Cash Deposits Held (liability)" value={summary.totals.cashDepositsHeldTotal} color="cyan" />
              {summary.totals.interStoreIn > 0 && (
                <Row label="Inter-store Cash In" value={summary.totals.interStoreIn} color="green" />
              )}
              <Row label="Expenses Paid" value={-summary.totals.expenseTotal} color="red" />
              <Row label="Cash Deposited" value={-summary.totals.depositTotal} color="blue" />
              {summary.totals.interStoreOut > 0 && (
                <Row label="Inter-store Cash Out" value={-summary.totals.interStoreOut} color="red" />
              )}
              <div className="border-t border-gray-200 pt-2">
                <Row label="Expected Cash (sales)" value={expectedCashSales} bold />
                <Row label="Expected Deposits Held" value={expectedDepositsHeld} bold />
              </div>
              <Row label="Till Counted" value={tillTotal} bold />
              <Row label="Deposit Envelope" value={depEnvTotal} bold />
              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Till Variance</span>
                  <span className={`font-bold ${varianceColor(tillVariance)}`}>
                    {tillVariance > 0 ? '+' : ''}{formatCurrency(tillVariance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Deposit Variance</span>
                  <span className={`font-bold ${varianceColor(depVariance)}`}>
                    {depVariance > 0 ? '+' : ''}{formatCurrency(depVariance)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowReconcileModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleReconcile} loading={reconcileMut.isPending}>
                Confirm & Lock
              </Button>
            </div>
          </div>
        </ModalOverlay>
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
        <ModalOverlay onClose={() => setShowTransferModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              {isLolasStore
                ? `Issue Float to ${otherStoreName}`
                : `Send Cash to ${otherStoreName}`}
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              {isLolasStore
                ? `Transfer opening float from ${currentStoreName} to ${otherStoreName}.`
                : `Send end-of-day cash from ${currentStoreName} to ${otherStoreName}.`}
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
              {!routedCashAcct && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  From — {currentStoreName} Cash Account *
                </label>
                <select
                  value={transferFromAcct}
                  onChange={(e) => setTransferFromAcct(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select account...</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
              </div>
              )}
              {!routedOtherCashAcct && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  To — {otherStoreName} Cash Account *
                </label>
                <select
                  value={transferToAcct}
                  onChange={(e) => setTransferToAcct(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select account...</option>
                  {otherStoreAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
              </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowTransferModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleTransfer}
                loading={transferMut.isPending}
                disabled={!transferAmount || parseFloat(transferAmount) <= 0 || !transferFromAcct || !transferToAcct}
              >
                {isLolasStore ? 'Issue Float' : 'Send Cash'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function DenominationGrid({
  denoms,
  onChange,
  disabled,
}: {
  denoms: Record<number, number>;
  onChange: (denom: number, count: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      {DENOMINATIONS.map((d) => (
        <div key={d} className="flex items-center gap-3">
          <span className="w-16 text-right text-sm font-medium text-gray-700">
            ₱{d.toLocaleString()}
          </span>
          <span className="text-gray-400">×</span>
          <input
            type="number"
            min={0}
            value={denoms[d] || ''}
            onChange={(e) => onChange(d, parseInt(e.target.value) || 0)}
            disabled={disabled}
            className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-center text-sm disabled:bg-gray-50"
            placeholder="0"
          />
          <span className="text-sm text-gray-500">
            = {formatCurrency(d * (denoms[d] || 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  badge,
  badgeColor,
  subtitle,
}: {
  label: string;
  value: number;
  color?: string;
  badge?: string;
  badgeColor?: string;
  subtitle?: string;
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
  };
  const badgeMap: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
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

function Row({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: number;
  color?: string;
  bold?: boolean;
}) {
  const colorCls =
    color === 'green' ? 'text-green-700' :
    color === 'red' ? 'text-red-700' :
    color === 'blue' ? 'text-blue-700' :
    color === 'cyan' ? 'text-cyan-700' : '';
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-semibold' : 'text-gray-600'}>{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${colorCls}`}>
        {formatCurrency(value)}
      </span>
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
            <h3 className="text-sm font-semibold text-gray-900">Charity Donations — BePawsitive</h3>
            <p className="text-[10px] text-gray-400">Payable to BePawsitive NGO</p>
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
