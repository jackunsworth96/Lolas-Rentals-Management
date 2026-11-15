import { useMemo } from 'react';
import type { EnrichedExpense } from '../../api/expenses.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatTime } from '../../utils/date.js';
import { formatShortDate } from './expense-ui.js';

interface Props {
  expenses: EnrichedExpense[];
  groupByDate: boolean;
  selectable: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (e: EnrichedExpense) => void;
  onDelete: (e: EnrichedExpense) => void;
  emptyAction?: React.ReactNode;
}

const KIND_BADGE: Partial<Record<EnrichedExpense['kind'], string>> = {
  bike_allowance: 'Bike allowance',
  cash_advance: 'Cash advance',
};

function Row({ e, selectable, selected, onToggle, onEdit, onDelete }: {
  e: EnrichedExpense;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onEdit: (e: EnrichedExpense) => void;
  onDelete: (e: EnrichedExpense) => void;
}) {
  const badge = KIND_BADGE[e.kind] ?? (e.linkedTo === 'timesheet' ? '9pm return' : e.linkedTo === 'maintenance' ? 'Maintenance' : null);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {selectable && (
        <input
          type="checkbox"
          aria-label={`Select ${e.category} ${formatCurrency(e.amount)}`}
          checked={selected}
          onChange={() => onToggle(e.id)}
          className="mt-1 size-4 rounded border-gray-300"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{e.category}</span>
          {e.status === 'unpaid' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Unpaid</span>}
          {badge && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">{badge}</span>}
          {e.employeeName && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">{e.employeeName}</span>}
          {e.vehicleName && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{e.vehicleName}</span>}
        </div>
        <p className="mt-0.5 text-pretty text-sm text-gray-600">{e.description}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          {e.paidFromName && <span>Paid from {e.paidFromName}</span>}
          {e.accountName && <span>Books to {e.accountName}</span>}
          <span>
            {e.createdByName ? `Logged by ${e.createdByName}` : 'Logged'} at {formatTime(e.createdAt)}
          </span>
          {e.updatedByName && <span>Changed by {e.updatedByName}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(e.amount)}</span>
        {e.canChange && (
          <div className="flex gap-1">
            <button type="button" onClick={() => onEdit(e)} className="rounded px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50">
              Edit
            </button>
            <button type="button" onClick={() => onDelete(e)} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function ExpenseList({ expenses, groupByDate, selectable, selectedIds, onToggle, onEdit, onDelete, emptyAction }: Props) {
  const groups = useMemo(() => {
    if (!groupByDate) return [['', expenses] as const];
    const m = new Map<string, EnrichedExpense[]>();
    for (const e of expenses) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [expenses, groupByDate]);

  if (expenses.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-12 text-center">
        <p className="text-sm text-gray-500">No expenses here.</p>
        {emptyAction && <div className="mt-3">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([day, rows]) => (
        <section key={day || 'all'} className="rounded-lg border border-gray-200 bg-white">
          {day && (
            <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-900">{formatShortDate(day)}</h3>
              <span className="text-sm tabular-nums text-gray-600">{formatCurrency(rows.reduce((s, e) => s + e.amount, 0))}</span>
            </header>
          )}
          <ul className="divide-y divide-gray-100">
            {rows.map((e) => (
              <Row key={e.id} e={e} selectable={selectable} selected={selectedIds.has(e.id)} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
