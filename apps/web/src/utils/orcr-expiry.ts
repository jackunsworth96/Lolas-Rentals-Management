export type OrcrTone = 'amber' | 'red' | null;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

/** Calendar date in Asia/Manila, so a date-only expiry is not shifted by UTC parsing. */
export function manilaCalendarDate(now = new Date()): CalendarDate {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = formatted.split('-').map(Number);
  return { y, m, d };
}

function parseDateOnly(dateStr: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return { y, m, d };
}

function utcDay(date: CalendarDate): number {
  return Date.UTC(date.y, date.m - 1, date.d);
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const next = new Date(utcDay(date) + days * MS_PER_DAY);
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

/** Same day N calendar months ahead. Clamps to the last day when that month is shorter. */
function addCalendarMonths(date: CalendarDate, months: number): CalendarDate {
  const monthIndex = date.m - 1 + months;
  const y = date.y + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { y, m: m + 1, d: Math.min(date.d, lastDay) };
}

/**
 * Amber: expiry is within 2 calendar months, or the date is missing.
 * Red: expiry is within 14 days, today, or overdue.
 * Further out than 2 months stays uncolored.
 */
export function orcrExpiryTone(dateStr: string | null | undefined, now = new Date()): OrcrTone {
  if (!dateStr?.trim()) return 'amber';
  const expiry = parseDateOnly(dateStr);
  if (!expiry) return 'amber';

  const today = manilaCalendarDate(now);
  if (utcDay(expiry) <= utcDay(addDays(today, 14))) return 'red';
  if (utcDay(expiry) <= utcDay(addCalendarMonths(today, 2))) return 'amber';
  return null;
}

export function orcrRowClass(tone: OrcrTone): string {
  if (tone === 'red') return 'bg-red-100 hover:bg-red-200';
  if (tone === 'amber') return 'bg-amber-100 hover:bg-amber-200';
  return '';
}

export function orcrCardClass(tone: OrcrTone): string {
  if (tone === 'red') return 'border-red-200 bg-red-100 hover:bg-red-200';
  if (tone === 'amber') return 'border-amber-200 bg-amber-100 hover:bg-amber-200';
  return 'border-gray-200 bg-white';
}
