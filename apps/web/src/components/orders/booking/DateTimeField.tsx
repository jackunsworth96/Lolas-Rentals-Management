interface TimeParts { date: string; hours12: number; minutes: number; ampm: 'AM' | 'PM' }

function splitDatetime(dt: string): TimeParts {
  if (!dt) return { date: '', hours12: 12, minutes: 0, ampm: 'AM' };
  const [datePart, timePart] = dt.split('T');
  if (!timePart) return { date: datePart || '', hours12: 12, minutes: 0, ampm: 'AM' };
  const [hStr, mStr] = timePart.split(':');
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { date: datePart, hours12: h, minutes: m, ampm };
}

function combineFromParts(p: TimeParts): string {
  if (!p.date) return '';
  let h24 = p.hours12;
  if (p.ampm === 'AM' && h24 === 12) h24 = 0;
  else if (p.ampm === 'PM' && h24 < 12) h24 += 12;
  return `${p.date}T${String(h24).padStart(2, '0')}:${String(p.minutes).padStart(2, '0')}:00+08:00`;
}

function isOutsideBusinessHours(p: TimeParts): boolean {
  let h24 = p.hours12;
  if (p.ampm === 'AM' && h24 === 12) h24 = 0;
  else if (p.ampm === 'PM' && h24 < 12) h24 += 12;
  const totalMins = h24 * 60 + p.minutes;
  const openMins = 9 * 60 + 15;
  const closeMins = 16 * 60 + 45;
  const ninePmMins = 21 * 60;
  return totalMins < openMins || (totalMins > closeMins && totalMins !== ninePmMins);
}

const boxClass =
  'h-10 rounded-lg border border-gray-300 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

interface DateTimeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  dateAriaLabel: string;
  /** Warn when the time is outside shop hours (9:15 AM – 4:45 PM, or the 9 PM return). */
  warnOutsideHours?: boolean;
}

export function DateTimeField({ label, value, onChange, dateAriaLabel, warnOutsideHours = false }: DateTimeFieldProps) {
  const parts = splitDatetime(value);
  const update = (patch: Partial<TimeParts>) => onChange(combineFromParts({ ...parts, ...patch }));

  return (
    <div>
      <span className="text-sm text-gray-600">{label}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          aria-label={dateAriaLabel}
          value={parts.date}
          onChange={(e) => update({ date: e.target.value })}
          className={`${boxClass} w-full min-w-[8.5rem] px-2 sm:w-auto sm:flex-1`}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${label} hour`}
            min={1}
            max={12}
            value={parts.hours12}
            onChange={(e) => update({ hours12: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
            className={`${boxClass} w-12 px-1 text-center`}
          />
          <span className="font-medium text-gray-400">:</span>
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${label} minute`}
            min={0}
            max={59}
            value={String(parts.minutes).padStart(2, '0')}
            onChange={(e) => update({ minutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
            className={`${boxClass} w-12 px-1 text-center`}
          />
          <button
            type="button"
            onClick={() => update({ ampm: parts.ampm === 'AM' ? 'PM' : 'AM' })}
            className={`${boxClass} px-3 text-xs font-semibold text-gray-700 hover:bg-gray-100`}
          >
            {parts.ampm}
          </button>
        </div>
      </div>
      {warnOutsideHours && parts.date && isOutsideBusinessHours(parts) && (
        <p className="mt-1 text-xs font-semibold text-amber-600">
          Outside business hours (9:15 AM – 4:45 PM). Confirm this is intentional.
        </p>
      )}
    </div>
  );
}
