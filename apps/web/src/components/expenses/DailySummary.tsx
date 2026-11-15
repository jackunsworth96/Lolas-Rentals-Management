import { useMemo } from 'react';
import type { EnrichedExpense } from '../../api/expenses.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  expenses: EnrichedExpense[];
  periodLabel: string;
}

function sumBy(rows: EnrichedExpense[], key: (e: EnrichedExpense) => string) {
  const m = new Map<string, number>();
  for (const e of rows) m.set(key(e), (m.get(key(e)) ?? 0) + e.amount);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function DailySummary({ expenses, periodLabel }: Props) {
  const stats = useMemo(() => {
    const paid = expenses.filter((e) => e.status === 'paid');
    const unpaid = expenses.filter((e) => e.status === 'unpaid');
    const payouts = expenses.filter((e) => e.kind === 'bike_allowance' || e.kind === 'cash_advance');
    return {
      total: expenses.reduce((s, e) => s + e.amount, 0),
      unpaidTotal: unpaid.reduce((s, e) => s + e.amount, 0),
      unpaidCount: unpaid.length,
      payoutTotal: payouts.reduce((s, e) => s + e.amount, 0),
      bySource: sumBy(paid, (e) => e.paidFromName ?? 'Unknown'),
      byType: sumBy(expenses, (e) => e.category),
    };
  }, [expenses]);

  return (
    <section aria-label="Summary" className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs font-medium text-gray-500">Total spent · {periodLabel}</p>
          <p className="text-2xl font-semibold tabular-nums text-gray-900">{formatCurrency(stats.total)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Paid out of</p>
          {stats.bySource.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing paid</p>
          ) : (
            <ul className="text-sm">
              {stats.bySource.map(([src, amt]) => (
                <li key={src} className="flex justify-between gap-2">
                  <span className="truncate text-gray-600">{src}</span>
                  <span className="tabular-nums font-medium text-gray-900">{formatCurrency(amt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Staff payouts</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">{formatCurrency(stats.payoutTotal)}</p>
          <p className="text-xs text-gray-500">Bike allowance and cash advances</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Still to pay</p>
          <p className={`text-lg font-semibold tabular-nums ${stats.unpaidCount ? 'text-amber-700' : 'text-gray-900'}`}>
            {formatCurrency(stats.unpaidTotal)}
          </p>
          <p className="text-xs text-gray-500">{stats.unpaidCount} unpaid</p>
        </div>
      </div>
      {stats.byType.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {stats.byType.map(([type, amt]) => (
            <li key={type} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm">
              <span className="text-gray-700">{type}</span>
              <span className="ml-2 font-semibold tabular-nums text-gray-900">{formatCurrency(amt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
