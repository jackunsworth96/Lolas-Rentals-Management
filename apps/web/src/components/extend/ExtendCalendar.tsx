import { useState, useMemo } from 'react';

interface Props {
  currentDropoff: string;
  selectedDate: string | null;
  selectedTime: string;
  onSelectDate: (iso: string) => void;
  onSelectTime: (time: string) => void;
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

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function ExtendCalendar({ currentDropoff, selectedDate, selectedTime, onSelectDate, onSelectTime }: Props) {
  const dropoffDate = useMemo(() => new Date(currentDropoff), [currentDropoff]);
  const [viewYear, setViewYear] = useState(dropoffDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(dropoffDate.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  }

  function handleDayClick(day: number) {
    const clicked = new Date(viewYear, viewMonth, day);
    if (clicked <= dropoffDate) return;
    onSelectDate(clicked.toISOString().slice(0, 10));
  }

  const selectedDateObj = selectedDate ? new Date(selectedDate) : null;
  const additionalDays = selectedDateObj
    ? Math.max(1, Math.ceil((selectedDateObj.getTime() - dropoffDate.getTime()) / 86400000))
    : 0;

  const dayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <section className="rounded-4xl bg-cream-brand p-8 shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)]">
      <h2 className="mb-8 flex items-center gap-3 font-headline text-2xl font-black text-teal-brand">
        <span className="text-xl">📅</span>
        Select New Return Date
      </h2>

      <div className="rounded-3xl bg-white/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-lg font-black text-charcoal-brand">{monthLabel}</p>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="rounded-full p-2 transition-colors hover:bg-sand-brand" type="button">◀</button>
            <button onClick={nextMonth} className="rounded-full p-2 transition-colors hover:bg-sand-brand" type="button">▶</button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-7 gap-1 text-center">
          {dayHeaders.map((d, i) => (
            <span key={i} className="text-[11px] font-black text-teal-brand/40">{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} className="h-10" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const cellDate = new Date(viewYear, viewMonth, day);
            const isDropoff = sameDay(cellDate, dropoffDate);
            const isSelected = selectedDateObj && sameDay(cellDate, selectedDateObj);
            const isPast = cellDate <= dropoffDate;

            let cls = 'h-10 flex items-center justify-center rounded-full font-bold transition-all duration-150 text-sm ';
            if (isSelected) cls += 'bg-gold-brand text-charcoal-brand font-black cursor-pointer relative';
            else if (isDropoff) cls += 'bg-teal-brand/10 text-teal-brand font-black';
            else if (isPast) cls += 'text-charcoal-brand/20';
            else cls += 'text-charcoal-brand hover:bg-sand-brand cursor-pointer';

            return (
              <button key={day} type="button" onClick={() => handleDayClick(day)} disabled={isPast && !isDropoff} className={cls}>
                {day}
                {isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-charcoal-brand" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time selector */}
      <div className="mt-6">
        <label className="ml-2 text-xs font-bold uppercase tracking-widest text-teal-brand">New Return Time</label>
        <div className="relative mt-2">
          <select
            value={selectedTime}
            onChange={(e) => onSelectTime(e.target.value)}
            className="w-full appearance-none rounded-full bg-sand-brand px-6 py-3 pr-10 font-medium text-charcoal-brand outline-none transition-all duration-200 focus:ring-2 focus:ring-teal-brand"
          >
            {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="pointer-events-none absolute right-4 top-3.5 text-charcoal-brand/50">▾</span>
        </div>
      </div>

      {selectedDate && (
        <p className="mt-6 text-center text-sm font-bold italic text-teal-brand">
          New Return: {formatLongDate(selectedDate)} ({additionalDays} Additional Day{additionalDays !== 1 ? 's' : ''})
        </p>
      )}
    </section>
  );
}
