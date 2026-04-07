import { useState, useMemo, useEffect, useRef } from 'react';
import { useOrdersRaw, type RawOrder } from '../../api/orders-raw.js';
import { useStores } from '../../api/config.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { BookingModal } from '../../components/orders/BookingModal.js';
import { CancelOrderModal } from '../../components/orders/CancelOrderModal.js';
import { WalkInBookingModal } from '../../components/orders/WalkInBookingModal.js';
import { formatDateTime, formatPickupDatetimeManila } from '../../utils/date.js';
import { formatCurrency } from '../../utils/currency.js';
import { extractPickupDate } from '../../utils/raw-order-payload.js';
import { resolveSourceFromStore } from '@lolas/shared';
import { useAuthStore } from '../../stores/auth-store.js';

type DateFilter = 'all' | 'today' | 'tomorrow';

function extractField(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = payload[key];
    if (val !== undefined && val !== null && val !== '') return String(val);
  }
  return '—';
}

function extractCustomerName(payload: Record<string, unknown>): string {
  const billing = payload.billing as Record<string, unknown> | undefined;
  if (billing) {
    const first = billing.first_name ?? '';
    const last = billing.last_name ?? '';
    const full = `${first} ${last}`.trim();
    if (full) return full;
  }
  return extractField(payload, 'customer_name', 'name');
}

function extractEmail(payload: Record<string, unknown>): string {
  const billing = payload.billing as Record<string, unknown> | undefined;
  return String(billing?.email ?? payload.email ?? '—');
}

function extractTotal(payload: Record<string, unknown>): number {
  const raw = payload.total ?? payload.order_total ?? payload.web_quote ?? 0;
  return Number(raw) || 0;
}

function extractItemCount(payload: Record<string, unknown>): number {
  const items = payload.line_items;
  if (Array.isArray(items)) return items.length;
  const qty = payload.quantity;
  if (typeof qty === 'number') return qty;
  return 0;
}

function sourceLabel(source: string): { text: string; color: 'blue' | 'purple' } {
  if (source === 'lolas') return { text: "Lola's", color: 'blue' };
  if (source === 'bass') return { text: 'Bass Bikes', color: 'purple' };
  return { text: source, color: 'blue' };
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDirect(r: RawOrder): boolean {
  return r.booking_channel === 'direct';
}

export default function InboxPage() {
  const [storeFilter, setStoreFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const [page, setPage] = useState(1);
  const [allOrders, setAllOrders] = useState<RawOrder[]>([]);

  const apiStore = storeFilter ? resolveSourceFromStore(storeFilter) : undefined;
  const { data: response, isLoading, error } = useOrdersRaw(apiStore, undefined, searchQuery || undefined, page);
  const { data: stores } = useStores() as { data: Array<{ id: string; name: string }> | undefined };

  useEffect(() => {
    if (response?.data) {
      if (page === 1) {
        setAllOrders(response.data);
      } else {
        setAllOrders(prev => [...prev, ...response.data]);
      }
    }
  }, [response, page]);

  useEffect(() => {
    setPage(1);
    setAllOrders([]);
  }, [apiStore, searchQuery]);

  const [selectedOrder, setSelectedOrder] = useState<RawOrder | null>(null);
  const [cancelOrder, setCancelOrder] = useState<RawOrder | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const canEditOrders = useAuthStore((s) => s.hasPermission('can_edit_orders'));

  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  }, []);

  const filteredOrders = useMemo(() => {
    const all = allOrders;
    if (dateFilter === 'all') return all;

    const target = dateFilter === 'today' ? todayStr : tomorrowStr;
    return all.filter((order) => {
      if (isDirect(order)) {
        return order.pickup_datetime ? order.pickup_datetime.slice(0, 10) === target : false;
      }
      const pickupDate = extractPickupDate(order.payload ?? {});
      return pickupDate === target;
    });
  }, [allOrders, dateFilter, todayStr, tomorrowStr]);

  if (isLoading && allOrders.length === 0) return <div className="py-12 text-center text-gray-500">Loading orders...</div>;
  if (error) return <div className="py-12 text-center text-red-500">Failed to load orders</div>;

  const totalCount = response?.total ?? allOrders.length;

  const columns = [
    {
      key: 'created_at',
      header: 'Received',
      render: (r: RawOrder) => (
        <span className="text-sm text-gray-600">{r.created_at ? formatDateTime(r.created_at) : '—'}</span>
      ),
    },
    {
      key: 'source',
      header: 'Store',
      render: (r: RawOrder) => {
        const s = sourceLabel(r.source);
        return (
          <div className="flex items-center gap-1.5">
            <Badge color={s.color}>{s.text}</Badge>
            {isDirect(r) && <Badge color="green">Direct</Badge>}
          </div>
        );
      },
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r: RawOrder) => (
        <div>
          <div className="font-medium text-gray-900">
            {isDirect(r) ? (r.customer_name ?? '—') : extractCustomerName(r.payload ?? {})}
          </div>
          <div className="text-sm text-gray-500">
            {isDirect(r) ? (r.customer_email ?? '—') : extractEmail(r.payload ?? {})}
          </div>
        </div>
      ),
    },
    {
      key: 'pickup',
      header: 'Pickup',
      render: (r: RawOrder) => {
        if (isDirect(r)) {
          return (
            <span className="text-sm text-gray-600">
              {r.pickup_datetime ? formatPickupDatetimeManila(r.pickup_datetime) : '—'}
            </span>
          );
        }
        const d = extractPickupDate(r.payload ?? {});
        return <span className="text-sm text-gray-600">{d ?? '—'}</span>;
      },
    },
    {
      key: 'items',
      header: 'Items',
      render: (r: RawOrder) => isDirect(r) ? 1 : (extractItemCount(r.payload ?? {}) || '—'),
    },
    {
      key: 'total',
      header: 'Web Quote',
      render: (r: RawOrder) => {
        const total = extractTotal(r.payload ?? {});
        return total > 0 ? formatCurrency(total) : '—';
      },
    },
    {
      key: 'order_number',
      header: 'Order Ref',
      render: (r: RawOrder) =>
        isDirect(r)
          ? (r.order_reference ?? '—')
          : extractField(r.payload ?? {}, 'number', 'id', 'order_key'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: RawOrder) => (
        <Badge color={r.status === 'unprocessed' ? 'yellow' : r.status === 'processed' ? 'green' : 'gray'}>
          {r.status}
        </Badge>
      ),
    },
    ...(canEditOrders
      ? [
          {
            key: 'actions',
            header: '',
            render: (r: RawOrder) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCancelOrder(r);
                }}
                className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-400"
              >
                Cancel
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">
            New orders from the website — review and process into active bookings.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {totalCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
              {totalCount} unprocessed
            </span>
          )}
          {canEditOrders && (
            <button
              type="button"
              onClick={() => setWalkInOpen(true)}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 whitespace-nowrap"
            >
              + Walk-in Booking
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by order ID, name, vehicle, phone or email"
            className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setSearchQuery(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="store-filter" className="text-sm font-medium text-gray-700">Store:</label>
          <select
            id="store-filter"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Stores</option>
            {(stores ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        <div className="flex items-center gap-1">
          <span className="mr-1 text-sm font-medium text-gray-700">Arriving:</span>
          {([
            { key: 'all', label: 'All' },
            { key: 'today', label: 'Today' },
            { key: 'tomorrow', label: 'Tomorrow' },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                dateFilter === f.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {dateFilter !== 'all' && filteredOrders.length !== totalCount && (
          <span className="text-sm text-gray-500">
            Showing {filteredOrders.length} of {totalCount}
          </span>
        )}
      </div>

      <Table
        columns={columns}
        data={filteredOrders}
        keyFn={(r: RawOrder) => r.id}
        onRowClick={(r: RawOrder) => setSelectedOrder(r)}
        emptyMessage="No new orders from the website"
      />

      {selectedOrder && (
        <BookingModal
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          rawOrder={selectedOrder}
        />
      )}

      {cancelOrder && (
        <CancelOrderModal
          open={!!cancelOrder}
          onClose={() => setCancelOrder(null)}
          rawOrder={cancelOrder}
          onCancelled={() => setCancelOrder(null)}
        />
      )}

      {response && page < response.totalPages && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={isLoading}
            className="font-lato text-sm font-semibold text-teal-brand border border-teal-brand rounded-lg px-6 py-2 hover:bg-teal-brand/5 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading…' : `Load more (${response.total - allOrders.length} remaining)`}
          </button>
        </div>
      )}

      <WalkInBookingModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
      />
    </div>
  );
}
