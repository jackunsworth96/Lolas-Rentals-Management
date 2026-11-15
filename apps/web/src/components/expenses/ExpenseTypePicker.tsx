import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ExpenseCatalogItem } from '../../api/expenses.js';
import { formatCurrency } from '../../utils/currency.js';
import { inputCls, recentTypeIds } from './expense-ui.js';

interface Props {
  catalog: ExpenseCatalogItem[];
  isManager: boolean;
  canGrantAdvances: boolean;
  onPick: (item: ExpenseCatalogItem) => void;
}

const LINK_LABELS: Record<string, string> = {
  '/hr/timesheets': 'Timesheets',
  '/hr/payroll': 'Payroll',
  '/maintenance': 'Maintenance',
  '/orders/active': 'Active orders',
};

export function canLog(item: ExpenseCatalogItem, isManager: boolean, canGrantAdvances: boolean): boolean {
  if (!item.isActive || item.kind === 'system' || item.kind === 'handled_elsewhere') return false;
  if (item.managersOnly && !isManager) return false;
  if (item.kind === 'cash_advance' && !canGrantAdvances) return false;
  return true;
}

function TypeTile({ item, onPick }: { item: ExpenseCatalogItem; onPick: (i: ExpenseCatalogItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className="flex min-h-[4.5rem] flex-col items-start rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-teal-500 hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <span className="text-sm font-semibold text-gray-900">{item.name}</span>
      {item.helpText && <span className="mt-0.5 line-clamp-2 text-pretty text-xs text-gray-500">{item.helpText}</span>}
      {item.softLimit != null && (
        <span className="mt-auto pt-1 text-[11px] tabular-nums text-gray-400">Usually up to {formatCurrency(item.softLimit)}</span>
      )}
    </button>
  );
}

export function ExpenseTypePicker({ catalog, isManager, canGrantAdvances, onPick }: Props) {
  const [query, setQuery] = useState('');

  const loggable = useMemo(
    () => catalog.filter((c) => canLog(c, isManager, canGrantAdvances)),
    [catalog, isManager, canGrantAdvances],
  );
  const elsewhere = useMemo(() => catalog.filter((c) => c.kind === 'handled_elsewhere'), [catalog]);

  const q = query.trim().toLowerCase();
  const matches = (c: ExpenseCatalogItem) =>
    !q || c.name.toLowerCase().includes(q) || (c.helpText ?? '').toLowerCase().includes(q) || (c.groupName ?? '').toLowerCase().includes(q);

  const recent = useMemo(() => {
    const byId = new Map(loggable.map((c) => [c.id, c]));
    return recentTypeIds().map((id) => byId.get(id)).filter((c): c is ExpenseCatalogItem => !!c).slice(0, 4);
  }, [loggable]);

  const groups = useMemo(() => {
    const out = new Map<string, ExpenseCatalogItem[]>();
    for (const c of loggable.filter(matches)) {
      const g = c.groupName ?? 'Other';
      out.set(g, [...(out.get(g) ?? []), c]);
    }
    return [...out.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggable, q]);
  const elsewhereMatches = elsewhere.filter(matches);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="expense-type-search" className="sr-only">Search expense types</label>
        <input
          id="expense-type-search"
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, e.g. fuel, meal, printing"
          className={inputCls}
        />
      </div>

      {!q && recent.length > 0 && (
        <section aria-labelledby="recent-types">
          <h3 id="recent-types" className="mb-2 text-xs font-semibold uppercase text-gray-500">Most used</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recent.map((c) => <TypeTile key={c.id} item={c} onPick={onPick} />)}
          </div>
        </section>
      )}

      {groups.map(([group, items]) => (
        <section key={group} aria-label={group}>
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">{group}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((c) => <TypeTile key={c.id} item={c} onPick={onPick} />)}
          </div>
        </section>
      ))}

      {groups.length === 0 && elsewhereMatches.length === 0 && (
        <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
          No expense type matches “{query}”.{' '}
          {isManager
            ? <>Try another word, or pick <strong>Other</strong> and describe it.</>
            : 'Try another word, or ask a manager to log it.'}
        </p>
      )}

      {elsewhereMatches.length > 0 && (
        <section aria-labelledby="elsewhere-types" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h3 id="elsewhere-types" className="mb-1 text-sm font-semibold text-amber-900">Not logged here</h3>
          <p className="mb-2 text-pretty text-xs text-amber-800">
            These are paid through other pages so payroll and the books stay correct.
          </p>
          <ul className="divide-y divide-amber-200">
            {elsewhereMatches.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  {c.helpText && <p className="text-pretty text-xs text-gray-600">{c.helpText}</p>}
                </div>
                {c.linkPath && (
                  <Link to={c.linkPath} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100">
                    Open {LINK_LABELS[c.linkPath] ?? 'page'}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
