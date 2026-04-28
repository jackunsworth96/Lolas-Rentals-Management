import { useState, useMemo } from 'react';

interface Props {
  currentDropoff: string;
  selectedDate: string | null;
  selectedTime: string;
  onSelectDate: (iso: string) => void;
  onSelectTime: (time: string) => void;
  ninePmSelected: boolean;
}

function generateTimeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  const start = 9 * 60 + 15;
  const end = 16 * 60 + 45;
  for (let m = start; m <= end; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const value = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const h12 = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    slots.push({ value, label: `${h12}:${String(min).padStart(2, '0')} ${ampm}` });
  }
  return slots;
}
const TIME_SLOTS = generateTimeSlots();

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function shortMonthDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ExtendCalendar({
  currentDropoff, selectedDate, selectedTime, onSelectDate, onSelectTime,
  ninePmSelected,
}: Props) {
  const dropoffDate = useMemo(() => new Date(currentDropoff), [currentDropoff]);
  const [viewYear, setViewYear] = useState(dropoffDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(dropoffDate.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function handleDayClick(day: number) {
    const clicked = new Date(viewYear, viewMonth, day);
    if (clicked <= dropoffDate) return;
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelectDate(iso);
  }

  const selectedDateObj = selectedDate ? (() => { const [y, mo, d] = selectedDate.split('-').map(Number); return new Date(y, mo - 1, d); })() : null;
  const effectiveTime = ninePmSelected ? '21:00' : selectedTime;
  const selectedDateTimeMs = selectedDate
    ? new Date(`${selectedDate}T${effectiveTime}:00+08:00`).getTime()
    : null;
  const additionalDays = selectedDateTimeMs != null
    ? Math.max(1, Math.ceil((selectedDateTimeMs - dropoffDate.getTime()) / 86400000))
    : 0;

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      {/* ── Calendar card ── */}
      <div className="rounded-2xl border border-sand-brand bg-white p-5 shadow-sm">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-brand/10 text-teal-brand">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </span>
            <div>
              <p className="font-headline text-base font-black text-charcoal-brand leading-tight">Select New Return Date</p>
              <p className="text-xs text-charcoal-brand/50">Choose a date after {shortMonthDay(dropoffDate)}</p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={prevMonth}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-brand bg-white text-charcoal-brand/60 transition-colors hover:bg-sand-brand hover:text-charcoal-brand"
            >
              ‹
            </button>
            <button
              onClick={nextMonth}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-brand bg-white text-charcoal-brand/60 transition-colors hover:bg-sand-brand hover:text-charcoal-brand"
            >
              ›
            </button>
          </div>
        </div>

        {/* Month label */}
        <p className="mb-3 text-center text-base font-black text-charcoal-brand">{monthLabel}</p>

        {/* Day headers */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {dayHeaders.map((d) => (
            <span key={d} className="text-center text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/40">{d}</span>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} className="aspect-square" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const cellDate = new Date(viewYear, viewMonth, day);
            const isDropoff = sameDay(cellDate, dropoffDate);
            const isSelected = selectedDateObj != null && sameDay(cellDate, selectedDateObj);
            const isPast = cellDate < dropoffDate;

            let cls = 'aspect-square flex items-center justify-center rounded-xl text-sm font-bold transition-all duration-150 relative ';
            if (isSelected) {
              cls += 'bg-teal-brand text-white font-black shadow-sm cursor-pointer';
            } else if (isDropoff) {
              cls += 'bg-amber-400 text-white font-black cursor-default';
            } else if (isPast) {
              cls += 'text-charcoal-brand/25 cursor-default';
            } else {
              cls += 'text-charcoal-brand hover:bg-teal-brand/10 hover:text-teal-brand cursor-pointer';
            }

            return (
              <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                disabled={isPast || isDropoff}
                className={cls}
              >
                {day}
                {isDropoff && (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/70" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-5 border-t border-sand-brand pt-3">
          <span className="flex items-center gap-1.5 text-xs text-charcoal-brand/60">
            <span className="h-3 w-3 rounded-sm bg-amber-400" />
            Current return
          </span>
          <span className="flex items-center gap-1.5 text-xs text-charcoal-brand/60">
            <span className="h-3 w-3 rounded-sm bg-teal-brand" />
            New return
          </span>
        </div>
      </div>

      {/* ── Return time grid ── */}
      <div className="rounded-2xl border border-sand-brand bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-charcoal-brand/50">Return Time</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {TIME_SLOTS.map((s) => {
            const isActive = s.value === selectedTime;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onSelectTime(s.value)}
                className={`rounded-xl border px-2 py-2.5 text-center text-sm font-bold transition-all duration-150 ${
                  isActive
                    ? 'border-teal-brand bg-teal-brand text-white shadow-sm'
                    : 'border-sand-brand bg-white text-charcoal-brand hover:border-teal-brand/40 hover:bg-teal-brand/5'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {selectedDate && (
          <p className="mt-3 text-center text-xs font-bold text-teal-brand/80">
            New return: {selectedDateObj?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
            at {ninePmSelected ? '9:00 PM' : (TIME_SLOTS.find(s => s.value === selectedTime)?.label ?? selectedTime)}
            {' '}·{' '}{additionalDays} Additional Day{additionalDays !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
