import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccountLedger, useAccountSummary, type AccountBalanceItem } from '../../api/accounting.js';
import { useChartOfAccounts, useStores } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { ReconcileAccountModal } from '../../components/accounting/ReconcileAccountModal.js';
import {
  downloadCsv,
  formatShortDate,
  isCreditNormal,
  manilaMonth,
  periodRange,
  storeLabel,
  toDisplay,
} from './account-helpers.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const REFERENCE_LABELS: Record<string, string> = {
  payment: 'Payment',
  refund: 'Refund',
  deposit: 'Deposit',
  expense: 'Expense',
  order: 'Order',
  order_charity: 'Charity donation',
  cash_deposit: 'Cash drop / deposit',
  fund_transfer: 'Transfer',
  transfer: 'Transfer booking',
  inter_store_transfer: 'Inter-store transfer',
  owner_drawings: 'Owner drawings',
  payroll: 'Payroll',
  opening_balance: 'Opening balance',
  reconciliation_adjustment: 'Reconciliation',
  charity_payout: 'Charity payout',
  deposit_envelope_sync: 'Deposit envelope count',
  deposit_envelope_transfer: 'Deposit envelope transfer',
  deposit_refund_swap: 'Deposit refund (different tender)',
  misc_sale: 'Misc sale',
  vehicle: 'Vehicle',
  depreciation: 'Depreciation',
  maintenance_parts: 'Maintenance parts',
  maintenance_labour: 'Maintenance labour',
  adjustment: 'Adjustment',
};

interface CoaRow {
  id: string;
  name: string;
  accountType?: string;
  type?: string;
  storeId?: string | null;
}

export default function AccountDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [showReconcile, setShowReconcile] = useState(false);

  const defaults = periodRange(manilaMonth(), 'full');
  const from = ISO_DATE.test(params.get('from') ?? '') ? params.get('from')! : defaults.from;
  const to = ISO_DATE.test(params.get('to') ?? '') ? params.get('to')! : defaults.to;

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useAccountSummary(id, from, to);
  const { data: entries = [], isLoading: ledgerLoading } = useAccountLedger(id, from, to);
  const { data: coa = [] } = useChartOfAccounts() as { data: CoaRow[] };
  const { data: stores = [] } = useStores();

  const accountType = summary?.accountType ?? '';
  const creditNormal = isCreditNormal(accountType);
  const canReconcile = accountType === 'Asset' || accountType === 'Liability';

  const rows = useMemo(() => {
    let running = summary?.openingBalance ?? 0;
    return entries.map((e) => {
      running += Number(e.debit) - Number(e.credit);
      return { ...e, running };
    });
  }, [entries, summary?.openingBalance]);

  const reconcileAccount: AccountBalanceItem | null = summary
    ? {
        accountId: summary.accountId,
        accountName: summary.accountName,
        accountType: summary.accountType,
        storeId: summary.storeId,
        debitTotal: summary.periodDebit,
        creditTotal: summary.periodCredit,
        balance: summary.closingBalance,
      }
    : null;
  const offsetAccounts: AccountBalanceItem[] = useMemo(
    () => coa
      .filter((a) => ['Equity', 'Income', 'Expense'].includes(a.accountType ?? a.type ?? ''))
      .map((a) => ({
        accountId: a.id,
        accountName: a.name,
        accountType: a.accountType ?? a.type ?? '',
        storeId: a.storeId ?? null,
        debitTotal: 0,
        creditTotal: 0,
        balance: 0,
      })),
    [coa],
  );

  function setRange(nextFrom: string, nextTo: string) {
    if (!ISO_DATE.test(nextFrom) || !ISO_DATE.test(nextTo) || nextFrom > nextTo) return;
    setParams({ from: nextFrom, to: nextTo }, { replace: true });
  }

  function exportCsv() {
    const out: Array<Array<string | number>> = [['Date', 'Description', 'Type', 'Debit', 'Credit', 'Running balance']];
    out.push([from, 'Opening balance', '', '', '', toDisplay(summary?.openingBalance ?? 0, accountType).toFixed(2)]);
    for (const r of rows) {
      out.push([
        r.date,
        r.description ?? '',
        REFERENCE_LABELS[r.referenceType] ?? r.referenceType,
        Number(r.debit) > 0 ? Number(r.debit).toFixed(2) : '',
        Number(r.credit) > 0 ? Number(r.credit).toFixed(2) : '',
        toDisplay(r.running, accountType).toFixed(2),
      ]);
    }
    downloadCsv(`ledger_${id}_${from}_to_${to}.csv`, out);
  }

  if (summaryError) {
    return (
      <div>
        <BackLink onClick={() => navigate('/accounts')} />
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">This account could not be loaded.</div>
      </div>
    );
  }

  const today = manilaToday();

  return (
    <div className="font-lato">
      <BackLink onClick={() => navigate('/accounts')} />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl text-teal-brand">{summary?.accountName ?? id}</h1>
          {summary && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-600">{summary.accountType}</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-medium text-blue-600">
                {storeLabel(summary.storeId, stores as Array<{ id: string; name: string }>)}
              </span>
              <span className="text-gray-400">{summary.accountId}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setRange(e.target.value, to)}
            aria-label="From"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setRange(from, e.target.value)}
            aria-label="To"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
          />
          <button
            onClick={exportCsv}
            disabled={!summary || ledgerLoading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-charcoal-brand hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          {canReconcile && (
            <button
              onClick={() => setShowReconcile(true)}
              className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Count / reconcile
            </button>
          )}
        </div>
      </div>

      {summaryLoading || !summary ? (
        <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label={`Opening (${formatShortDate(from)})`} value={toDisplay(summary.openingBalance, accountType)} />
          <Stat label="Debits" value={summary.periodDebit} muted />
          <Stat label="Credits" value={summary.periodCredit} muted />
          <Stat label={`Closing (${formatShortDate(to > today ? today : to)})`} value={toDisplay(summary.closingBalance, accountType)} strong />
        </div>
      )}

      <section className="mb-6 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Debit</th>
                <th className="px-4 py-2 text-right font-medium">Credit</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {summary && (
                <tr className="border-b border-gray-100 bg-gray-50/60 text-gray-500">
                  <td className="px-4 py-2">{formatShortDate(from)}</td>
                  <td className="px-4 py-2" colSpan={4}>Opening balance</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(toDisplay(summary.openingBalance, accountType))}</td>
                </tr>
              )}
              {ledgerLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading ledger…</td></tr>
              )}
              {!ledgerLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No entries in this date range.</td></tr>
              )}
              {rows.map((r) => {
                const isRecon = r.referenceType === 'reconciliation_adjustment';
                const running = toDisplay(r.running, accountType);
                return (
                  <tr key={r.entryId} className={`border-b border-gray-50 ${isRecon ? 'bg-amber-50/60' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-600">{formatShortDate(r.date)}</td>
                    <td className="px-4 py-2 text-gray-900">{r.description ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">{REFERENCE_LABELS[r.referenceType] ?? r.referenceType}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.debit) > 0 ? formatCurrency(Number(r.debit)) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.credit) > 0 ? formatCurrency(Number(r.credit)) : <span className="text-gray-300">—</span>}</td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums ${running < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(running)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {summary && summary.reconciliations.length > 0 && (
        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-4 py-3 text-base font-semibold text-gray-900">Count history</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Counted on</th>
                <th className="px-4 py-2 text-right font-medium">Ledger said</th>
                <th className="px-4 py-2 text-right font-medium">{creditNormal ? 'Actually owed' : 'Counted'}</th>
                <th className="px-4 py-2 text-right font-medium">Difference</th>
                <th className="px-4 py-2 text-left font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {summary.reconciliations.map((r) => {
                const diff = toDisplay(r.variance, accountType);
                return (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-700">{formatShortDate(r.asOfDate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(toDisplay(r.ledgerBalance, accountType))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(toDisplay(r.countedBalance, accountType))}</td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums ${Math.abs(diff) < 0.01 ? 'text-green-600' : 'text-amber-700'}`}>
                      {Math.abs(diff) < 0.01 ? 'Matched' : `${diff > 0 ? '+' : '−'}${formatCurrency(Math.abs(diff))}`}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {reconcileAccount && (
        <ReconcileAccountModal
          open={showReconcile}
          initialAccountId={reconcileAccount.accountId}
          accounts={[reconcileAccount]}
          offsetAccounts={offsetAccounts}
          onClose={() => setShowReconcile(false)}
        />
      )}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-teal-brand">
      ← Back to Accounts
    </button>
  );
}

function Stat({ label, value, muted, strong }: { label: string; value: number; muted?: boolean; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? 'text-2xl font-bold' : 'text-xl font-semibold'} ${
        value < 0 ? 'text-red-600' : muted ? 'text-gray-700' : 'text-gray-900'
      }`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
