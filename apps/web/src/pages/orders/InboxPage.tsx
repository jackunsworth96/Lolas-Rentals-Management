import { useState, useMemo } from 'react';
import { useOrdersRaw, type RawOrder } from '../../api/orders-raw.js';
import { useStores } from '../../api/config.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { BookingModal } from '../../components/orders/BookingModal.js';
import { formatDateTime } from '../../utils/date.js';
import { formatCurrency } from '../../utils/currency.js';
import { extractPickupDate } from '../../utils/raw-order-payload.js';
import { resolveSourceFromStore } from '@lolas/shared';

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

function formatManilaDatetime(dt: string): string {
  return new Date(dt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function InboxPage() {
  const [storeFilter, setStoreFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const apiStore = storeFilter ? resolveSourceFromStore(storeFilter) : undefined;
  const { data: rawOrders, isLoading, error } = useOrdersRaw(apiStore);
  const { data: stores } = useStores() as { data: Array<{ id: string; name: string }> | undefined };

  const [selectedOrder, setSelectedOrder] = useState<RawOrder | null>(null);

  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  }, []);

  const filteredOrders = useMemo(() => {
    const all = Array.isArray(rawOrders) ? rawOrders : [];
    if (dateFilter === 'all') return all;

    const target = dateFilter === 'today' ? todayStr : tomorrowStr;
    return all.filter((order) => {
      if (isDirect(order)) {
        return order.pickup_datetime ? order.pickup_datetime.slice(0, 10) === target : false;
      }
      const pickupDate = extractPickupDate(order.payload ?? {});
      return pickupDate === target;
    });
  }, [rawOrders, dateFilter, todayStr, tomorrowStr]);

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading orders...</div>;
  if (error) return <div className="py-12 text-center text-red-500">Failed to load orders</div>;

  const totalCount = Array.isArray(rawOrders) ? rawOrders.length : 0;

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
              {r.pickup_datetime ? formatManilaDatetime(r.pickup_datetime) : '—'}
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
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">
            New orders from the website — review and process into active bookings.
          </p>
        </div>
        {totalCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
            {totalCount} unprocessed
          </span>
        )}
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
    </div>
  );
}
