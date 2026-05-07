import { useState, useMemo, useEffect } from 'react';
import { useEnrichedOrders } from '../../api/orders.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { OrderDetailModal } from '../../components/orders/OrderDetailModal.js';
import { InspectionModal } from '../../components/orders/InspectionModal.js';
import { formatCurrency } from '../../utils/currency.js';
import type { EnrichedOrder } from '../../types/api.js';

type DateFilter = 'all' | 'today' | 'tomorrow';
type PickupSort = 'none' | 'asc' | 'desc';

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
  const currentUser = useAuthStore((s) => s.user);
  const { data: orders, isLoading, refetch: refetchOrders } = useEnrichedOrders(storeId, 'active,confirmed') as {
    data: EnrichedOrder[] | undefined;
    isLoading: boolean;
    refetch: () => void;
  };
  const [selectedOrder, setSelectedOrder] = useState<EnrichedOrder | null>(null);
  const [inspectionOrderId, setInspectionOrderId] = useState<string | null>(null);
  const [inspectionOrderRef, setInspectionOrderRef] = useState('');
  const [inspectionVehicleId, setInspectionVehicleId] = useState<string | null>(null);
  const [inspectionVehicleName, setInspectionVehicleName] = useState<string | null>(null);
  const [inspectionOrderItemId, setInspectionOrderItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [pickupSort, setPickupSort] = useState<PickupSort>('none');

  function openInspection(r: EnrichedOrder) {
    setInspectionOrderId(r.id);
    setInspectionOrderRef(r.bookingToken ?? r.wooOrderId ?? r.id);
    setInspectionVehicleId(r.primaryVehicleId ?? null);
    setInspectionVehicleName(r.primaryVehicleName ?? null);
    setInspectionOrderItemId(r.primaryOrderItemId ?? null);
  }

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

    if (pickupSort !== 'none') {
      list = [...list].sort((a, b) => {
        const pa = a.returnDatetime ?? '';
        const pb = b.returnDatetime ?? '';
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        return pickupSort === 'asc' ? pa.localeCompare(pb) : pb.localeCompare(pa);
      });
    }

    return list;
  }, [orders, search, dateFilter, pickupSort]);

  const columns = [
    {
      key: 'wooOrderId',
      header: 'Order Ref',
      cellClassName: 'whitespace-normal',
      render: (r: EnrichedOrder) => {
        const refText = r.bookingToken ?? r.wooOrderId ?? r.id.slice(0, 8);
        const inspectionStatus = r.inspectionStatus ?? 'pending';
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span>{refText}</span>
            {inspectionStatus === 'completed' && (
              <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                Inspection ✓
              </span>
            )}
            {r.partnerRef && (
              <span
                title={`Affiliate / partner booking (${r.partnerRef}) — handle with extra care`}
                className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700"
              >
                ★ Affiliate
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'waiverStatus',
      header: 'Waiver',
      render: (r: EnrichedOrder) => {
        const s = r.waiverStatus ?? 'pending';
        if (s === 'signed') {
          return (
            <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              Waiver ✓
            </span>
          );
        }
        if (s === 'expired') {
          return (
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
              Waiver expired
            </span>
          );
        }
        return (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            Waiver ⚠
          </span>
        );
      },
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
        const label = formatReturnDate(r.returnDatetime);
        const cls =
          color === 'red' ? 'font-medium text-red-600'
          : color === 'yellow' ? 'font-medium text-amber-600'
          : '';
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className={cls}>{label}</span>
            {r.hasNinePmAddon && (
              <span
                title="9PM late return add-on"
                className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700"
              >
                9PM
              </span>
            )}
            {r.hasExtension && (
              <span
                title="Rental has been extended"
                className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700"
              >
                Extended
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'finalTotal',
      header: 'Total',
      render: (r: EnrichedOrder) => (
        <div className="flex flex-col items-start gap-0.5">
          <span>{formatCurrency(r.finalTotal)}</span>
          {(r.totalDiscount ?? 0) > 0 && (
            <span
              title={`Includes a ${formatCurrency(r.totalDiscount!)} discount`}
              className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700"
            >
              -{formatCurrency(r.totalDiscount!)} disc.
            </span>
          )}
        </div>
      ),
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
    {
      key: 'inspection',
      header: '',
      render: (r: EnrichedOrder) => {
        const inspectionStatus = r.inspectionStatus ?? 'pending';
        if (inspectionStatus === 'completed') return null;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openInspection(r);
            }}
            className="font-lato text-xs font-medium px-3 py-1.5 rounded-lg border border-teal-brand text-teal-brand hover:bg-teal-brand/5 transition-colors"
          >
            Inspection
          </button>
        );
      },
    },
  ];

  const dateFilters: { key: DateFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Returning Today' },
    { key: 'tomorrow', label: 'Returning Tomorrow' },
  ];

  function formatPickupDate(dt: string | null | undefined): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Active Orders</h1>
          {!isLoading && (
            <Badge color="blue" className="text-sm">
              {filtered.length}
            </Badge>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search customer, mobile, vehicle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
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

        <div className="h-6 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          <label htmlFor="active-pickup-sort" className="text-sm font-medium text-gray-700">Sort return:</label>
          <select
            id="active-pickup-sort"
            value={pickupSort}
            onChange={(e) => setPickupSort(e.target.value as PickupSort)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="none">Default</option>
            <option value="asc">Earliest first</option>
            <option value="desc">Latest first</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="md:hidden space-y-3">
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-gray-500">No active orders</div>
            )}
            {filtered.map((r) => {
              const refText = r.bookingToken ?? r.wooOrderId ?? r.id.slice(0, 8);
              const inspectionStatus = r.inspectionStatus ?? 'pending';
              const waiverStatus = r.waiverStatus ?? 'pending';
              const returnColor = returnDateColor(r.returnDatetime);
              const returnLabel = formatReturnDate(r.returnDatetime);

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Card top — tap to open order detail */}
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(r)}
                    className="w-full text-left px-4 pt-4 pb-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Order</p>
                        <p className="font-semibold text-gray-900">{refText}</p>
                      </div>
                      <Badge color={r.status === 'confirmed' ? 'green' : 'blue'}>
                        {r.status === 'confirmed' ? 'Confirmed' : 'Active'}
                      </Badge>
                    </div>

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.customerName}</p>
                        {r.customerMobile && (
                          <p className="text-xs text-gray-500">{r.customerMobile}</p>
                        )}
                        {r.partnerRef && (
                          <span
                            title={`Affiliate / partner booking (${r.partnerRef}) — handle with extra care`}
                            className="mt-1 inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700"
                          >
                            ★ Affiliate
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {waiverStatus === 'signed' ? (
                          <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Waiver ✓</span>
                        ) : waiverStatus === 'expired' ? (
                          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">Waiver expired</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Waiver ⚠</span>
                        )}
                        {inspectionStatus === 'completed' && (
                          <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Inspection ✓</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{r.vehicleNames}</span>
                      <span className={
                        returnColor === 'red' ? 'font-medium text-red-600 text-xs'
                        : returnColor === 'yellow' ? 'font-medium text-amber-600 text-xs'
                        : 'text-gray-500 text-xs'
                      }>
                        Return: {returnLabel}
                        {r.hasNinePmAddon && <span className="ml-1 rounded-full border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-xs font-semibold text-purple-700">9PM</span>}
                        {r.hasExtension && <span className="ml-1 text-teal-700">(Ext.)</span>}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-gray-500">Total: <span className="font-medium text-gray-800">{formatCurrency(r.finalTotal)}</span></span>
                      {r.balanceDue > 0 && (
                        <span className="text-xs font-medium text-red-600">Balance: {formatCurrency(r.balanceDue)}</span>
                      )}
                    </div>
                  </button>

                  {inspectionStatus !== 'completed' && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openInspection(r)}
                        className="w-full py-2.5 rounded-lg border border-teal-brand text-teal-brand font-medium text-sm transition-colors hover:bg-teal-brand/5 active:bg-teal-brand/10"
                      >
                        Start Inspection
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden md:block">
            <Table
              columns={columns}
              data={filtered}
              keyFn={(r: EnrichedOrder) => r.id}
              onRowClick={(r: EnrichedOrder) => setSelectedOrder(r)}
              emptyMessage="No active orders"
            />
          </div>
        </>
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

      {inspectionOrderId && (
        <InspectionModal
          open={!!inspectionOrderId}
          onClose={() => setInspectionOrderId(null)}
          orderId={inspectionOrderId}
          orderReference={inspectionOrderRef}
          storeId={storeId}
          employeeName={currentUser?.username ?? 'Staff'}
          preAssignedVehicleId={inspectionVehicleId ?? undefined}
          preAssignedVehicleName={inspectionVehicleName ?? undefined}
          orderItemId={inspectionOrderItemId ?? undefined}
          onComplete={() => {
            setInspectionOrderId(null);
            void refetchOrders();
          }}
        />
      )}
    </div>
  );
}
