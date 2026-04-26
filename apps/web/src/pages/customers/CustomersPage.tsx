import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Save, AlertTriangle, PawPrint, ShoppingBag, ClipboardList, FileSignature } from 'lucide-react';
import {
  useCustomers,
  useCustomer,
  useUpdateCustomer,
  useCustomerPendingCheckin,
  type CustomerSummary,
} from '../../api/customers.js';
import { useStores } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { formatDate } from '../../utils/date.js';

const STATUS_COLOR: Record<string, 'green' | 'blue' | 'yellow' | 'gray' | 'red'> = {
  active: 'blue',
  Active: 'blue',
  confirmed: 'blue',
  Confirmed: 'blue',
  completed: 'green',
  Completed: 'green',
  cancelled: 'red',
  Cancelled: 'red',
  pending: 'yellow',
  Pending: 'yellow',
};

function formatPhp(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Detail slide panel ─────────────────────────────────────────────────────

interface CustomerDetailPanelProps {
  customerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function CustomerDetailPanel({ customerId, onClose, onSaved }: CustomerDetailPanelProps) {
  const { data, isLoading } = useCustomer(customerId);
  const { data: pendingCheckin } = useCustomerPendingCheckin(customerId);
  const updateCustomer = useUpdateCustomer();

  const customer = data?.customer ?? null;
  const orders = data?.orders ?? [];
  const pawCard = data?.pawCard ?? null;
  const pendingWaivers = pendingCheckin?.waivers ?? [];
  const pendingInspections = pendingCheckin?.inspections ?? [];

  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    notes: '',
    blacklisted: false,
  });
  const [dirty, setDirty] = useState(false);
  const [confirmBlacklist, setConfirmBlacklist] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name,
        email: customer.email ?? '',
        mobile: customer.mobile ?? '',
        notes: customer.notes ?? '',
        blacklisted: customer.blacklisted,
      });
      setDirty(false);
      setSaveError(null);
    }
  }, [customer]);

  function handleChange(field: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  async function handleSave() {
    if (!customerId || !customer) return;
    setSaveError(null);
    try {
      await updateCustomer.mutateAsync({
        id: customerId,
        name: form.name.trim(),
        email: form.email.trim() || null,
        mobile: form.mobile.trim() || null,
        notes: form.notes.trim() || null,
        blacklisted: form.blacklisted,
      });
      setDirty(false);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function handleBlacklistToggle(value: boolean) {
    if (value && !confirmBlacklist) {
      setConfirmBlacklist(true);
      return;
    }
    setConfirmBlacklist(false);
    handleChange('blacklisted', value);
  }

  // Keyboard close
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = !!customerId;

  return (
    <>
      {/* Backdrop */}
      {visible && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col bg-white shadow-xl transition-transform duration-300 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Customer Details</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            </div>
          )}

          {!isLoading && customer && (
            <div className="divide-y divide-gray-100">
              {/* Editable fields */}
              <section className="px-6 py-5">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Profile
                </h3>
                <div className="space-y-3">
                  <Field label="Name">
                    <input
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={form.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={form.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                    />
                  </Field>
                  <Field label="Mobile">
                    <input
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={form.mobile}
                      onChange={(e) => handleChange('mobile', e.target.value)}
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      rows={3}
                      className="w-full resize-none rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={form.notes}
                      onChange={(e) => handleChange('notes', e.target.value)}
                    />
                  </Field>
                </div>

                {/* Blacklisted toggle */}
                <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-gray-700">Blacklisted</span>
                  </div>
                  <button
                    onClick={() => handleBlacklistToggle(!form.blacklisted)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.blacklisted ? 'bg-red-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        form.blacklisted ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {confirmBlacklist && (
                  <div className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                    <p className="mb-2 font-medium">Blacklist this customer?</p>
                    <p className="mb-3 text-xs text-red-600">
                      They will be flagged on future bookings. This can be undone at any time.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmBlacklist(false); handleChange('blacklisted', true); }}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmBlacklist(false)}
                        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {saveError && (
                  <p className="mt-2 text-xs text-red-600">{saveError}</p>
                )}

                {dirty && (
                  <button
                    onClick={handleSave}
                    disabled={updateCustomer.isPending}
                    className="mt-4 flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {updateCustomer.isPending ? 'Saving…' : 'Save Changes'}
                  </button>
                )}
              </section>

              {/* Stats */}
              <section className="px-6 py-5">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Summary
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Total Spent" value={formatPhp(customer.totalSpent)} />
                  <Stat label="Bookings" value={String(customer.totalBookings ?? orders.length)} />
                  {pawCard && (
                    <>
                      <Stat
                        label="Paw Card Savings"
                        value={pawCard.hasPawCard ? formatPhp(pawCard.totalSaved) : '—'}
                        icon={<PawPrint className="h-4 w-4 text-teal-500" />}
                      />
                      <Stat
                        label="Paw Card Entries"
                        value={pawCard.hasPawCard ? String(pawCard.entryCount) : 'None'}
                        icon={<ShoppingBag className="h-4 w-4 text-teal-500" />}
                      />
                    </>
                  )}
                </div>
              </section>

              {/* Order history */}
              <section className="px-6 py-5">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Order History {orders.length > 0 && `(${orders.length})`}
                </h3>
                {orders.length === 0 ? (
                  <p className="text-sm text-gray-400">No orders yet.</p>
                ) : (
                  <div className="space-y-2">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{formatDate(order.orderDate)}</span>
                          <Badge color={STATUS_COLOR[order.status] ?? 'gray'}>
                            {order.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-medium text-gray-900">{order.vehicleNames}</p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                          <span>Total: {formatPhp(order.finalTotal)}</span>
                          {order.balanceDue > 0 && (
                            <span className="text-red-600">
                              Due: {formatPhp(order.balanceDue)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Pending check-in activity — waivers/inspections not yet linked to a booking */}
              {(pendingWaivers.length > 0 || pendingInspections.length > 0) && (
                <section className="px-6 py-5">
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-amber-600">
                    Pending Check-In Activity
                  </h3>
                  <p className="mb-4 text-xs text-gray-500">
                    Captured before a booking was created. Will auto-link when a booking is processed.
                  </p>
                  <div className="space-y-2">
                    {pendingWaivers.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3"
                      >
                        <FileSignature className="h-4 w-4 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{w.driver_name}</p>
                          <p className="text-xs text-gray-500">
                            Waiver signed · {formatDate(w.created_at)}
                          </p>
                        </div>
                        <Badge color="yellow">{w.status}</Badge>
                      </div>
                    ))}
                    {pendingInspections.map((i) => (
                      <div
                        key={i.id}
                        className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3"
                      >
                        <ClipboardList className="h-4 w-4 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {i.vehicle_name ?? 'Vehicle not specified'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Inspection · {formatDate(i.created_at)}
                          </p>
                        </div>
                        <Badge color="yellow">{i.status}</Badge>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-base font-semibold text-gray-900">{value}</p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const defaultStoreId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [storeFilter, setStoreFilter] = useState<string>(defaultStoreId || 'all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const storeIdForApi = storeFilter === 'all' ? '' : storeFilter;
  // Search requires a storeId; if "all" is selected, we query each store or show an empty guide
  const canSearch = !!storeIdForApi;

  const { data: customers = [], isLoading } = useCustomers(storeIdForApi, debouncedSearch);

  const filtered = useMemo(() => {
    return customers as CustomerSummary[];
  }, [customers]);

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (r: CustomerSummary) => (
        <span className="font-medium text-gray-900">{r.name}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (r: CustomerSummary) => r.email ?? <span className="text-gray-400">—</span>,
    },
    {
      key: 'mobile',
      header: 'Mobile',
      render: (r: CustomerSummary) => r.mobile ?? <span className="text-gray-400">—</span>,
    },
    {
      key: 'totalSpent',
      header: 'Total Spent',
      render: (r: CustomerSummary) => (
        <span className="font-medium">{formatPhp(r.totalSpent)}</span>
      ),
    },
    {
      key: 'blacklisted',
      header: 'Status',
      render: (r: CustomerSummary) =>
        r.blacklisted ? (
          <Badge color="red">Blacklisted</Badge>
        ) : (
          <Badge color="green">Active</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Search and manage customer records.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Store selector */}
        <select
          value={storeFilter}
          onChange={(e) => { setStoreFilter(e.target.value); setSearchInput(''); }}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All Stores</option>
          {storeList.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={canSearch ? 'Search by name, email or mobile…' : 'Select a store to search'}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            disabled={!canSearch}
            className="w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Prompt when no store selected */}
      {!canSearch && (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          Select a store above to search customers.
        </div>
      )}

      {/* Loading */}
      {canSearch && isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {canSearch && !isLoading && (
        <Table
          columns={columns}
          data={filtered}
          keyFn={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          emptyMessage={
            debouncedSearch
              ? `No customers found for "${debouncedSearch}".`
              : 'No customers found. Try searching by name, email or mobile.'
          }
        />
      )}

      {/* Detail panel */}
      <CustomerDetailPanel
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
        onSaved={() => { /* table auto-refreshes via query invalidation */ }}
      />
    </div>
  );
}
