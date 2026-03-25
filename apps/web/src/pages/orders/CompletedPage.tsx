import { useState, useMemo } from 'react';
import { useEnrichedOrders } from '../../api/orders.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { OrderDetailModal } from '../../components/orders/OrderDetailModal.js';
import { formatCurrency } from '../../utils/currency.js';
import type { EnrichedOrder } from '../../types/api.js';

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

export default function CompletedPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: orders, isLoading } = useEnrichedOrders(storeId, 'completed') as {
    data: EnrichedOrder[] | undefined;
    isLoading: boolean;
  };
  const [selectedOrder, setSelectedOrder] = useState<EnrichedOrder | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = orders ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          (o.customerMobile ?? '').toLowerCase().includes(q) ||
          o.vehicleNames.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [orders, search]);

  const columns = [
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
      render: (r: EnrichedOrder) => <span>{formatReturnDate(r.returnDatetime)}</span>,
    },
    {
      key: 'finalTotal',
      header: 'Total',
      render: (r: EnrichedOrder) => formatCurrency(r.finalTotal),
    },
    {
      key: 'status',
      header: 'Status',
      render: () => <Badge color="green">Completed</Badge>,
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Completed Orders</h1>
          {!isLoading && (
            <Badge color="green" className="text-sm">
              {filtered.length}
            </Badge>
          )}
        </div>

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

      {isLoading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : (
        <Table
          columns={columns}
          data={filtered}
          keyFn={(r: EnrichedOrder) => r.id}
          onRowClick={(r: EnrichedOrder) => setSelectedOrder(r)}
          emptyMessage="No completed orders"
        />
      )}

      {selectedOrder && (
        <OrderDetailModal
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          orderId={selectedOrder.id}
          storeId={selectedOrder.storeId}
          readOnly
          enrichedData={selectedOrder}
        />
      )}
    </div>
  );
}
