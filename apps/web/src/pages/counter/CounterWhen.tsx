import { useMemo, useState } from 'react';
import { MIN_BOOKING_LEAD_MS, isStoreClosedDay, manilaCalendarDate, storeClosedDayName } from '@lolas/shared';
import type { CollectionArea } from '../../api/counter.js';

const DAYS_AHEAD = 14;
const SLOT_TIMES = Array.from({ length: 16 }, (_, i) => {
  const minutes = 9 * 60 + 15 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return manilaCalendarDate(d.getTime());
}

function upcomingDates(nowMs: number): string[] {
  const today = manilaCalendarDate(nowMs);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
}

/** Bookable slots for the next two weeks, Manila time, at least the minimum notice from now. */
export function upcomingSlots(nowMs = Date.now()): Array<{ date: string; slots: string[] }> {
  return upcomingDates(nowMs)
    .filter((date) => !isStoreClosedDay(date))
    .map((date) => ({
      date,
      slots: SLOT_TIMES
        .map((t) => new Date(`${date}T${t}:00+08:00`).toISOString())
        .filter((iso) => Date.parse(iso) - nowMs >= MIN_BOOKING_LEAD_MS),
    }))
    .filter((d) => d.slots.length > 0);
}

function dayLabel(date: string): string {
  const today = manilaCalendarDate();
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

export function CounterWhen({ value, onChange, deliverTo, areas, areaId, onArea, onContinue, buttonClass }: {
  value: string | null;
  onChange: (iso: string) => void;
  deliverTo: string | null;
  /** Set when the property's area is unknown: the guest picks where we deliver. */
  areas?: CollectionArea[] | null;
  areaId?: number | null;
  onArea?: (id: number) => void;
  onContinue: () => void;
  buttonClass: string;
}) {
  const days = useMemo(() => upcomingSlots(), []);
  const closedDays = useMemo(
    () => upcomingDates(Date.now())
      .map((d) => ({ label: dayLabel(d), name: storeClosedDayName(d) }))
      .filter((d): d is { label: string; name: string } => d.name !== null),
    [],
  );
  const [date, setDate] = useState(() => (value ? manilaCalendarDate(Date.parse(value)) : days[0]?.date ?? null));
  const slots = days.find((d) => d.date === date)?.slots ?? [];
  const askArea = !!areas && areas.length > 0;

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      {askArea && (
        <>
          <h1 className="font-headline text-4xl font-bold text-teal-brand">Which area are you staying in?</h1>
          <p className="mt-2 font-lato text-lg text-charcoal-brand/70">We&apos;ll deliver it to you there and collect it at the end.</p>
          <div className="mb-10 mt-6 flex max-w-2xl flex-wrap justify-center gap-3">
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onArea?.(a.id)}
                className={`rounded-2xl border-2 px-5 py-3 font-lato text-base font-bold ${
                  a.id === areaId ? 'border-teal-brand bg-teal-brand text-white' : 'border-charcoal-brand/15 bg-white text-charcoal-brand'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </>
      )}
      <h1 className={`font-headline font-bold text-teal-brand ${askArea ? 'text-3xl' : 'text-4xl'}`}>When do you need it?</h1>
      <p className="mt-2 font-lato text-lg text-charcoal-brand/70">
        {deliverTo && !askArea ? <>We&apos;ll deliver it to <span className="font-bold">{deliverTo}</span> and collect it from there.</> : 'Choose your start day and time.'}
      </p>
      <div className="mt-8 flex max-w-full gap-3 overflow-x-auto pb-2">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setDate(d.date)}
            className={`shrink-0 rounded-2xl border-2 px-5 py-3 font-lato text-base font-bold ${
              d.date === date ? 'border-teal-brand bg-teal-brand text-white' : 'border-charcoal-brand/15 bg-white text-charcoal-brand'
            }`}
          >
            {dayLabel(d.date)}
          </button>
        ))}
      </div>
      {closedDays.length > 0 && (
        <p className="mt-3 max-w-2xl rounded-xl bg-red-50 px-4 py-2 font-lato text-sm font-semibold text-red-700">
          We&apos;re closed on {closedDays.map((d) => `${d.name} (${d.label})`).join(' and ')}, so we can&apos;t deliver or collect that day.
          Your rental can run through it, but it can&apos;t start or end then.
        </p>
      )}
      <div className="mt-6 grid w-full max-w-2xl grid-cols-3 gap-3 sm:grid-cols-4">
        {slots.map((iso) => (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            className={`rounded-xl border-2 py-3 font-lato text-base font-bold ${
              iso === value ? 'border-teal-brand bg-teal-brand text-white' : 'border-charcoal-brand/15 bg-white text-charcoal-brand'
            }`}
          >
            {timeLabel(iso)}
          </button>
        ))}
      </div>
      <button type="button" className={`${buttonClass} mt-8`} disabled={!value || (askArea && areaId == null)} onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
