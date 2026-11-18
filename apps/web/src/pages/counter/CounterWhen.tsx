import { useMemo, useState } from 'react';
import { MIN_BOOKING_LEAD_MS, manilaCalendarDate } from '@lolas/shared';

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

/** Bookable slots for the next two weeks, Manila time, at least the minimum notice from now. */
export function upcomingSlots(nowMs = Date.now()): Array<{ date: string; slots: string[] }> {
  const today = manilaCalendarDate(nowMs);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i))
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

export function CounterWhen({ value, onChange, deliverTo, onContinue, buttonClass }: {
  value: string | null;
  onChange: (iso: string) => void;
  deliverTo: string | null;
  onContinue: () => void;
  buttonClass: string;
}) {
  const days = useMemo(() => upcomingSlots(), []);
  const [date, setDate] = useState(() => (value ? manilaCalendarDate(Date.parse(value)) : days[0]?.date ?? null));
  const slots = days.find((d) => d.date === date)?.slots ?? [];

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <h1 className="font-headline text-4xl font-bold text-teal-brand">When do you need it?</h1>
      <p className="mt-2 font-lato text-lg text-charcoal-brand/70">
        {deliverTo ? <>We&apos;ll deliver it to <span className="font-bold">{deliverTo}</span> and collect it from there.</> : 'Choose your start day and time.'}
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
      <button type="button" className={`${buttonClass} mt-8`} disabled={!value} onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
