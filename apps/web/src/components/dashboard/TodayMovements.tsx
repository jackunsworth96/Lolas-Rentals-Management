import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  FileSignature,
  HardHat,
  MapPin,
  MessageSquare,
  Moon,
  Package,
  Plane,
  Truck,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store.js';
import { useTodayMovements, type MovementDay, type PickupMovement, type ReturnMovement } from '../../api/dashboard.js';
import { useEnrichedOrders } from '../../api/orders.js';
import type { EnrichedOrder } from '../../types/api.js';
import { BookingModal } from '../orders/BookingModal.js';
import { OrderDetailModal } from '../orders/OrderDetailModal.js';
import { ChartCard, ChartSkeleton, EmptyState, formatPeso } from './ui/index.js';

type View = 'upcoming' | 'done';

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short' });
}

const PICKUP_STATUS: Record<PickupMovement['status'], { label: string; className: string }> = {
  to_activate: { label: 'To activate', className: 'bg-gold-brand/20 text-amber-800' },
  ready: { label: 'Ready', className: 'bg-teal-brand/10 text-teal-brand' },
  out: { label: 'Out', className: 'bg-green-50 text-green-700' },
};

const RETURN_STATUS: Record<ReturnMovement['status'], { label: string; className: string }> = {
  due: { label: 'Due', className: 'bg-teal-brand/10 text-teal-brand' },
  overdue: { label: 'Overdue', className: 'bg-red-50 text-red-600' },
  returned: { label: 'Returned', className: 'bg-green-50 text-green-700' },
};

function Tag({ icon: Icon, children, tone = 'gray' }: { icon: typeof Truck; children: ReactNode; tone?: 'gray' | 'teal' | 'gold' | 'red' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    teal: 'bg-teal-brand/10 text-teal-brand',
    gold: 'bg-gold-brand/20 text-amber-800',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md px-2 py-1 text-xs font-medium ${value === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function BoxControls({
  day,
  onDayChange,
  view,
  onViewChange,
  doneCount,
}: {
  day: MovementDay;
  onDayChange: (d: MovementDay) => void;
  view: View;
  onViewChange: (v: View) => void;
  doneCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {day === 'today' && (
        <Segmented value={view} onChange={onViewChange} options={[['upcoming', 'To do'], ['done', `Done (${doneCount})`]]} />
      )}
      <Segmented value={day} onChange={onDayChange} options={[['today', 'Today'], ['tomorrow', 'Tomorrow']]} />
    </div>
  );
}

function MovementCard({
  time,
  title,
  reference,
  badge,
  tone,
  onClick,
  children,
}: {
  time: string;
  title: string;
  reference: string | null;
  badge: { label: string; className: string };
  tone: 'default' | 'danger' | 'done';
  onClick?: () => void;
  children: ReactNode;
}) {
  const border = tone === 'danger' ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white';
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="w-16 shrink-0 text-sm font-semibold tabular-nums text-gray-900">{time}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{title}</p>
              {reference && <p className="truncate text-xs text-gray-400">#{reference}</p>}
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
              {tone === 'done' && <CheckCircle2 className="h-3 w-3" />}
              {badge.label}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">{children}</div>
        </div>
      </div>
    </>
  );
  const className = `block w-full rounded-xl border p-3 text-left transition ${border} ${tone === 'done' ? 'opacity-60' : ''}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:border-teal-brand/40 hover:shadow-sm`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function PickupCard({ p, onOpen }: { p: PickupMovement; onOpen?: () => void }) {
  const done = p.status === 'out';
  return (
    <MovementCard
      time={timeOf(p.time)}
      title={p.customerName}
      reference={p.reference}
      badge={PICKUP_STATUS[p.status]}
      tone={done ? 'done' : 'default'}
      onClick={onOpen}
    >
      <p className="text-sm text-gray-700">
        {p.vehicles.join(', ') || 'Vehicle not set'}
        {p.until && <span className="text-gray-400"> · until {dayOf(p.until)} {timeOf(p.until)}</span>}
      </p>
      <div className="flex flex-wrap gap-1">
        {p.delivery ? (
          <Tag icon={Truck} tone="gold">Deliver to {p.delivery.place ?? 'customer'}</Tag>
        ) : (
          <Tag icon={MapPin}>Store pickup</Tag>
        )}
        {p.collection && <Tag icon={Truck} tone="gold">Collect from {p.collection.place ?? 'customer'} on return</Tag>}
        {p.transfer && <Tag icon={Plane} tone="teal">{p.transfer}</Tag>}
        {p.addons.map((a) => (
          <Tag key={a} icon={Package}>{a}</Tag>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {p.balanceDue !== null ? (
          <span className={p.balanceDue > 0 ? 'font-semibold text-red-600' : 'text-green-700'}>
            <Wallet className="mr-1 inline h-3 w-3" />
            {p.balanceDue > 0 ? `${formatPeso(p.balanceDue)} to collect` : 'Paid'}
          </span>
        ) : (
          p.quote !== null && <span className="text-gray-500"><Wallet className="mr-1 inline h-3 w-3" />Quote {formatPeso(p.quote)}</span>
        )}
        {p.waiverSigned !== null && (
          <span className={p.waiverSigned ? 'text-green-700' : 'text-amber-700'}>
            <FileSignature className="mr-1 inline h-3 w-3" />
            {p.waiverSigned ? 'Waiver signed' : 'Waiver not signed'}
          </span>
        )}
        {p.partnerRef && <span className="text-gray-500">Partner: {p.partnerRef}</span>}
      </div>
      {p.notes && (
        <p className="line-clamp-2 text-xs italic text-gray-500">
          <MessageSquare className="mr-1 inline h-3 w-3" />
          {p.notes}
        </p>
      )}
    </MovementCard>
  );
}

function ReturnCard({ r, onOpen }: { r: ReturnMovement; onOpen?: () => void }) {
  return (
    <MovementCard
      time={timeOf(r.time)}
      title={r.customerName}
      reference={r.reference}
      badge={RETURN_STATUS[r.status]}
      tone={r.status === 'overdue' ? 'danger' : r.status === 'returned' ? 'done' : 'default'}
      onClick={onOpen}
    >
      <p className="text-sm text-gray-700">{r.vehicles.join(', ') || 'Vehicle not set'}</p>
      <div className="flex flex-wrap gap-1">
        {r.ninePm && <Tag icon={Moon} tone="teal">9PM return</Tag>}
        {r.collection ? (
          <Tag icon={Truck} tone="gold">Collect from {r.collection.place ?? 'customer'}</Tag>
        ) : (
          <Tag icon={MapPin}>Back to store</Tag>
        )}
        {r.helmetNumbers && <Tag icon={HardHat}>Helmets {r.helmetNumbers}</Tag>}
      </div>
      {r.status !== 'returned' && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {r.balanceDue > 0 && (
            <span className="font-semibold text-red-600">
              <Wallet className="mr-1 inline h-3 w-3" />
              {formatPeso(r.balanceDue)} to collect
            </span>
          )}
          {r.deposit > 0 && <span className="text-gray-600">Deposit to refund {formatPeso(r.deposit)}</span>}
        </div>
      )}
    </MovementCard>
  );
}

/** Finds the enriched order the Active page would pass, so the modal opens with the same detail. */
function DashboardOrderModal({ orderId, storeId, readOnly, onClose }: { orderId: string; storeId: string; readOnly: boolean; onClose: () => void }) {
  const { data } = useEnrichedOrders(readOnly ? '' : storeId, 'active,confirmed') as { data: EnrichedOrder[] | undefined };
  const enriched = data?.find((o) => o.id === orderId);
  return (
    <OrderDetailModal open onClose={onClose} orderId={orderId} storeId={storeId} readOnly={readOnly} enrichedData={enriched} />
  );
}

function MovementList<T>({
  items,
  view,
  isDone,
  render,
  emptyUpcoming,
  emptyDone,
}: {
  items: T[];
  view: View;
  isDone: (item: T) => boolean;
  render: (item: T) => ReactNode;
  emptyUpcoming: string;
  emptyDone: string;
}) {
  const shown = items.filter((i) => isDone(i) === (view === 'done'));
  if (shown.length === 0) return <EmptyState>{view === 'done' ? emptyDone : emptyUpcoming}</EmptyState>;
  return <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">{shown.map(render)}</div>;
}

export function TodayMovements({ storeId }: { storeId: string | undefined }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canInbox = hasPermission('can_view_inbox');
  const canActive = hasPermission('can_view_active');
  const queryClient = useQueryClient();
  const [pickupDay, setPickupDay] = useState<MovementDay>('today');
  const [returnDay, setReturnDay] = useState<MovementDay>('today');
  const pickupQuery = useTodayMovements(storeId, pickupDay, canInbox || canActive);
  const returnQuery = useTodayMovements(storeId, returnDay, canInbox || canActive);

  const [pickupView, setPickupView] = useState<View>('upcoming');
  const [returnView, setReturnView] = useState<View>('upcoming');
  const [rawOrder, setRawOrder] = useState<PickupMovement['raw'] | null>(null);
  const [order, setOrder] = useState<{ id: string; storeId: string; readOnly: boolean } | null>(null);

  if (!canInbox && !canActive) return null;

  const closeAndRefresh = (close: () => void) => () => {
    close();
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const pickups = pickupQuery.data?.pickups ?? [];
  const returns = returnQuery.data?.returns ?? [];
  const pickupsDone = pickups.filter((p) => p.status === 'out').length;
  const returnsDone = returns.filter((r) => r.status === 'returned').length;
  const toActivate = pickups.filter((p) => p.status === 'to_activate').length;
  const overdue = returns.filter((r) => r.status === 'overdue').length;

  const openPickup = (p: PickupMovement) => {
    if (p.kind === 'raw') return canInbox && p.raw ? () => setRawOrder(p.raw) : undefined;
    return canActive ? () => setOrder({ id: p.id, storeId: p.storeId, readOnly: false }) : undefined;
  };
  const openReturn = (r: ReturnMovement) =>
    canActive ? () => setOrder({ id: r.orderId, storeId: r.storeId, readOnly: r.status === 'returned' }) : undefined;

  const title = (icon: ReactNode, label: string, count: number) => (
    <span className="flex items-center gap-2">
      {icon}
      {label}
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{count}</span>
    </span>
  );

  const body = (query: typeof pickupQuery, content: ReactNode) =>
    query.error ? (
      <EmptyState>Couldn't load bookings: {(query.error as Error).message}</EmptyState>
    ) : query.isLoading || !query.data ? (
      <ChartSkeleton height="h-40" />
    ) : (
      content
    );

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ChartCard
          title={title(<ArrowUpFromLine className="h-4 w-4 text-teal-brand" />, `Pickups ${pickupDay}`, pickups.length)}
          subtitle={toActivate > 0 ? `${toActivate} still to activate from the Inbox` : `Who is collecting a vehicle ${pickupDay}`}
          action={
            <BoxControls day={pickupDay} onDayChange={setPickupDay} view={pickupView} onViewChange={setPickupView} doneCount={pickupsDone} />
          }
        >
          {body(
            pickupQuery,
            <MovementList
              items={pickups}
              view={pickupDay === 'today' ? pickupView : 'upcoming'}
              isDone={(p) => p.status === 'out'}
              render={(p) => <PickupCard key={p.key} p={p} onOpen={openPickup(p)} />}
              emptyUpcoming={pickups.length > 0 ? 'All of today\'s pickups are out' : `No pickups ${pickupDay}`}
              emptyDone="No vehicles handed over yet"
            />,
          )}
        </ChartCard>

        <ChartCard
          title={title(<ArrowDownToLine className="h-4 w-4 text-teal-brand" />, `Returns ${returnDay}`, returns.length)}
          subtitle={overdue > 0 ? `${overdue} overdue — past their drop-off time` : `Who is bringing a vehicle back ${returnDay}`}
          action={
            <BoxControls day={returnDay} onDayChange={setReturnDay} view={returnView} onViewChange={setReturnView} doneCount={returnsDone} />
          }
        >
          {body(
            returnQuery,
            <MovementList
              items={returns}
              view={returnDay === 'today' ? returnView : 'upcoming'}
              isDone={(r) => r.status === 'returned'}
              render={(r) => <ReturnCard key={r.key} r={r} onOpen={openReturn(r)} />}
              emptyUpcoming={returns.length > 0 ? 'All of today\'s returns are back' : `No returns ${returnDay}`}
              emptyDone="Nothing returned yet"
            />,
          )}
        </ChartCard>
      </div>

      {rawOrder && <BookingModal open onClose={closeAndRefresh(() => setRawOrder(null))} rawOrder={rawOrder} />}
      {order && (
        <DashboardOrderModal
          orderId={order.id}
          storeId={order.storeId}
          readOnly={order.readOnly}
          onClose={closeAndRefresh(() => setOrder(null))}
        />
      )}
    </>
  );
}
