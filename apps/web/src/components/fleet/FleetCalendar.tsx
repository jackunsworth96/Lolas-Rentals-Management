import { useState, useMemo, useRef, useEffect } from 'react';
import { useFleetCalendar } from '../../api/fleet.js';
import { OrderDetailModal } from '../orders/OrderDetailModal.js';

interface CalendarBooking {
  orderId: string;
  orderItemId: string;
  orderReference: string | null;
  customerName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  status: 'active' | 'due-soon' | 'overdue' | 'confirmed' | 'completed';
}

interface CalendarVehicle {
  vehicleId: string;
  vehicleName: string;
  modelName: string;
  plateNumber: string | null;
  storeId: string;
  storeName: string;
  status: string;
  bookings: CalendarBooking[];
}

interface UnassignedBooking {
  rawOrderId: string;
  orderReference: string | null;
  customerName: string;
  vehicleModelName: string;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  status: 'unprocessed';
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  active: { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800' },
  'due-soon': { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800' },
  overdue: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-800' },
  confirmed: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800' },
  completed: { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-600' },
  unprocessed: { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800' },
};

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const LABEL_WIDTH = 180;
const DAY_WIDTH = 72;
const ROW_HEIGHT = 40;

interface Props {
  storeId: string;
}

export function FleetCalendar({ storeId }: Props) {
  const [offset, setOffset] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const rangeFrom = useMemo(() => addDays(today, -7 + offset * 14), [today, offset]);
  const rangeTo = useMemo(() => addDays(today, 7 + offset * 14), [today, offset]);

  const { data, isLoading } = useFleetCalendar({
    storeId: storeId === 'all' ? undefined : storeId,
    from: toDateStr(rangeFrom),
    to: toDateStr(rangeTo),
  });

  const vehicles = (data as { vehicles?: CalendarVehicle[] })?.vehicles ?? [];
  const unassigned = (data as { unassignedBookings?: UnassignedBooking[] })?.unassignedBookings ?? [];

  const days = useMemo(() => {
    const arr: Date[] = [];
    const count = daysBetween(rangeFrom, rangeTo) + 1;
    for (let i = 0; i < count; i++) arr.push(addDays(rangeFrom, i));
    return arr;
  }, [rangeFrom, rangeTo]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarVehicle[]>();
    for (const v of vehicles) {
      const key = v.storeName;
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    return map;
  }, [vehicles]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const todayIdx = days.findIndex((d) => toDateStr(d) === toDateStr(today));
    if (todayIdx >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayIdx * DAY_WIDTH - scrollRef.current.clientWidth / 2 + DAY_WIDTH / 2);
    }
  }, [days, today, offset]);

  function barStyle(booking: { pickupDatetime: string; dropoffDatetime: string }) {
    const pickup = new Date(booking.pickupDatetime);
    const dropoff = new Date(booking.dropoffDatetime);
    const startDay = Math.max(0, daysBetween(rangeFrom, pickup));
    const endDay = Math.min(days.length, daysBetween(rangeFrom, dropoff) + 1);
    const left = startDay * DAY_WIDTH;
    const width = Math.max(DAY_WIDTH * 0.5, (endDay - startDay) * DAY_WIDTH - 4);
    return { left, width };
  }

  function handleBookingClick(orderId: string, sid: string) {
    setSelectedOrderId(orderId);
    setSelectedStoreId(sid);
  }

  const gridWidth = days.length * DAY_WIDTH;

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading calendar...</div>;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Navigation */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={() => setOffset((o) => o - 1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          aria-label="Previous 2 weeks"
        >
          &larr; Prev
        </button>
        <div className="text-sm font-medium text-gray-700">
          {formatShortDate(rangeFrom)} — {formatShortDate(rangeTo)}
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="ml-3 text-xs text-blue-600 hover:underline"
          >
            Today
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          aria-label="Next 2 weeks"
        >
          Next &rarr;
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-4 py-2 text-xs">
        {[
          { label: 'Active', color: 'bg-green-400' },
          { label: 'Due Soon', color: 'bg-amber-400' },
          { label: 'Overdue', color: 'bg-red-400' },
          { label: 'Confirmed', color: 'bg-blue-400' },
          { label: 'Unassigned', color: 'bg-purple-400' },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-sm ${color}`} />
            <span className="text-gray-600">{label}</span>
          </span>
        ))}
      </div>

      {/* Gantt area */}
      <div className="flex overflow-hidden">
        {/* Fixed labels column */}
        <div className="shrink-0 border-r border-gray-200" style={{ width: LABEL_WIDTH }}>
          {/* Date header spacer */}
          <div className="h-8 border-b border-gray-200 bg-gray-50" />

          {[...grouped.entries()].map(([storeName, storeVehicles]) => (
            <div key={storeName}>
              <div
                className="flex items-center bg-gray-100 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                style={{ height: ROW_HEIGHT / 1.3 }}
              >
                {storeName}
              </div>
              {storeVehicles.map((v) => (
                <div
                  key={v.vehicleId}
                  className="flex items-center border-b border-gray-100 px-3"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{v.vehicleName}</div>
                    <div className="truncate text-[10px] text-gray-400">{v.modelName}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {unassigned.length > 0 && (
            <div>
              <div
                className="flex items-center bg-purple-50 px-3 text-xs font-semibold text-purple-700 uppercase tracking-wide"
                style={{ height: ROW_HEIGHT / 1.3 }}
              >
                Unassigned
              </div>
              {unassigned.map((u) => (
                <div
                  key={u.rawOrderId}
                  className="flex items-center border-b border-gray-100 px-3"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{u.vehicleModelName}</div>
                    <div className="truncate text-[10px] text-gray-400">{u.orderReference ?? '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Gantt grid */}
        <div className="flex-1 overflow-x-auto" ref={scrollRef}>
          <div style={{ minWidth: gridWidth }}>
            {/* Date headers */}
            <div className="flex h-8 border-b border-gray-200 bg-gray-50">
              {days.map((d) => {
                const isToday = toDateStr(d) === toDateStr(today);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={toDateStr(d)}
                    className={`flex shrink-0 items-center justify-center text-[10px] ${isToday ? 'bg-blue-100 font-bold text-blue-700' : isWeekend ? 'bg-gray-100 text-gray-400' : 'text-gray-500'}`}
                    style={{ width: DAY_WIDTH }}
                  >
                    <div className="text-center leading-tight">
                      <div>{d.toLocaleDateString('en-PH', { weekday: 'short' })}</div>
                      <div>{d.getDate()}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vehicle rows */}
            {[...grouped.entries()].map(([storeName, storeVehicles]) => (
              <div key={storeName}>
                {/* Store header spacer */}
                <div style={{ height: ROW_HEIGHT / 1.3 }} />

                {storeVehicles.map((v) => (
                  <div
                    key={v.vehicleId}
                    className="relative border-b border-gray-100"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Day grid lines + today marker */}
                    {days.map((d) => {
                      const isToday = toDateStr(d) === toDateStr(today);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div
                          key={toDateStr(d)}
                          className={`absolute top-0 h-full border-r ${isToday ? 'border-blue-300 bg-blue-50/40' : isWeekend ? 'border-gray-100 bg-gray-50/50' : 'border-gray-100'}`}
                          style={{ left: daysBetween(rangeFrom, d) * DAY_WIDTH, width: DAY_WIDTH }}
                        />
                      );
                    })}

                    {/* Booking bars */}
                    {v.bookings.map((b) => {
                      const { left, width } = barStyle(b);
                      const colors = STATUS_COLORS[b.status] ?? STATUS_COLORS.active;
                      return (
                        <button
                          key={b.orderItemId}
                          type="button"
                          onClick={() => handleBookingClick(b.orderId, v.storeId)}
                          className={`absolute top-1 z-10 flex items-center rounded border px-1.5 text-[10px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity ${colors.bg} ${colors.border} ${colors.text}`}
                          style={{ left: left + 2, width, height: ROW_HEIGHT - 8 }}
                          title={`${b.customerName} · ${b.orderReference ?? b.orderId}\n${new Date(b.pickupDatetime).toLocaleDateString()} → ${new Date(b.dropoffDatetime).toLocaleDateString()}\nStatus: ${b.status}`}
                        >
                          {b.customerName}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}

            {/* Unassigned rows */}
            {unassigned.length > 0 && (
              <div>
                <div style={{ height: ROW_HEIGHT / 1.3 }} />
                {unassigned.map((u) => (
                  <div
                    key={u.rawOrderId}
                    className="relative border-b border-gray-100"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {days.map((d) => {
                      const isToday = toDateStr(d) === toDateStr(today);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div
                          key={toDateStr(d)}
                          className={`absolute top-0 h-full border-r ${isToday ? 'border-blue-300 bg-blue-50/40' : isWeekend ? 'border-gray-100 bg-gray-50/50' : 'border-gray-100'}`}
                          style={{ left: daysBetween(rangeFrom, d) * DAY_WIDTH, width: DAY_WIDTH }}
                        />
                      );
                    })}
                    {(() => {
                      const { left, width } = barStyle(u);
                      const colors = STATUS_COLORS.unprocessed;
                      return (
                        <div
                          className={`absolute top-1 z-10 flex items-center rounded border px-1.5 text-[10px] font-medium truncate ${colors.bg} ${colors.border} ${colors.text}`}
                          style={{ left: left + 2, width, height: ROW_HEIGHT - 8 }}
                          title={`${u.customerName} · ${u.orderReference ?? u.rawOrderId}\n${u.vehicleModelName}\nNeeds vehicle assignment`}
                        >
                          {u.customerName} — {u.orderReference ?? ''}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Today marker legend */}
      <div className="border-t border-gray-200 px-4 py-2 text-[10px] text-gray-400">
        Blue column = today · Hover any booking bar for details · Click to open order
      </div>

      {selectedOrderId && (
        <OrderDetailModal
          open
          onClose={() => setSelectedOrderId(null)}
          orderId={selectedOrderId}
          storeId={selectedStoreId}
        />
      )}
    </div>
  );
}
