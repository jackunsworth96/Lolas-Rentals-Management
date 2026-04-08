import { useState, useMemo } from 'react';
import { useEnrichedOrders } from '../../api/orders.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { OrderDetailModal } from '../../components/orders/OrderDetailModal.js';
import { formatCurrency } from '../../utils/currency.js';
import type { EnrichedOrder } from '../../types/api.js';

type DateFilter = 'all' | 'today' | 'tomorrow';

function getDateStr(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function returnDateColor(returnDatetime: string | null): 'red' | 'yellow' | 'gray' {
  if (!returnDatetime) return 'gray';
  const retDate = returnDatetime.slice(0, 10);
  const todayStr = getDateStr(0);
  if (retDate < todayStr) return 'red';
  if (retDate === todayStr) return 'yellow';
  return 'gray';
}

function formatReturnDate(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ActivePage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: orders, isLoading } = useEnrichedOrders(storeId, 'active,confirmed') as {
    data: EnrichedOrder[] | undefined;
    isLoading: boolean;
  };
  const [selectedOrder, setSelectedOrder] = useState<EnrichedOrder | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const filtered = useMemo(() => {
    let list = orders ?? [];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          (o.customerMobile ?? '').toLowerCase().includes(q) ||
          o.vehicleNames.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.bookingToken ?? '').toLowerCase().includes(q) ||
          (o.wooOrderId ?? '').toLowerCase().includes(q),
      );
    }

    if (dateFilter === 'today') {
      const todayStr = getDateStr(0);
      list = list.filter((o) => o.returnDatetime && o.returnDatetime.slice(0, 10) === todayStr);
    } else if (dateFilter === 'tomorrow') {
      const tomorrowStr = getDateStr(1);
      list = list.filter((o) => o.returnDatetime && o.returnDatetime.slice(0, 10) === tomorrowStr);
    }

    return list;
  }, [orders, search, dateFilter]);

  const columns = [
    {
      key: 'wooOrderId',
      header: 'Order Ref',
      render: (r: EnrichedOrder) => r.bookingToken ?? r.wooOrderId ?? r.id.slice(0, 8),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (r: EnrichedOrder) => (
        <div>
          <div className="font-medium text-gray-900">{r.customerName}</div>
          {r.customerMobile && <div className="text-xs text-gray-500">{r.customerMobile}</div>}
        </div>
      ),
    },
    { key: 'vehicleNames', header: 'Vehicle' },
    {
      key: 'returnDatetime',
      header: 'Return',
      render: (r: EnrichedOrder) => {
        const color = returnDateColor(r.returnDatetime);
        if (color === 'red')
          return <span className="font-medium text-red-600">{formatReturnDate(r.returnDatetime)}</span>;
        if (color === 'yellow')
          return <span className="font-medium text-amber-600">{formatReturnDate(r.returnDatetime)}</span>;
        return <span>{formatReturnDate(r.returnDatetime)}</span>;
      },
    },
    {
      key: 'finalTotal',
      header: 'Total',
      render: (r: EnrichedOrder) => formatCurrency(r.finalTotal),
    },
    {
      key: 'balanceDue',
      header: 'Balance',
      render: (r: EnrichedOrder) => (
        <span className={r.balanceDue > 0 ? 'font-medium text-red-600' : 'text-green-600'}>
          {formatCurrency(r.balanceDue)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: EnrichedOrder) => (
        <Badge color={r.status === 'confirmed' ? 'green' : 'blue'}>
          {r.status === 'confirmed' ? 'Confirmed' : 'Active'}
        </Badge>
      ),
    },
  ];

  const dateFilters: { key: DateFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Returning Today' },
    { key: 'tomorrow', label: 'Returning Tomorrow' },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Active Orders</h1>
          {!isLoading && (
            <Badge color="blue" className="text-sm">
              {filtered.length}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search customer, mobile, vehicle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {dateFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setDateFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              dateFilter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : (
        <Table
          columns={columns}
          data={filtered}
          keyFn={(r: EnrichedOrder) => r.id}
          onRowClick={(r: EnrichedOrder) => setSelectedOrder(r)}
          emptyMessage="No active orders"
        />
      )}

      {selectedOrder && (
        <OrderDetailModal
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          orderId={selectedOrder.id}
          storeId={selectedOrder.storeId}
          readOnly={false}
          enrichedData={selectedOrder}
        />
      )}
    </div>
  );
}
