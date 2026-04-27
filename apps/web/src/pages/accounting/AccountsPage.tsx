import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  useBalancesV2,
  useTransferFunds,
  useLastDepreciationDate,
  type BalanceSummaryGroup,
  type AccountBalanceItem,
} from '../../api/accounting.js';
import { useFleetBookValueSummary } from '../../api/fleet.js';
import { useStores, useChartOfAccounts } from '../../api/config.js';
import { COMPANY_STORE_ID } from '@lolas/shared';
import { formatCurrency } from '../../utils/currency.js';
import { Badge } from '../../components/common/Badge.js';
import { Button } from '../../components/common/Button.js';
import { OwnerDrawingsModal } from '../../components/accounting/OwnerDrawingsModal.js';

type HalfPeriod = '1' | '2' | 'full';

const TYPE_ORDER = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'];

const TYPE_COLORS: Record<string, string> = {
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

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0).getDate();
}

function padDay(d: number): string {
  return String(d).padStart(2, '0');
}

function monthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
}

function periodIndicator(month: string, half: HalfPeriod, monthLabel: string): string {
  const last = padDay(lastDayOfMonth(month));
  if (half === 'full') return `Showing full month of ${monthLabel} (${month}-01 to ${month}-${last})`;
  if (half === '1') return `Showing 1st – 15th of ${monthLabel} (${month}-01 to ${month}-15)`;
  return `Showing 16th – End of ${monthLabel} (${month}-16 to ${month}-${last})`;
}

function displayBalance(balance: number, accountType: string): { value: number; color: string } {
  const creditNormal = ['Liability', 'Income', 'Equity'].includes(accountType);
  const display = creditNormal ? -balance : balance;
  return { value: display, color: display < 0 ? 'text-red-600' : 'text-gray-900' };
}

function sortAccountsInGroup(accounts: AccountBalanceItem[]): AccountBalanceItem[] {
  return [...accounts].sort(
    (a, b) =>
      a.accountName.localeCompare(b.accountName) ||
      (a.storeId ?? '').localeCompare(b.storeId ?? ''),
  );
}

interface RolledUpAccount {
  key: string;
  accountName: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
  storeCount: number;
}

function rollupByName(accounts: AccountBalanceItem[]): RolledUpAccount[] {
  const map = new Map<string, RolledUpAccount>();
  for (const acct of accounts) {
    const key = `${acct.accountType}::${acct.accountName}`;
    const existing = map.get(key);
    if (existing) {
      existing.debitTotal += acct.debitTotal;
      existing.creditTotal += acct.creditTotal;
      existing.balance += acct.balance;
      existing.storeCount += 1;
    } else {
      map.set(key, {
        key,
        accountName: acct.accountName,
        accountType: acct.accountType,
        debitTotal: acct.debitTotal,
        creditTotal: acct.creditTotal,
        balance: acct.balance,
        storeCount: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.accountName.localeCompare(b.accountName));
}

// ─── More Actions dropdown ────────────────────────────────────────────────────
function MoreActionsMenu({
  onTransfer,
  onDrawings,
}: {
  onTransfer: () => void;
  onDrawings: () => void;
}) {
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
        aria-label="More actions"
      >
        <span className="text-base leading-none">•••</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
            onClick={() => { setOpen(false); onTransfer(); }}
          >
            Transfer Funds
          </button>
          <button
            className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
            onClick={() => { setOpen(false); onDrawings(); }}
          >
            Owner Drawings
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Fleet book value callout ─────────────────────────────────────────────────
function FleetBookValueCallout() {
  const { data: fleet } = useFleetBookValueSummary();
  const { data: lastDep } = useLastDepreciationDate();

  const bookValue = fleet?.totalBookValue ?? 0;
  const count = fleet?.activeCount ?? 0;
  const lastDate = lastDep?.date
    ? new Date(lastDep.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Never';

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-lato text-blue-800">
      <p>
        <span className="font-semibold">Fleet book value (live):</span>{' '}
        <span className="font-lato tabular-nums">
          {bookValue.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 })}
        </span>{' '}
        across <span className="font-semibold">{count}</span> active vehicle{count !== 1 ? 's' : ''}
      </p>
      <p className="mt-0.5 text-blue-700">
        Last depreciation posted:{' '}
        <span className="font-medium">{lastDate}</span>
      </p>
      <Link
        to="/fleet/asset-register"
        className="mt-1 inline-block font-medium text-blue-700 underline hover:text-blue-900"
      >
        View Asset Register →
      </Link>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState('all');
  const [month, setMonth] = useState(currentMonth);
  const [half, setHalf] = useState<HalfPeriod>('full');

  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;
  const { data, isLoading } = useBalancesV2(storeId, month, half);

  const [showTransfer, setShowTransfer] = useState(false);
  const [showDrawings, setShowDrawings] = useState(false);
  const months = useMemo(monthOptions, []);

  const nonCompanyStoreCount = useMemo(
    () => storeList.filter((s) => s.id !== COMPANY_STORE_ID).length,
    [storeList],
  );

  const isAllStores = storeId === 'all';

  const currentMonthLabel = months.find((m) => m.value === month)?.label ?? month;

  const storeLabel = useMemo(() => {
    if (storeId === 'all') return 'All Stores';
    return storeList.find((s) => s.id === storeId)?.name ?? storeId;
  }, [storeId, storeList]);

  const { storeGroups, companyGroups } = useMemo(() => {
    if (!data?.summary) return { storeGroups: [], companyGroups: [] };
    const store: BalanceSummaryGroup[] = [];
    const company: BalanceSummaryGroup[] = [];
    for (const group of data.summary) {
      const companyAccts = sortAccountsInGroup(
        group.accounts.filter((a) => a.storeId === COMPANY_STORE_ID),
      );
      const storeAccts = sortAccountsInGroup(
        group.accounts.filter((a) => a.storeId !== COMPANY_STORE_ID),
      );
      if (storeAccts.length > 0) {
        const d = storeAccts.reduce((s, a) => s + a.debitTotal, 0);
        const c = storeAccts.reduce((s, a) => s + a.creditTotal, 0);
        store.push({ type: group.type, totalDebit: d, totalCredit: c, netBalance: d - c, accounts: storeAccts });
      }
      if (companyAccts.length > 0) {
        const d = companyAccts.reduce((s, a) => s + a.debitTotal, 0);
        const c = companyAccts.reduce((s, a) => s + a.creditTotal, 0);
        company.push({ type: group.type, totalDebit: d, totalCredit: c, netBalance: d - c, accounts: companyAccts });
      }
    }
    const sort = (arr: BalanceSummaryGroup[]) =>
      [...arr].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
    return { storeGroups: sort(store), companyGroups: sort(company) };
  }, [data?.summary]);

  const allGroups = useMemo(() => [...storeGroups, ...companyGroups], [storeGroups, companyGroups]);

  // ── KPI derivations ────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    let totalDebits = 0;
    let totalCredits = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const g of allGroups) {
      totalDebits += g.totalDebit;
      totalCredits += g.totalCredit;
      if (g.type === 'Asset') {
        // Asset: debit-normal. balance = debit - credit. Positive = healthy.
        totalAssets += g.accounts.reduce((s, a) => s + a.balance, 0);
      }
      if (g.type === 'Liability') {
        // Liability: credit-normal. netBalance = debit - credit (negative means healthy credit balance).
        // Display as positive: what is owed = -(debit - credit) = credit - debit
        totalLiabilities += g.accounts.reduce((s, a) => s + (-a.balance), 0);
      }
    }

    const netEquity = totalAssets - totalLiabilities;
    const isBalanced = Math.round(totalDebits * 100) === Math.round(totalCredits * 100);

    return { totalDebits, totalCredits, totalAssets, totalLiabilities, netEquity, isBalanced };
  }, [allGroups]);

  return (
    <div className="font-lato">
      {/* ── Page title ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl text-teal-brand">Accounts</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {currentMonthLabel} · {storeLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
            title="Export coming soon"
          >
            Export
          </button>
          <MoreActionsMenu
            onTransfer={() => setShowTransfer(true)}
            onDrawings={() => setShowDrawings(true)}
          />
        </div>
      </div>

      {/* ── Unified filter bar ──────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        {/* Store selector */}
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          title="Overrides your default store for this page"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
        >
          <option value="all">
            All Stores{isAllStores ? ` (${nonCompanyStoreCount})` : ''}
          </option>
          {[...storeList]
            .filter((s) => s.id !== COMPANY_STORE_ID)
            .sort((a, b) => {
              const aL = a.name.toLowerCase().includes('lola');
              const bL = b.name.toLowerCase().includes('lola');
              if (aL && !bL) return -1;
              if (!aL && bL) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
        </select>

        <div className="h-5 w-px bg-gray-200" />

        {/* Month selector */}
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Period segmented control */}
        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          {(
            [
              { value: '1' as HalfPeriod, label: '1st – 15th' },
              { value: '2' as HalfPeriod, label: '16th – End' },
              { value: 'full' as HalfPeriod, label: 'Full Month' },
            ] as { value: HalfPeriod; label: string }[]
          ).map((opt, i) => (
            <button
              key={opt.value}
              onClick={() => setHalf(opt.value)}
              className={[
                'px-3 py-2 text-sm font-medium transition',
                i > 0 ? 'border-l border-gray-200' : '',
                half === opt.value
                  ? 'bg-teal-brand text-white'
                  : 'bg-white text-charcoal-brand hover:bg-gray-50',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Period indicator ────────────────────────────────────────────────── */}
      <p className="mb-5 text-sm text-gray-500">
        {periodIndicator(month, half, currentMonthLabel)}
      </p>

      {isLoading && (
        <div className="py-12 text-center text-gray-500">Loading account balances…</div>
      )}

      {!isLoading && allGroups.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          No accounts found. Configure accounts in Settings → Chart of Accounts.
        </div>
      )}

      {!isLoading && allGroups.length > 0 && (
        <>
          {/* ── Primary KPI cards ──────────────────────────────────────────── */}
          <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Assets</p>
              <p className="mt-1 font-lato text-2xl font-bold tabular-nums text-gray-900">
                {formatCurrency(kpi.totalAssets)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Liabilities</p>
              <p className="mt-1 font-lato text-2xl font-bold tabular-nums text-gray-900">
                {formatCurrency(kpi.totalLiabilities)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Net Equity</p>
              <p className={`mt-1 font-lato text-2xl font-bold tabular-nums ${kpi.netEquity >= 0 ? 'text-green-600' : 'text-amber-500'}`}>
                {formatCurrency(kpi.netEquity)}
              </p>
            </div>
          </div>

          {/* ── Secondary reconciliation bar ───────────────────────────────── */}
          <div className="mb-6 flex flex-wrap items-center gap-6 rounded-xl border border-gray-100 bg-gray-50 px-5 py-3 text-sm">
            <span className="text-gray-500">
              Total Debits:{' '}
              <span className="font-lato font-semibold tabular-nums text-gray-700">
                {formatCurrency(kpi.totalDebits)}
              </span>
            </span>
            <span className="text-gray-500">
              Total Credits:{' '}
              <span className="font-lato font-semibold tabular-nums text-gray-700">
                {formatCurrency(kpi.totalCredits)}
              </span>
            </span>
            {kpi.isBalanced ? (
              <span className="flex items-center gap-1 font-medium text-green-600">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Ledger balanced
              </span>
            ) : (
              <span className="flex items-center gap-1 font-medium text-amber-600">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Ledger out of balance
              </span>
            )}
          </div>

          {/* ── Store account groups ──────────────────────────────────────── */}
          {storeGroups.length > 0 && (
            <div className="space-y-6">
              {storeGroups.map((group) => (
                <Fragment key={group.type}>
                  <AccountTypeGroup
                    group={group}
                    isAllStores={isAllStores}
                    onAccountClick={(id) => navigate(`/accounts/${id}`)}
                  />
                  {group.type === 'Asset' && <FleetBookValueCallout />}
                </Fragment>
              ))}
            </div>
          )}

          {/* ── Company-wide accounts ────────────────────────────────────── */}
          {companyGroups.length > 0 && (
            <div className="mt-8 space-y-6">
              <div className="flex items-center gap-3">
                <h2 className="font-lato text-base font-semibold text-gray-700">Company Accounts</h2>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                  Shared across all stores
                </span>
              </div>
              {companyGroups.map((group) => (
                <AccountTypeGroup
                  key={`company-${group.type}`}
                  group={group}
                  isAllStores={isAllStores}
                  onAccountClick={(id) => navigate(`/accounts/${id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showTransfer && (
        <TransferFundsModal onClose={() => setShowTransfer(false)} />
      )}
      <OwnerDrawingsModal
        isOpen={showDrawings}
        onClose={() => setShowDrawings(false)}
      />
    </div>
  );
}

// ─── Transfer Funds modal (unchanged logic, only extracted here) ──────────────
function TransferFundsModal({ onClose }: { onClose: () => void }) {
  const { data: accounts = [] } = useChartOfAccounts() as { data: Array<{ id: string; name: string; type: string }> };
  const transfer = useTransferFunds();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const sorted = useMemo(() => [...accounts].sort((a, b) => a.name.localeCompare(b.name)), [accounts]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || from === to || !amount) return;
    transfer.mutate(
      { fromAccountId: from, toAccountId: to, amount: Number(amount), date: today, description: description || 'Fund transfer' },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Transfer Funds</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">From Account</label>
            <select required value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50">
              <option value="">Select account</option>
              {sorted.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">To Account</label>
            <select required value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50">
              <option value="">Select account</option>
              {sorted.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Amount</label>
            <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50" placeholder="Fund transfer" />
          </div>
          {transfer.isError && (
            <p className="text-sm text-red-600">Transfer failed. Please try again.</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <Button type="submit" loading={transfer.isPending}>Transfer</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Account type group ───────────────────────────────────────────────────────
function AccountTypeGroup({
  group,
  isAllStores,
  onAccountClick,
}: {
  group: BalanceSummaryGroup;
  isAllStores: boolean;
  onAccountClick: (accountId: string) => void;
}) {
  const badgeColor = TYPE_COLORS[group.type] ?? 'gray';
  const creditNormal = ['Liability', 'Income', 'Equity'].includes(group.type);
  const groupDisplayBalance = creditNormal ? -group.netBalance : group.netBalance;
  const borderClass = TYPE_BORDER[group.type] ?? 'border-gray-400';

  const rolledUp = useMemo(
    () => (isAllStores ? rollupByName(group.accounts) : null),
    [isAllStores, group.accounts],
  );
  const rowCount = rolledUp ? rolledUp.length : group.accounts.length;

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      {/* Group header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge color={badgeColor as 'blue' | 'red' | 'green' | 'gray' | 'purple' | 'amber'}>
            {group.type}
          </Badge>
          <span className="text-sm text-gray-500">{rowCount} account{rowCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-gray-500">
            Debits:{' '}
            <span className="font-lato font-medium tabular-nums text-gray-900">
              {formatCurrency(group.totalDebit)}
            </span>
          </span>
          <span className="text-gray-500">
            Credits:{' '}
            <span className="font-lato font-medium tabular-nums text-gray-900">
              {formatCurrency(group.totalCredit)}
            </span>
          </span>
          <span className="text-gray-500">
            Balance:{' '}
            <span className={`font-lato font-bold tabular-nums ${groupDisplayBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatCurrency(groupDisplayBalance)}
            </span>
          </span>
        </div>
      </div>

      {/* Accounts table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2 text-left font-medium text-gray-600">Account</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Debits</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Credits</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rolledUp
            ? rolledUp.map((acct) => {
                const { value: bal, color: balColor } = displayBalance(acct.balance, acct.accountType);
                const hasActivity = acct.debitTotal > 0 || acct.creditTotal > 0;
                return (
                  <tr
                    key={acct.key}
                    className={`border-b border-gray-50 transition ${!hasActivity ? 'cursor-default opacity-50' : ''}`}
                  >
                    <td className={`border-l-4 ${borderClass} px-4 py-2.5 text-gray-900`}>
                      <span className="inline-flex flex-wrap items-center gap-x-1">
                        <span>{acct.accountName}</span>
                        {acct.storeCount > 1 && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            {acct.storeCount} stores
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-lato tabular-nums text-gray-700">
                      {acct.debitTotal > 0 ? formatCurrency(acct.debitTotal) : <span className="text-center text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-lato tabular-nums text-gray-700">
                      {acct.creditTotal > 0 ? formatCurrency(acct.creditTotal) : <span className="text-center text-gray-400">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-lato tabular-nums font-medium ${balColor}`}>
                      {hasActivity ? formatCurrency(bal) : <span className="text-center text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })
            : group.accounts.map((acct) => {
                const { value: bal, color: balColor } = displayBalance(acct.balance, acct.accountType);
                const hasActivity = acct.debitTotal > 0 || acct.creditTotal > 0;
                const rowKey = `${acct.accountId}-${acct.storeId ?? ''}`;
                return (
                  <tr
                    key={rowKey}
                    onClick={hasActivity ? () => onAccountClick(acct.accountId) : undefined}
                    className={`border-b border-gray-50 transition ${
                      hasActivity
                        ? 'cursor-pointer hover:bg-gray-50'
                        : 'cursor-default opacity-50'
                    }`}
                  >
                    <td className={`border-l-4 ${borderClass} px-4 py-2.5`}>
                      <span className={hasActivity ? 'text-gray-900 hover:text-teal-brand' : 'text-gray-900'}>
                        {acct.accountName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-lato tabular-nums text-gray-700">
                      {acct.debitTotal > 0 ? formatCurrency(acct.debitTotal) : <span className="text-center text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-lato tabular-nums text-gray-700">
                      {acct.creditTotal > 0 ? formatCurrency(acct.creditTotal) : <span className="text-center text-gray-400">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-lato tabular-nums font-medium ${balColor}`}>
                      {hasActivity ? formatCurrency(bal) : <span className="text-center text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
