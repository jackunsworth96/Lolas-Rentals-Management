import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/ui-store.js';
import {
  useMiscSales,
  useRecordMiscSale,
  useUpdateMiscSale,
  useDeleteMiscSale,
  type EnrichedMiscSale,
} from '../../api/misc-sales.js';
import { useChartOfAccounts, usePaymentMethods } from '../../api/config.js';
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

interface AccountConfig {
  id: string;
  name: string;
  accountType: string;
  account_type?: string;
  storeId?: string | null;
  store_id?: string | null;
}

interface EmployeeConfig {
  id: string;
  fullName?: string;
  full_name?: string;
}

const EMPTY_FORM = {
  date: '',
  category: '',
  description: '',
  amount: '',
  receivedInto: '',
  incomeAccountId: '',
  employeeId: '',
  paymentMethodId: '',
};

const MISC_SALE_CATEGORIES = [
  'Merchandise',
  'Fuel',
  'Accessories',
  'Helmet Rental',
  'Delivery Fee',
  'Laundry',
  'Other',
];

export default function MiscSalesPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const navigate = useNavigate();
  const [date, setDate] = useState(todayStr());

  const { data: sales = [], isLoading } = useMiscSales(storeId, date);
  const { data: allAccounts = [] } = useChartOfAccounts() as {
    data: AccountConfig[] | undefined;
  };
  const { data: employees = [] } = useEmployees(storeId) as {
    data: EmployeeConfig[] | undefined;
  };

  const { data: paymentMethods = [] } = usePaymentMethods() as {
    data: Array<{ id: string; name: string; isActive?: boolean; is_active?: boolean }> | undefined;
  };
  const activePaymentMethods = useMemo(
    () => (paymentMethods ?? []).filter((m) => m.isActive !== false && m.is_active !== false),
    [paymentMethods],
  );
  const routing = usePaymentRouting();

  const createMut = useRecordMiscSale();
  const updateMut = useUpdateMiscSale();
  const deleteMut = useDeleteMiscSale();

  const storeAccounts = useMemo(
    () => allAccounts.filter((a) => {
      const sid = a.storeId ?? a.store_id ?? null;
      return sid === storeId || sid === 'company';
    }),
    [allAccounts, storeId],
  );
  const assetAccounts = useMemo(
    () => storeAccounts.filter((a) => (a.accountType ?? a.account_type) === 'Asset'),
    [storeAccounts],
  );
  const incomeAccounts = useMemo(
    () => storeAccounts.filter((a) => (a.accountType ?? a.account_type) === 'Income'),
    [storeAccounts],
  );

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sales) {
      const cat = s.category || 'Uncategorised';
      map.set(cat, (map.get(cat) ?? 0) + s.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [sales]);

  const dayTotal = useMemo(
    () => sales.reduce((s, e) => s + e.amount, 0),
    [sales],
  );

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, date });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const setField = useCallback(
    (key: string, value: string) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const routedReceivedInto = routing.getReceivedInto(storeId, form.paymentMethodId);

  useEffect(() => {
    if (routedReceivedInto && !form.receivedInto) {
      setForm((prev) => ({ ...prev, receivedInto: routedReceivedInto }));
    }
  }, [routedReceivedInto, form.receivedInto]);

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date });
    setShowModal(true);
  }

  function openEdit(sale: EnrichedMiscSale) {
    setEditingId(sale.id);
    setForm({
      date: sale.date,
      category: sale.category ?? '',
      description: sale.description ?? '',
      amount: String(sale.amount),
      receivedInto: sale.receivedInto ?? '',
      incomeAccountId: sale.incomeAccountId ?? '',
      employeeId: sale.employeeId ?? '',
    });
    setShowModal(true);
  }

  function handleSave() {
    const amount = parseFloat(form.amount);
    if (!form.description || !amount || amount <= 0 || !form.receivedInto || !form.incomeAccountId) return;

    if (editingId) {
      updateMut.mutate(
        {
          id: editingId,
          date: form.date,
          category: form.category || null,
          description: form.description,
          amount,
          receivedInto: form.receivedInto,
          incomeAccountId: form.incomeAccountId,
          employeeId: form.employeeId || null,
        },
        { onSuccess: () => setShowModal(false) },
      );
    } else {
      createMut.mutate(
        {
          storeId,
          date: form.date,
          category: form.category || null,
          description: form.description,
          amount,
          receivedInto: form.receivedInto,
          incomeAccountId: form.incomeAccountId,
          employeeId: form.employeeId || null,
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

  function employeeLabel(e: EmployeeConfig): string {
    return e.fullName ?? e.full_name ?? e.id;
  }

  if (!storeId) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Miscellaneous Sales</h1>
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">Select a store to view misc sales</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Miscellaneous Sales</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/merchandise')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Merchandise Inventory
          </button>
          <Button onClick={openAdd}>Record Sale</Button>
        </div>
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
          <p className="text-lg font-semibold text-gray-900">{formatDateLabel(date)}</p>
          {date === todayStr() && (
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
      ) : (
        <div className="space-y-6">
          {/* Daily summary */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Daily Summary</h2>
              <span className="text-lg font-bold text-green-700">{formatCurrency(dayTotal)}</span>
            </div>
            {categorySummary.length === 0 ? (
              <p className="text-sm text-gray-400">No sales recorded</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {categorySummary.map(([cat, total]) => (
                  <div key={cat} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                    <span className="font-medium text-gray-700">{cat}</span>
                    <span className="ml-2 font-semibold text-gray-900">{formatCurrency(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sales list */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Sales ({sales.length})</h2>
            </div>
            {sales.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-400">
                No sales for this date. Click "Record Sale" to add one.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {sales.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openEdit(s)}>
                      <div className="flex items-center gap-2">
                        {s.category && (
                          <span className="text-sm font-semibold text-gray-900">{s.category}</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-gray-600">{s.description}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
                        {s.receivedIntoName && (
                          <span>
                            Received into:{' '}
                            <span className="font-medium text-gray-500">{s.receivedIntoName}</span>
                          </span>
                        )}
                        {s.incomeAccountName && (
                          <span>
                            Income:{' '}
                            <span className="font-medium text-gray-500">{s.incomeAccountName}</span>
                          </span>
                        )}
                        {s.employeeName && (
                          <span>
                            Recorded by:{' '}
                            <span className="font-medium text-gray-500">{s.employeeName}</span>
                          </span>
                        )}
                        {s.createdAt && <span>{formatTime(s.createdAt)}</span>}
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-sm font-bold text-green-700">
                      +{formatCurrency(s.amount)}
                    </span>
                    <button
                      onClick={() => setShowDeleteConfirm(s.id)}
                      className="rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                      title="Delete sale"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Sale Modal */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="mx-auto w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              {editingId ? 'Edit Sale' : 'Record Sale'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setField('category', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select category...</option>
                  {MISC_SALE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="What was sold?"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
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

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
                <select
                  value={form.paymentMethodId}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, paymentMethodId: e.target.value, receivedInto: '' }));
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select method...</option>
                  {activePaymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {!routedReceivedInto && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment Account (received into) *</label>
                <select
                  value={form.receivedInto}
                  onChange={(e) => setField('receivedInto', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select payment account...</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {form.paymentMethodId && <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>}
              </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Income Account *</label>
                <select
                  value={form.incomeAccountId}
                  onChange={(e) => setField('incomeAccountId', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select income account...</option>
                  {incomeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Recorded by (employee)</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setField('employeeId', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>{employeeLabel(e)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                loading={createMut.isPending || updateMut.isPending}
                disabled={
                  !form.description ||
                  !form.amount ||
                  parseFloat(form.amount) <= 0 ||
                  !form.receivedInto ||
                  !form.incomeAccountId
                }
              >
                {editingId ? 'Update Sale' : 'Save Sale'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ModalOverlay onClose={() => setShowDeleteConfirm(null)}>
          <div className="mx-auto w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">Delete Sale?</h2>
            <p className="mb-4 text-sm text-gray-600">
              This will permanently remove the sale record and reverse the associated journal entries. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteConfirm(null)}>
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
      <div className="relative z-10 w-full max-h-[90vh] overflow-y-auto px-4">{children}</div>
    </div>
  );
}
