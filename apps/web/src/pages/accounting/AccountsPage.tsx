import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  useBalancesV2,
  useLastDepreciationDate,
  type AccountBalanceItem,
} from '../../api/accounting.js';
import { useFleetBookValueSummary } from '../../api/fleet.js';
import { useStores } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { Badge } from '../../components/common/Badge.js';
import { OwnerDrawingsModal } from '../../components/accounting/OwnerDrawingsModal.js';
import { TransferFundsModal } from '../../components/accounting/TransferFundsModal.js';
import { ReconcileAccountModal } from '../../components/accounting/ReconcileAccountModal.js';
import { CharityPayoutModal } from '../../components/accounting/CharityPayoutModal.js';
import { COMPANY_STORE_ID } from '@lolas/shared';
import {
  BALANCE_SHEET_TYPES,
  CHARITY_PAYABLE_ID,
  CHARITY_WALLET_ID,
  TYPE_ORDER,
  daysBetween,
  downloadCsv,
  formatShortDate,
  isCustomerDepositLiability,
  isLiquidAccount,
  liquidSortKey,
  manilaMonth,
  monthOptions,
  periodRange,
  storeLabel,
  toDisplay,
  type HalfPeriod,
} from './account-helpers.js';

const TYPE_COLORS: Record<string, 'blue' | 'red' | 'green' | 'amber' | 'purple'> = {
  Asset: 'blue',
  Liability: 'red',
  Income: 'green',
  Expense: 'amber',
  Equity: 'purple',
};

const TYPE_BORDER: Record<string, string> = {
  Asset: 'border-teal-600',
  Liability: 'border-red-500',
  Income: 'border-green-600',
  Expense: 'border-amber-500',
  Equity: 'border-purple-600',
};

const TYPE_TITLES: Record<string, string> = {
  Asset: 'Assets',
  Liability: 'Liabilities',
  Equity: 'Equity',
  Income: 'Income',
  Expense: 'Expenses',
};

/** A count older than this is flagged as due. */
const COUNT_DUE_DAYS = 7;

function hasActivity(a: AccountBalanceItem): boolean {
  return a.debitTotal !== 0 || a.creditTotal !== 0;
}

function isZeroRow(a: AccountBalanceItem): boolean {
  if (BALANCE_SHEET_TYPES.includes(a.accountType)) return Math.abs(a.balance) < 0.005 && !hasActivity(a);
  return !hasActivity(a);
}

function periodNet(a: AccountBalanceItem): number {
  const net = a.debitTotal - a.creditTotal;
  return toDisplay(net, a.accountType);
}

function sortAccounts(type: string, accounts: AccountBalanceItem[]): AccountBalanceItem[] {
  return [...accounts].sort((a, b) => {
    if (type === 'Asset') {
      const diff = liquidSortKey(a.accountId) - liquidSortKey(b.accountId);
      if (diff !== 0) return diff;
    }
    return a.accountName.localeCompare(b.accountName) || (a.storeId ?? '').localeCompare(b.storeId ?? '');
  });
}

// ─── More Actions dropdown ────────────────────────────────────────────────────
function MoreActionsMenu({ actions }: { actions: Array<{ label: string; onClick: () => void }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-charcoal-brand hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Record…
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {actions.map((a, i) => (
            <button
              key={a.label}
              role="menuitem"
              className={`flex w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}
              onClick={() => { setOpen(false); a.onClick(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Last-counted badge ───────────────────────────────────────────────────────
function CountBadge({ account, reportDate }: { account: AccountBalanceItem; reportDate: string }) {
  const last = account.lastReconciliation;
  if (!last) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Never counted</span>;
  }
  const age = daysBetween(last.asOfDate, reportDate);
  const due = age > COUNT_DUE_DAYS;
  const hadVariance = Math.abs(last.variance) >= 0.01;
  const title = `Counted ${formatShortDate(last.asOfDate)}: ${formatCurrency(toDisplay(last.countedBalance, account.accountType))}`
    + (hadVariance ? ` (ledger was off by ${formatCurrency(Math.abs(last.variance))})` : ' (matched)')
    + ` — ${last.notes}`;
  return (
    <span
      title={title}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        due ? 'bg-amber-100 text-amber-800' : 'bg-green-50 text-green-700'
      }`}
    >
      {age <= 0 ? 'Counted today' : `Counted ${age}d ago`}{due ? ' · due' : ''}
    </span>
  );
}

// ─── Fleet book value callout ─────────────────────────────────────────────────
function FleetBookValueCallout() {
  const { data: fleet } = useFleetBookValueSummary();
  const { data: lastDep } = useLastDepreciationDate();

  const bookValue = fleet?.totalBookValue ?? 0;
  const count = fleet?.activeCount ?? 0;
  const lastDate = lastDep?.date ? formatShortDate(lastDep.date) : 'never';

  return (
    <div className="border-t border-gray-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
      <span className="font-semibold">Asset register (not part of these totals):</span>{' '}
      fleet book value <span className="tabular-nums">{formatCurrency(bookValue)}</span> across {count} active
      vehicle{count !== 1 ? 's' : ''}; depreciation last posted {lastDate}.{' '}
      <Link to="/fleet/asset-register" className="font-medium underline hover:text-blue-900">View asset register</Link>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const navigate = useNavigate();
  const today = manilaToday();
  const [storeId, setStoreId] = useState('all');
  const [month, setMonth] = useState(manilaMonth);
  const [half, setHalf] = useState<HalfPeriod>('full');
  const [asOf, setAsOf] = useState('');
  const [hideZero, setHideZero] = useState(true);

  const [showTransfer, setShowTransfer] = useState(false);
  const [showDrawings, setShowDrawings] = useState(false);
  const [showCharity, setShowCharity] = useState(false);
  const [reconcileFor, setReconcileFor] = useState<string | null | undefined>(undefined);

  const { data: stores = [] } = useStores();
  const storeList = (stores as Array<{ id: string; name: string }>).filter((s) => s.id !== COMPANY_STORE_ID);
  const months = useMemo(() => monthOptions(), []);
  const range = periodRange(month, half);
  const effectiveAsOf = asOf && asOf >= range.from && asOf < range.to ? asOf : '';
  const { data, isLoading, isError, error, refetch, isFetching } = useBalancesV2(storeId, month, half, effectiveAsOf || undefined);

  const reportTo = data?.to ?? range.to;
  const reportDate = reportTo > today ? today : reportTo;
  const isAllStores = storeId === 'all';
  const selectedStoreName = isAllStores ? 'All stores' : storeLabel(storeId, storeList);

  const accounts = useMemo(
    () => (data?.summary ?? []).flatMap((g) => g.accounts),
    [data?.summary],
  );

  const liquid = useMemo(
    () => sortAccounts('Asset', accounts.filter(isLiquidAccount)),
    [accounts],
  );

  const position = useMemo(() => {
    const cashOnHand = liquid.reduce((s, a) => s + a.balance, 0);
    const depositsHeld = accounts.filter(isCustomerDepositLiability).reduce((s, a) => s - a.balance, 0);
    const charityOwed = -(accounts.find((a) => a.accountId === CHARITY_PAYABLE_ID)?.balance ?? 0);
    const charityWallet = accounts.find((a) => a.accountId === CHARITY_WALLET_ID)?.balance ?? 0;
    return {
      cashOnHand,
      depositsHeld,
      charityOwed,
      charityWallet,
      charitySetAside: Math.max(0, charityOwed - charityWallet),
      freeCash: cashOnHand - depositsHeld - charityOwed,
    };
  }, [accounts, liquid]);

  const totals = useMemo(() => {
    const sum = (type: string, fn: (a: AccountBalanceItem) => number) =>
      accounts.filter((a) => a.accountType === type).reduce((s, a) => s + fn(a), 0);
    const assets = sum('Asset', (a) => a.balance);
    const liabilities = sum('Liability', (a) => -a.balance);
    const income = sum('Income', (a) => a.creditTotal - a.debitTotal);
    const expenses = sum('Expense', (a) => a.debitTotal - a.creditTotal);
    return { assets, liabilities, netAssets: assets - liabilities, income, expenses, result: income - expenses };
  }, [accounts]);

  const ledgerCheck = data?.ledgerCheck;
  const ledgerBalanced = ledgerCheck ? Math.round(ledgerCheck.debits * 100) === Math.round(ledgerCheck.credits * 100) : true;

  const groups = useMemo(() => {
    return TYPE_ORDER.map((type) => {
      const all = sortAccounts(type, accounts.filter((a) => a.accountType === type));
      const visible = hideZero ? all.filter((a) => !isZeroRow(a)) : all;
      return { type, all, visible };
    }).filter((g) => g.all.length > 0);
  }, [accounts, hideZero]);

  const reconcilable = useMemo(
    () => sortAccounts('Asset', accounts.filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability')),
    [accounts],
  );
  const offsetAccounts = useMemo(
    () => accounts.filter((a) => ['Equity', 'Income', 'Expense'].includes(a.accountType)),
    [accounts],
  );

  const openAccount = (accountId: string) => navigate(`/accounts/${encodeURIComponent(accountId)}?from=${range.from}&to=${reportTo}`);

  function exportCsv() {
    const rows: Array<Array<string | number>> = [[
      'Type', 'Account', 'Account ID', 'Store', 'Opening', 'Debits', 'Credits', 'Closing', 'Last counted', 'Last count variance',
    ]];
    for (const g of groups) {
      for (const a of g.all) {
        rows.push([
          a.accountType,
          a.accountName,
          a.accountId,
          storeLabel(a.storeId, storeList),
          toDisplay(a.openingBalance ?? 0, a.accountType).toFixed(2),
          a.debitTotal.toFixed(2),
          a.creditTotal.toFixed(2),
          toDisplay(a.balance, a.accountType).toFixed(2),
          a.lastReconciliation?.asOfDate ?? '',
          a.lastReconciliation ? a.lastReconciliation.variance.toFixed(2) : '',
        ]);
      }
    }
    downloadCsv(`accounts_${storeId}_${range.from}_to_${reportTo}.csv`, rows);
  }

  return (
    <div className="font-lato">
      {/* ── Title ────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl text-teal-brand">Accounts</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Balances as of <span className="font-medium text-gray-700">{formatShortDate(reportDate)}</span> · {selectedStoreName}
            {isFetching && !isLoading && <span className="ml-2 text-xs text-gray-400">Refreshing…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={!data}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-charcoal-brand hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
          <MoreActionsMenu
            actions={[
              { label: 'Transfer between accounts', onClick: () => setShowTransfer(true) },
              { label: 'Charity payout', onClick: () => setShowCharity(true) },
              { label: 'Owner drawings', onClick: () => setShowDrawings(true) },
            ]}
          />
          <button
            onClick={() => setReconcileFor(null)}
            disabled={!data}
            className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            Reconcile
          </button>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          aria-label="Store"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
        >
          <option value="all">All stores</option>
          {[...storeList].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="h-5 w-px bg-gray-200" />

        <select
          value={month}
          onChange={(e) => { setMonth(e.target.value); setAsOf(''); }}
          aria-label="Month"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
        >
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <div className="flex overflow-hidden rounded-lg border border-gray-200" role="group" aria-label="Period">
          {([
            { value: '1' as HalfPeriod, label: '1st – 15th' },
            { value: '2' as HalfPeriod, label: '16th – End' },
            { value: 'full' as HalfPeriod, label: 'Full month' },
          ]).map((opt, i) => (
            <button
              key={opt.value}
              onClick={() => { setHalf(opt.value); setAsOf(''); }}
              aria-pressed={half === opt.value}
              className={[
                'px-3 py-2 text-sm font-medium transition',
                i > 0 ? 'border-l border-gray-200' : '',
                half === opt.value ? 'bg-teal-brand text-white' : 'bg-white text-charcoal-brand hover:bg-gray-50',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          As of
          <input
            type="date"
            value={effectiveAsOf}
            min={range.from}
            max={range.to < today ? range.to : today}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
          />
          {effectiveAsOf && (
            <button onClick={() => setAsOf('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          )}
        </label>

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-teal-brand focus:ring-teal-brand"
          />
          Hide unused accounts
        </label>
      </div>

      <p className="mb-5 text-sm text-gray-500">
        Activity from {formatShortDate(range.from)} to {formatShortDate(reportTo)}. Balances are running totals
        from the start of the books.
      </p>

      {isLoading && (
        <div className="space-y-4" aria-busy>
          {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold">Could not load account balances.</p>
          <p className="mt-1">{(error as Error)?.message}</p>
          <button onClick={() => refetch()} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium hover:bg-red-100">
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && accounts.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          No accounts found. Configure accounts in Settings → Chart of Accounts.
        </div>
      )}

      {!isLoading && !isError && accounts.length > 0 && (
        <>
          {/* ── Cash position ────────────────────────────────────────────── */}
          <section className="mb-6 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Cash position</h2>
                <p className="text-xs text-gray-500">Every account you can count or match to a statement.</p>
              </div>
              {ledgerCheck && (
                ledgerBalanced ? (
                  <span className="flex items-center gap-1 text-sm font-medium text-green-600" title={`Debits ${formatCurrency(ledgerCheck.debits)} = credits ${formatCurrency(ledgerCheck.credits)}`}>
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    Books balance
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm font-medium text-red-600">
                    Books out of balance by {formatCurrency(Math.abs(ledgerCheck.debits - ledgerCheck.credits))}
                  </span>
                )
              )}
            </div>

            <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 font-medium">Last count</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {liquid.map((a) => (
                    <tr key={a.accountId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <button onClick={() => openAccount(a.accountId)} className="text-left text-gray-900 hover:text-teal-brand">
                          {a.accountName}
                        </button>
                        {a.accountId === CHARITY_WALLET_ID && (
                          <span className="ml-2 text-xs text-gray-400">charity money</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${a.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCurrency(a.balance)}
                      </td>
                      <td className="px-3 py-2.5"><CountBadge account={a} reportDate={reportDate} /></td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => setReconcileFor(a.accountId)}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-teal-brand hover:bg-teal-50"
                        >
                          Count
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td className="px-5 py-2.5 font-semibold text-gray-900">Total cash held</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-gray-900">{formatCurrency(position.cashOnHand)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>

              <div className="space-y-3 border-t border-gray-100 bg-teal-50/40 p-5 text-sm lg:border-l lg:border-t-0">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total cash held</span>
                  <span className="tabular-nums font-medium">{formatCurrency(position.cashOnHand)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Less customer deposits</span>
                  <span className="tabular-nums text-red-600">−{formatCurrency(position.depositsHeld)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Less charity owed</span>
                  <span className="tabular-nums text-red-600">−{formatCurrency(position.charityOwed)}</span>
                </div>
                <div className="flex justify-between border-t border-teal-100 pt-3">
                  <span className="font-semibold text-gray-900">Free cash</span>
                  <span className={`text-lg font-bold tabular-nums ${position.freeCash < 0 ? 'text-red-600' : 'text-teal-brand'}`}>
                    {formatCurrency(position.freeCash)}
                  </span>
                </div>
                {position.charityOwed > 0 && (
                  <div className="rounded-lg bg-white/80 p-3 text-xs text-gray-600">
                    Charity owed {formatCurrency(position.charityOwed)}: {formatCurrency(position.charityWallet)} is in the
                    charity wallet, and <span className="font-semibold text-gray-800">{formatCurrency(position.charitySetAside)}</span> is
                    set aside inside the Safe / Wise balances above.
                    <button onClick={() => setShowCharity(true)} className="mt-2 block font-medium text-teal-brand hover:underline">
                      Record a charity payout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Summary cards ────────────────────────────────────────────── */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total assets" value={totals.assets} />
            <SummaryCard label="Total liabilities" value={totals.liabilities} />
            <SummaryCard label="Net assets" value={totals.netAssets} tone={totals.netAssets >= 0 ? 'good' : 'bad'} hint="Assets minus liabilities" />
            <SummaryCard
              label="Profit for period"
              value={totals.result}
              tone={totals.result >= 0 ? 'good' : 'bad'}
              hint={`Income ${formatCurrency(totals.income)} − expenses ${formatCurrency(totals.expenses)}`}
            />
          </div>

          {/* ── Account groups ───────────────────────────────────────────── */}
          <div className="space-y-6">
            {groups.map((g) => (
              <AccountGroup
                key={g.type}
                type={g.type}
                accounts={g.visible}
                hiddenCount={g.all.length - g.visible.length}
                allAccounts={g.all}
                isAllStores={isAllStores}
                stores={storeList}
                reportDate={reportDate}
                onOpen={openAccount}
                onReconcile={(id) => setReconcileFor(id)}
                footer={g.type === 'Asset' ? <FleetBookValueCallout /> : null}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showTransfer && <TransferFundsModal accounts={liquid} onClose={() => setShowTransfer(false)} />}
      {showCharity && (
        <CharityPayoutModal sourceAccounts={liquid} owed={position.charityOwed} onClose={() => setShowCharity(false)} />
      )}
      <OwnerDrawingsModal
        isOpen={showDrawings}
        accounts={liquid.filter((a) => a.accountId !== CHARITY_WALLET_ID)}
        onClose={() => setShowDrawings(false)}
      />
      <ReconcileAccountModal
        open={reconcileFor !== undefined}
        initialAccountId={reconcileFor ?? null}
        accounts={reconcilable}
        offsetAccounts={offsetAccounts}
        onClose={() => setReconcileFor(undefined)}
      />
    </div>
  );
}

function SummaryCard({ label, value, tone, hint }: { label: string; value: number; tone?: 'good' | 'bad'; hint?: string }) {
  const color = tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{formatCurrency(value)}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── Account group ────────────────────────────────────────────────────────────
function AccountGroup({
  type,
  accounts,
  allAccounts,
  hiddenCount,
  isAllStores,
  stores,
  reportDate,
  onOpen,
  onReconcile,
  footer,
}: {
  type: string;
  accounts: AccountBalanceItem[];
  allAccounts: AccountBalanceItem[];
  hiddenCount: number;
  isAllStores: boolean;
  stores: Array<{ id: string; name: string }>;
  reportDate: string;
  onOpen: (accountId: string) => void;
  onReconcile: (accountId: string) => void;
  footer: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isBalanceSheet = BALANCE_SHEET_TYPES.includes(type);
  const canReconcile = type === 'Asset' || type === 'Liability';
  const border = TYPE_BORDER[type] ?? 'border-gray-400';

  const groupTotal = isBalanceSheet
    ? allAccounts.reduce((s, a) => s + toDisplay(a.balance, type), 0)
    : allAccounts.reduce((s, a) => s + periodNet(a), 0);

  // In the all-stores view, accounts that share a name across stores roll up into one expandable row.
  const rows = useMemo(() => {
    if (!isAllStores) return accounts.map((a) => ({ key: a.accountId, name: a.accountName, members: [a] }));
    const map = new Map<string, { key: string; name: string; members: AccountBalanceItem[] }>();
    for (const a of accounts) {
      const entry = map.get(a.accountName) ?? { key: `name:${a.accountName}`, name: a.accountName, members: [] };
      entry.members.push(a);
      map.set(a.accountName, entry);
    }
    return [...map.values()];
  }, [accounts, isAllStores]);

  const sumOf = (members: AccountBalanceItem[], fn: (a: AccountBalanceItem) => number) => members.reduce((s, a) => s + fn(a), 0);

  function renderCells(members: AccountBalanceItem[]) {
    const opening = sumOf(members, (a) => toDisplay(a.openingBalance ?? 0, type));
    const debits = sumOf(members, (a) => a.debitTotal);
    const credits = sumOf(members, (a) => a.creditTotal);
    const closing = sumOf(members, (a) => toDisplay(a.balance, type));
    const net = sumOf(members, periodNet);
    const dash = <span className="text-gray-300">—</span>;
    return (
      <>
        {isBalanceSheet && (
          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{opening !== 0 ? formatCurrency(opening) : dash}</td>
        )}
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{debits !== 0 ? formatCurrency(debits) : dash}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{credits !== 0 ? formatCurrency(credits) : dash}</td>
        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${(isBalanceSheet ? closing : net) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {formatCurrency(isBalanceSheet ? closing : net)}
        </td>
      </>
    );
  }

  function accountRow(a: AccountBalanceItem, indent: boolean) {
    return (
      <tr key={a.accountId} className="cursor-pointer border-b border-gray-50 hover:bg-gray-50" onClick={() => onOpen(a.accountId)}>
        <td className={`border-l-4 ${border} px-4 py-2.5`}>
          <span className={`text-gray-900 ${indent ? 'pl-5' : ''}`}>{a.accountName}</span>
          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {storeLabel(a.storeId, stores)}
          </span>
        </td>
        {renderCells([a])}
        {canReconcile && (
          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-2">
              <CountBadge account={a} reportDate={reportDate} />
              <button
                onClick={() => onReconcile(a.accountId)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-teal-brand hover:bg-teal-50"
              >
                Count
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge color={TYPE_COLORS[type] ?? 'gray'}>{TYPE_TITLES[type] ?? type}</Badge>
          <span className="text-sm text-gray-500">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
            {hiddenCount > 0 && <span className="text-gray-400"> · {hiddenCount} unused hidden</span>}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {isBalanceSheet ? 'Closing balance' : 'Net for period'}:{' '}
          <span className={`font-bold tabular-nums ${groupTotal < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(groupTotal)}</span>
        </span>
      </div>

      {accounts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">No activity in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Account</th>
                {isBalanceSheet && <th className="px-3 py-2 text-right font-medium">Opening</th>}
                <th className="px-3 py-2 text-right font-medium">Debits</th>
                <th className="px-3 py-2 text-right font-medium">Credits</th>
                <th className="px-3 py-2 text-right font-medium">{isBalanceSheet ? 'Closing' : 'Net'}</th>
                {canReconcile && <th className="px-3 py-2 text-right font-medium">Last count</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.members.length === 1) return accountRow(row.members[0], false);
                const open = expanded.has(row.key);
                return (
                  <Fragment key={row.key}>
                    <tr
                      className="cursor-pointer border-b border-gray-50 bg-gray-50/40 hover:bg-gray-50"
                      onClick={() => setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
                        return next;
                      })}
                      aria-expanded={open}
                    >
                      <td className={`border-l-4 ${border} px-4 py-2.5 text-gray-900`}>
                        <span className="mr-1 inline-block w-3 text-gray-400">{open ? '▾' : '▸'}</span>
                        {row.name}
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {row.members.length} stores
                        </span>
                      </td>
                      {renderCells(row.members)}
                      {canReconcile && <td />}
                    </tr>
                    {open && row.members.map((a) => accountRow(a, true))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </section>
  );
}
