import { useState, useMemo } from 'react';
import { useBalancesV2, type BalanceSummaryGroup, type AccountBalanceItem } from '../../api/accounting.js';
import { useStores } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { Badge } from '../../components/common/Badge.js';

const TYPE_ORDER = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'];
const TYPE_COLORS: Record<string, string> = {
  Asset: 'blue',
  Liability: 'red',
  Income: 'green',
  Expense: 'amber',
  Equity: 'purple',
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentHalf(): '1' | '2' {
  return new Date().getDate() <= 15 ? '1' : '2';
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

function halfLabel(month: string, half: '1' | '2'): string {
  const [year, m] = month.split('-').map(Number);
  if (half === '1') return `1st – 15th`;
  const lastDay = new Date(year, m, 0).getDate();
  return `16th – ${lastDay}th`;
}

function displayBalance(balance: number, accountType: string): { value: number; color: string } {
  const creditNormal = ['Liability', 'Income', 'Equity'].includes(accountType);
  const display = creditNormal ? -balance : balance;
  return { value: display, color: display < 0 ? 'text-red-600' : 'text-gray-900' };
}

export default function AccountsPage() {
  const [storeId, setStoreId] = useState('all');
  const [month, setMonth] = useState(currentMonth);
  const [half, setHalf] = useState<'1' | '2'>(currentHalf);

  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;
  const { data, isLoading } = useBalancesV2(storeId, month, half);

  const months = useMemo(monthOptions, []);

  const sortedSummary = useMemo(() => {
    if (!data?.summary) return [];
    return [...data.summary].sort(
      (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
    );
  }, [data?.summary]);

  const grandTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const g of sortedSummary) {
      debit += g.totalDebit;
      credit += g.totalCredit;
    }
    return { debit, credit };
  }, [sortedSummary]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <div className="flex items-center gap-3">
          {/* Store filter */}
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Stores (Combined)</option>
            {[...storeList].sort((a, b) => {
              const aL = a.name.toLowerCase().includes('lola');
              const bL = b.name.toLowerCase().includes('lola');
              if (aL && !bL) return -1;
              if (!aL && bL) return 1;
              return a.name.localeCompare(b.name);
            }).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Month selector */}
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {/* Half selector */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setHalf('1')}
              className={`px-3 py-2 text-sm font-medium transition ${
                half === '1'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              1st – 15th
            </button>
            <button
              onClick={() => setHalf('2')}
              className={`px-3 py-2 text-sm font-medium transition border-l border-gray-300 ${
                half === '2'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              16th – End
            </button>
          </div>
        </div>
      </div>

      {/* Period indicator */}
      <div className="mb-4 text-sm text-gray-500">
        Showing {halfLabel(month, half)} of{' '}
        {months.find((m) => m.value === month)?.label ?? month}
        {data && <span className="ml-2">({data.from} to {data.to})</span>}
      </div>

      {isLoading && (
        <div className="py-12 text-center text-gray-500">Loading account balances...</div>
      )}

      {!isLoading && sortedSummary.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          No accounts found. Configure accounts in Settings → Chart of Accounts.
        </div>
      )}

      {/* Grand totals */}
      {!isLoading && sortedSummary.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Debits</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(grandTotals.debit)}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Credits</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(grandTotals.credit)}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Net Position</p>
            <p className={`text-xl font-bold ${grandTotals.debit - grandTotals.credit === 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {formatCurrency(grandTotals.debit - grandTotals.credit)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Account Groups</p>
            <p className="text-xl font-bold text-gray-900">{sortedSummary.length}</p>
          </div>
        </div>
      )}

      {/* Account groups */}
      <div className="space-y-6">
        {sortedSummary.map((group) => (
          <AccountTypeGroup key={group.type} group={group} />
        ))}
      </div>
    </div>
  );
}

function AccountTypeGroup({ group }: { group: BalanceSummaryGroup }) {
  const color = TYPE_COLORS[group.type] ?? 'gray';
  const creditNormal = ['Liability', 'Income', 'Equity'].includes(group.type);
  const groupDisplayBalance = creditNormal ? -group.netBalance : group.netBalance;

  return (
    <div className="rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Group header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge color={color as 'blue' | 'red' | 'green' | 'gray' | 'purple'}>{group.type}</Badge>
          <span className="text-sm text-gray-500">{group.accounts.length} account{group.accounts.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500">Debits: <span className="font-medium text-gray-900">{formatCurrency(group.totalDebit)}</span></span>
          <span className="text-gray-500">Credits: <span className="font-medium text-gray-900">{formatCurrency(group.totalCredit)}</span></span>
          <span className="text-gray-500">
            Balance:{' '}
            <span className={`font-bold ${groupDisplayBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
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
          {group.accounts.map((acct) => {
            const { value: bal, color: balColor } = displayBalance(acct.balance, acct.accountType);
            const hasActivity = acct.debitTotal > 0 || acct.creditTotal > 0;
            return (
              <tr
                key={acct.accountId}
                className={`border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer ${
                  !hasActivity ? 'opacity-50' : ''
                }`}
              >
                <td className="px-4 py-2.5 text-gray-900">{acct.accountName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {acct.debitTotal > 0 ? formatCurrency(acct.debitTotal) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {acct.creditTotal > 0 ? formatCurrency(acct.creditTotal) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${balColor}`}>
                  {hasActivity ? formatCurrency(bal) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
