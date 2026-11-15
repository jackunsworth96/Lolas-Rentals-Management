import { useMemo, useState } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import {
  useExpenses,
  useDeleteExpense,
  type EnrichedExpense,
  type ExpenseCatalogItem,
} from '../../api/expenses.js';
import { useExpenseCategories, useChartOfAccounts, usePaymentMethods } from '../../api/config.js';
import { useFleet } from '../../api/fleet.js';
import { manilaToday } from '../../utils/date.js';
import { Button } from '../../components/common/Button.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { ExpenseFormModal, type AccountOption } from '../../components/expenses/ExpenseFormModal.js';
import { ExpenseList } from '../../components/expenses/ExpenseList.js';
import { DailySummary } from '../../components/expenses/DailySummary.js';
import { PayUnpaidModal } from '../../components/expenses/PayUnpaidModal.js';
import { errorReasons, formatDateLabel, formatShortDate, inputCls, shiftDate } from '../../components/expenses/expense-ui.js';
import { formatCurrency } from '../../utils/currency.js';

type View = 'day' | 'week' | 'month';
type StatusTab = 'all' | 'paid' | 'unpaid';

function rangeFor(view: View, date: string): { date: string } | { dateFrom: string; dateTo: string } {
  if (view === 'day') return { date };
  if (view === 'week') return { dateFrom: shiftDate(date, -6), dateTo: date };
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { dateFrom: `${date.slice(0, 7)}-01`, dateTo: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

function periodLabel(view: View, date: string): string {
  if (view === 'day') return formatDateLabel(date);
  if (view === 'week') return `${formatShortDate(shiftDate(date, -6))} – ${formatShortDate(date)}`;
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function stepDate(view: View, date: string, dir: 1 | -1): string {
  if (view === 'day') return shiftDate(date, dir);
  if (view === 'week') return shiftDate(date, 7 * dir);
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir, 1);
  return d.toISOString().slice(0, 10);
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={dir === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

export default function ExpensesPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission('can_edit_expenses');
  const isManager = hasPermission('can_edit_accounts');
  const canGrantAdvances = hasPermission('can_manage_employees');
  const today = manilaToday();

  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<StatusTab>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');

  const range = rangeFor(view, date);
  const { data: expenses = [], isLoading, isError, error } = useExpenses(storeId, range, {
    categoryId: typeFilter ? Number(typeFilter) : undefined,
    vehicleId: vehicleFilter || undefined,
  });
  const { data: rawCatalog = [] } = useExpenseCategories(storeId || undefined) as { data: ExpenseCatalogItem[] | undefined };
  const { data: rawAccounts = [] } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const { data: rawMethods = [] } = usePaymentMethods() as { data: Array<{ id: string; name: string; isActive?: boolean }> | undefined };
  const { data: fleet = [] } = useFleet(storeId);
  const deleteMut = useDeleteExpense();

  const catalog = useMemo(
    () => [...rawCatalog].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [rawCatalog],
  );
  const accounts = useMemo<AccountOption[]>(
    () => rawAccounts.map((a) => ({
      id: String(a.id),
      name: String(a.name),
      accountType: String(a.accountType ?? a.account_type ?? ''),
      storeId: (a.storeId ?? a.store_id ?? null) as string | null,
    })),
    [rawAccounts],
  );
  const paymentMethods = useMemo(() => rawMethods.filter((m) => m.isActive !== false), [rawMethods]);
  const vehicles = useMemo(
    () => fleet
      .filter((v) => v.storeId === storeId && v.status !== 'Sold')
      .map((v) => ({ id: v.id, label: v.plateNumber ? `${v.name} (${v.plateNumber})` : v.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [fleet, storeId],
  );
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? id ?? '—';

  const staffOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of expenses) if (e.employeeId && e.employeeName) m.set(e.employeeId, e.employeeName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [expenses]);

  const scoped = useMemo(
    () => (staffFilter ? expenses.filter((e) => e.employeeId === staffFilter) : expenses),
    [expenses, staffFilter],
  );
  const shown = useMemo(() => (status === 'all' ? scoped : scoped.filter((e) => e.status === status)), [scoped, status]);
  const counts = { all: scoped.length, paid: scoped.filter((e) => e.status === 'paid').length, unpaid: scoped.filter((e) => e.status === 'unpaid').length };

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedExpense | null>(null);
  const [deleting, setDeleting] = useState<EnrichedExpense | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);

  const selectedRows = shown.filter((e) => selected.has(e.id));
  const filtersActive = !!(typeFilter || staffFilter || vehicleFilter);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const deleteMessage = deleting && (
    <>
      <p>
        Delete <strong>{deleting.category}</strong> for <strong className="tabular-nums">{formatCurrency(deleting.amount)}</strong>?
        Its accounting entries are removed too.
      </p>
      {deleting.kind === 'bike_allowance' && <p className="mt-2">The amount goes back on {deleting.employeeName ?? 'the staff member'}'s bike allowance balance.</p>}
      {deleting.kind === 'cash_advance' && <p className="mt-2">The repayment schedule is cancelled, so nothing will be deducted from their pay.</p>}
    </>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold text-gray-900">Expenses</h1>
        {canEdit && <Button onClick={openNew}>Log expense</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div role="tablist" aria-label="Period" className="flex rounded-lg border border-gray-200 p-0.5">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setView(v);
                setSelected(new Set());
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {v === 'day' ? 'Day' : v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2">
          <button type="button" aria-label="Previous" onClick={() => setDate(stepDate(view, date, -1))} className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50">
            <ChevronIcon dir="left" />
          </button>
          <p className="min-w-0 flex-1 text-center text-sm font-semibold text-gray-900 sm:text-base">
            {periodLabel(view, date)}
            {view === 'day' && date === today && <span className="ml-2 text-xs font-medium text-teal-700">Today</span>}
          </p>
          <button
            type="button"
            aria-label="Next"
            disabled={date >= today}
            onClick={() => {
              const next = stepDate(view, date, 1);
              setDate(next > today ? today : next);
            }}
            className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
        <input
          type="date"
          aria-label="Go to date"
          max={today}
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="text-sm font-medium text-teal-700 hover:underline">
            Today
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <select aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls}>
          <option value="">All types</option>
          {catalog.filter((c) => c.kind !== 'handled_elsewhere').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Filter by staff member" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className={inputCls}>
          <option value="">All staff</option>
          {staffOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Filter by vehicle" value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className={inputCls}>
          <option value="">All vehicles</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </div>

      {isError ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errorReasons(error).join(' ')}</p>
      ) : isLoading ? (
        <div className="space-y-3" aria-busy>
          <div className="h-28 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
        </div>
      ) : (
        <>
          <DailySummary expenses={scoped} periodLabel={view === 'day' ? 'this day' : view === 'week' ? 'these 7 days' : 'this month'} />

          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Payment status" className="flex flex-1 rounded-lg border border-gray-200 bg-white p-1">
              {(['all', 'paid', 'unpaid'] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={status === tab}
                  onClick={() => {
                    setStatus(tab);
                    setSelected(new Set());
                  }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${status === tab ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {tab === 'all' ? 'All' : tab === 'paid' ? 'Paid' : 'Unpaid'}
                  <span className="ml-1.5 text-xs tabular-nums opacity-75">({counts[tab]})</span>
                </button>
              ))}
            </div>
            {status === 'unpaid' && canEdit && selectedRows.length > 0 && (
              <Button onClick={() => setPayOpen(true)}>
                Pay selected ({selectedRows.length}) · {formatCurrency(selectedRows.reduce((s, e) => s + e.amount, 0))}
              </Button>
            )}
          </div>

          <ExpenseList
            expenses={shown}
            groupByDate={view !== 'day'}
            selectable={status === 'unpaid' && canEdit}
            selectedIds={selected}
            onToggle={toggle}
            onEdit={(e) => {
              setEditing(e);
              setFormOpen(true);
            }}
            onDelete={(e) => {
              deleteMut.reset();
              setDeleting(e);
            }}
            emptyAction={
              filtersActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('');
                    setStaffFilter('');
                    setVehicleFilter('');
                  }}
                  className="text-sm font-medium text-teal-700 hover:underline"
                >
                  Clear filters
                </button>
              ) : canEdit ? (
                <Button variant="secondary" onClick={openNew}>Log expense</Button>
              ) : undefined
            }
          />
        </>
      )}

      {canEdit && (
        <ExpenseFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          storeId={storeId}
          catalog={catalog}
          accounts={accounts}
          paymentMethods={paymentMethods}
          vehicles={vehicles}
          isManager={isManager}
          canGrantAdvances={canGrantAdvances}
          defaultDate={view === 'day' ? date : today}
          editing={editing}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete expense?"
        message={deleteMessage}
        confirmLabel="Delete"
        destructive
        busy={deleteMut.isPending}
        error={deleteMut.error ? errorReasons(deleteMut.error).join(' ') : null}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        onClose={() => setDeleting(null)}
      />

      <PayUnpaidModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onPaid={() => {
          setPayOpen(false);
          setSelected(new Set());
        }}
        storeId={storeId}
        expenses={selectedRows}
        paymentMethods={paymentMethods}
        accountName={accountName}
      />
    </div>
  );
}
