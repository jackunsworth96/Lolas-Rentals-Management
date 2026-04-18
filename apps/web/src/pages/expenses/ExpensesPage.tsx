import { useState, useMemo, useCallback } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import {
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  usePayExpenses,
  type EnrichedExpense,
} from '../../api/expenses.js';
import {
  useExpenseCategories,
  useChartOfAccounts,
  usePaymentMethods,
} from '../../api/config.js';
import { useFleet } from '../../api/fleet.js';
import { useEmployees } from '../../api/hr.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatTime } from '../../utils/date.js';
import { Button } from '../../components/common/Button.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';

function todayStr(): string {
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

interface CategoryConfig {
  id: string | number;
  name: string;
  accountId: string | null;
  account_id?: string | null;
  mainCategory?: string | null;
  main_category?: string | null;
}

interface AccountConfig {
  id: string;
  name: string;
  accountType: string;
  account_type?: string;
  storeId?: string | null;
  store_id?: string | null;
}

interface VehicleConfig {
  id: string;
  vehicleName?: string;
  vehicle_name?: string;
  plateNumber?: string;
  plate_number?: string;
}

interface EmployeeConfig {
  id: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
}

const EMPTY_FORM = {
  date: '',
  category: '',
  description: '',
  amount: '',
  paymentMethodId: '',
  paidFrom: '',
  vehicleId: '',
  employeeId: '',
  expenseAccountId: '',
  cashAccountId: '',
  isUnpaid: false,
};

export default function ExpensesPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [date, setDate] = useState(todayStr());

  const { data: expenses = [], isLoading } = useExpenses(storeId, date);
  const { data: categories = [] } = useExpenseCategories() as {
    data: CategoryConfig[] | undefined;
  };
  const { data: allAccounts = [] } = useChartOfAccounts() as {
    data: AccountConfig[] | undefined;
  };
  const { data: vehicles = [] } = useFleet(storeId) as {
    data: VehicleConfig[] | undefined;
  };
  const { data: employees = [] } = useEmployees(storeId) as {
    data: EmployeeConfig[] | undefined;
  };
  const { data: paymentMethods = [] } = usePaymentMethods() as {
    data: Array<{ id: string; name: string }> | undefined;
  };

  const routing = usePaymentRouting();

  const createMut = useCreateExpense();
  const updateMut = useUpdateExpense();
  const deleteMut = useDeleteExpense();
  const payMut = usePayExpenses();

  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethodId, setPayMethodId] = useState('');

  const filteredExpenses = useMemo(() => {
    if (filterStatus === 'all') return expenses;
    return expenses.filter((e) => e.status === filterStatus);
  }, [expenses, filterStatus]);

  const storeAccounts = useMemo(
    () =>
      allAccounts.filter((a) => {
        const sid = a.storeId ?? a.store_id ?? null;
        return sid === storeId || sid === 'company';
      }),
    [allAccounts, storeId],
  );
  const expenseAccounts = useMemo(
    () =>
      storeAccounts.filter(
        (a) => (a.accountType ?? a.account_type) === 'Expense',
      ),
    [storeAccounts],
  );

  // Active categories
  const activeCategories = useMemo(
    () => categories.filter((c: Record<string, unknown>) => c.isActive !== false && c.is_active !== false),
    [categories],
  );

  // Daily summary by category
  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const dayTotal = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses],
  );

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, date });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );

  const setField = useCallback(
    (key: string, value: string) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date });
    setShowModal(true);
  }

  function openEdit(expense: EnrichedExpense) {
    setEditingId(expense.id);
    setForm({
      date: expense.date,
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      paymentMethodId: '',
      paidFrom: expense.paidFrom ?? '',
      vehicleId: expense.vehicleId ?? '',
      employeeId: expense.employeeId ?? '',
      expenseAccountId: expense.accountId ?? '',
      cashAccountId: expense.paidFrom ?? '',
      isUnpaid: expense.status === 'unpaid',
    });
    setShowModal(true);
  }

  // Auto-fill expense account when category changes
  function onCategoryChange(catName: string) {
    setField('category', catName);
    const cat = activeCategories.find((c) => c.name === catName);
    const acctId = cat?.accountId ?? cat?.account_id ?? '';
    if (acctId) setField('expenseAccountId', acctId);
  }

  const isCashAdvance =
    form.category.toLowerCase() === 'cash advance';

  function handleSave() {
    const amount = parseFloat(form.amount);
    if (
      !form.category ||
      !form.description ||
      !amount ||
      amount <= 0 ||
      !form.expenseAccountId
    )
      return;
    if (!form.isUnpaid && !form.paymentMethodId) return;
    if (isCashAdvance && !form.employeeId) return;

    if (editingId) {
      updateMut.mutate(
        {
          id: editingId,
          date: form.date,
          category: form.category,
          description: form.description,
          amount,
          paidFrom: form.cashAccountId || null,
          vehicleId: form.vehicleId || null,
          employeeId: form.employeeId || null,
          expenseAccountId: form.expenseAccountId,
          cashAccountId: form.cashAccountId,
        },
        { onSuccess: () => setShowModal(false) },
      );
    } else {
      createMut.mutate(
        {
          storeId,
          date: form.date,
          category: form.category,
          description: form.description,
          amount,
          paidFrom: form.isUnpaid ? null : (form.cashAccountId || null),
          vehicleId: form.vehicleId || null,
          employeeId: form.employeeId || null,
          expenseAccountId: form.expenseAccountId,
          cashAccountId: form.isUnpaid ? '' : form.cashAccountId,
          status: form.isUnpaid ? 'unpaid' : 'paid',
        },
        { onSuccess: () => setShowModal(false) },
      );
    }
  }

  function handleDelete(id: string) {
    deleteMut.mutate(id, {
      onSuccess: () => setShowDeleteConfirm(null),
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePaySelected() {
    if (!payMethodId || selectedIds.size === 0) return;
    payMut.mutate(
      {
        expenseIds: Array.from(selectedIds),
        paymentMethodId: payMethodId,
        storeId,
      },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setShowPayModal(false);
          setPayMethodId('');
        },
      },
    );
  }

  function vehicleLabel(v: VehicleConfig): string {
    const name = v.vehicleName ?? v.vehicle_name ?? '';
    const plate = v.plateNumber ?? v.plate_number ?? '';
    return plate ? `${name} (${plate})` : name;
  }

  function employeeLabel(e: EmployeeConfig): string {
    const first = e.firstName ?? e.first_name ?? '';
    const last = e.lastName ?? e.last_name ?? '';
    return `${first} ${last}`.trim();
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <Button onClick={openAdd}>Add Expense</Button>
      </div>

      {/* Date navigation */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, -1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
        >
          <span className="sr-only">Previous day</span>
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <p className="text-lg font-semibold text-gray-900">
            {formatDateLabel(date)}
          </p>
          {date === todayStr() && (
            <span className="text-xs font-medium text-blue-600">Today</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, 1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
        >
          <span className="sr-only">Next day</span>
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
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
      ) : (
        <div className="space-y-6">
          {/* Daily summary */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Daily Summary
              </h2>
              <span className="text-lg font-bold text-red-700">
                {formatCurrency(dayTotal)}
              </span>
            </div>
            {categorySummary.length === 0 ? (
              <p className="text-sm text-gray-400">No expenses recorded</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {categorySummary.map(([cat, total]) => (
                  <div
                    key={cat}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      cat.toLowerCase() === 'cash advance'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <span className="font-medium text-gray-700">{cat}</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {formatCurrency(total)}
                    </span>
                    {cat.toLowerCase() === 'cash advance' && (
                      <span className="ml-1 text-[10px] font-medium text-amber-600">
                        ADVANCE
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {(['all', 'paid', 'unpaid'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setFilterStatus(tab); setSelectedIds(new Set()); }}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  filterStatus === tab
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'paid' ? 'Paid' : 'Unpaid'}
                {tab !== 'all' && (
                  <span className="ml-1.5 text-xs opacity-75">
                    ({expenses.filter((e) => e.status === tab).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Batch pay bar */}
          {filterStatus === 'unpaid' && selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
              <span className="text-sm font-medium text-amber-800">
                {selectedIds.size} expense{selectedIds.size > 1 ? 's' : ''} selected
              </span>
              <Button onClick={() => setShowPayModal(true)}>
                Pay selected ({selectedIds.size})
              </Button>
            </div>
          )}

          {/* Expense list */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Expenses ({filteredExpenses.length})
              </h2>
            </div>
            {filteredExpenses.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-400">
                No expenses for this date. Click "Add Expense" to record one.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="group flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
                  >
                    {filterStatus === 'unpaid' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={() => toggleSelect(e.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    )}
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => openEdit(e)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {e.category}
                        </span>
                        {e.status === 'unpaid' && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            UNPAID
                          </span>
                        )}
                        {e.category.toLowerCase() === 'cash advance' && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            CASH ADVANCE
                          </span>
                        )}
                        {e.vehicleName && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                            {e.vehicleName}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-gray-600">
                        {e.description}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
                        {e.paidFromName && (
                          <span>
                            Paid from:{' '}
                            <span className="font-medium text-gray-500">
                              {e.paidFromName}
                            </span>
                          </span>
                        )}
                        {e.accountName && (
                          <span>
                            Account:{' '}
                            <span className="font-medium text-gray-500">
                              {e.accountName}
                            </span>
                          </span>
                        )}
                        {e.employeeName && (
                          <span>
                            Employee:{' '}
                            <span className="font-medium text-gray-500">
                              {e.employeeName}
                            </span>
                          </span>
                        )}
                        {e.createdAt && <span>{formatTime(e.createdAt)}</span>}
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-sm font-bold text-red-700">
                      -{formatCurrency(e.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(e.id)}
                      className="rounded p-2 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                      title="Delete expense"
                    >
                      <span className="sr-only">Delete expense</span>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add/Edit Expense Modal ── */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              {editingId ? 'Edit Expense' : 'Add Expense'}
            </h2>
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Date *
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {/* Category */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Category *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select category...</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                      {(c.mainCategory ?? c.main_category)
                        ? ` (${c.mainCategory ?? c.main_category})`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Amount *
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.amount}
                  onChange={(e) => setField('amount', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Description *
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="What was this expense for?"
                />
              </div>

              {/* Log as unpaid toggle */}
              {!editingId && (
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.isUnpaid}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isUnpaid: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Log as unpaid (pay later)
                </label>
              )}

              {/* Payment method (paid from) — hidden for unpaid */}
              {!form.isUnpaid && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Paid From *
                  </label>
                  <select
                    value={form.paymentMethodId}
                    onChange={(e) => {
                      const methodId = e.target.value;
                      const resolvedAccountId = routing.resolveReceivedIntoForStore(
                        storeId,
                        methodId,
                      ) ?? '';
                      setForm((f) => ({
                        ...f,
                        paymentMethodId: methodId,
                        paidFrom: resolvedAccountId,
                        cashAccountId: resolvedAccountId,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select payment method...</option>
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Expense Account (category mapping) */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Expense Account *
                </label>
                <select
                  value={form.expenseAccountId}
                  onChange={(e) => setField('expenseAccountId', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select expense account...</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {form.category && !form.expenseAccountId && (
                  <p className="mt-1 text-xs text-amber-600">
                    No account mapped to this category. Select one manually or
                    update Settings &gt; Expense Categories.
                  </p>
                )}
              </div>

              {/* Vehicle linkage */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Vehicle (optional)
                </label>
                <select
                  value={form.vehicleId}
                  onChange={(e) => setField('vehicleId', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {(vehicles ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Employee linkage */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Employee{isCashAdvance ? ' *' : ' (optional)'}
                </label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setField('employeeId', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeLabel(e)}
                    </option>
                  ))}
                </select>
                {isCashAdvance && !form.employeeId && (
                  <p className="mt-1 text-xs text-red-600">
                    Cash advances must be linked to an employee for payroll
                    deduction.
                  </p>
                )}
              </div>

              {/* Cash advance notice */}
              {isCashAdvance && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  This expense will be tracked as a cash advance and fed into
                  payroll deductions for the linked employee.
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                loading={createMut.isPending || updateMut.isPending}
                disabled={
                  !form.category ||
                  !form.description ||
                  !form.amount ||
                  parseFloat(form.amount) <= 0 ||
                  !form.expenseAccountId ||
                  (!form.isUnpaid && !form.paymentMethodId) ||
                  (isCashAdvance && !form.employeeId)
                }
              >
                {editingId ? 'Update Expense' : 'Save Expense'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Confirmation ── */}
      {showDeleteConfirm && (
        <ModalOverlay onClose={() => setShowDeleteConfirm(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">
              Delete Expense?
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              This will permanently remove the expense record and reverse the
              associated journal entries. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => handleDelete(showDeleteConfirm)}
                loading={deleteMut.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Pay Selected Modal ── */}
      {showPayModal && (
        <ModalOverlay onClose={() => setShowPayModal(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">
              Pay {selectedIds.size} Expense{selectedIds.size > 1 ? 's' : ''}
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              Total:{' '}
              <span className="font-semibold text-gray-900">
                {formatCurrency(
                  expenses
                    .filter((e) => selectedIds.has(e.id))
                    .reduce((s, e) => s + e.amount, 0),
                )}
              </span>
            </p>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment Method *
              </label>
              <select
                value={payMethodId}
                onChange={(e) => setPayMethodId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select payment method...</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowPayModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handlePaySelected}
                loading={payMut.isPending}
                disabled={!payMethodId}
              >
                Confirm Payment
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
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
      <div className="relative z-10 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
