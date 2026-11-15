import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plane } from 'lucide-react';
import { formatVanType, useTransfers, type TransferRow } from '../../api/transfers.js';
import {
  flightTimeLabel,
  isFromAccommodation,
  moneyState,
  MONEY_TONE_CLASSES,
  pickupWindow,
  shortRoute,
} from '../transfers/transfer-state.js';
import { manilaToday } from '../../utils/date.js';
import { ChartCard, ChartSkeleton, EmptyState } from './ui/index.js';

type Day = 'today' | 'tomorrow';

function tomorrowOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function sortKey(t: TransferRow): string {
  return pickupWindow(t) ?? flightTimeLabel(t.flightTime) ?? '99:99';
}

function TransferItem({ t }: { t: TransferRow }) {
  const pickup = pickupWindow(t);
  const flight = flightTimeLabel(t.flightTime);
  const money = moneyState(t);
  const fromHotel = isFromAccommodation(t.route);
  return (
    <Link
      to="/transfers"
      className="block rounded-xl border border-gray-100 bg-white p-3 hover:border-teal-brand/40 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums text-gray-900">
            {pickup ?? (flight ? `Flight ${flight}` : 'No time set')}
          </p>
          <p className="truncate font-semibold text-gray-900">{t.customerName}</p>
        </div>
        {t.driverConfirmed ? (
          <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">Confirmed</span>
        ) : (
          <span className="shrink-0 rounded-full bg-gold-brand/20 px-2 py-0.5 text-xs font-semibold text-amber-800">Unconfirmed</span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-700 tabular-nums">
        {shortRoute(t.route)} · {t.paxCount} pax · {formatVanType(t.vanType)}
      </p>
      {fromHotel && (
        <p className={`truncate text-xs ${t.accommodation ? 'text-gray-500' : 'text-amber-700'}`}>
          {t.accommodation ? `From ${t.accommodation}` : 'Hotel not set'}
        </p>
      )}
      <span
        title={money.hint}
        className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset ${MONEY_TONE_CLASSES[money.tone]}`}
      >
        {money.label}
      </span>
    </Link>
  );
}

export function AirportTransfersCard({ storeId, className = '' }: { storeId: string | undefined; className?: string }) {
  const [day, setDay] = useState<Day>('today');
  const today = manilaToday();
  const date = day === 'today' ? today : tomorrowOf(today);
  const query = useTransfers(storeId ?? '', { scope: 'open', dateFrom: today, dateTo: tomorrowOf(today) });

  const rows = useMemo(
    () => (query.data ?? [])
      .filter((t) => t.serviceDate === date && t.status !== 'cancelled')
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [query.data, date],
  );
  const unconfirmed = rows.filter((t) => !t.driverConfirmed).length;

  return (
    <ChartCard
      className={className}
      title={(
        <span className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-teal-brand" />
          Airport transfers
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{rows.length}</span>
        </span>
      )}
      subtitle={unconfirmed > 0 ? `${unconfirmed} not confirmed by the driver` : `Shuttles ${day}`}
      action={(
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {(['today', 'tomorrow'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${day === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    >
      {query.error ? (
        <EmptyState>Couldn't load transfers: {(query.error as Error).message}</EmptyState>
      ) : query.isLoading ? (
        <ChartSkeleton height="h-40" />
      ) : rows.length === 0 ? (
        <EmptyState>No airport transfers {day}</EmptyState>
      ) : (
        <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {rows.map((t) => <TransferItem key={t.id} t={t} />)}
        </div>
      )}
    </ChartCard>
  );
}
