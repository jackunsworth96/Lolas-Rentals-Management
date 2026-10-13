/**
 * Manila timezone date/time utilities.
 * Use these instead of new Date().toISOString().slice(0,10)
 * to avoid UTC-vs-Manila (UTC+8) date drift near midnight.
 */

/** Returns a date in Manila time as YYYY-MM-DD */
export function formatManilaDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Returns current time in Manila as HH:MM:SS */
export function formatManilaTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false });
}

/** Returns YYYY-MM for the Manila month (for journal periods) */
export function formatManilaPeriod(date: Date = new Date()): string {
  return formatManilaDate(date).slice(0, 7);
}

/** Adds `days` calendar days to a 'YYYY-MM-DD' string. Pure date-string arithmetic, no timezone conversion. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Epoch ms for Manila midnight (UTC+8) of a 'YYYY-MM-DD' date string.
 *
 * Use this instead of `new Date(dateStr).getTime()` when comparing a
 * date-only period boundary against timestamptz columns. `new Date('2026-10-01')`
 * parses as UTC midnight, which is 8am in Manila — so a naive comparison silently
 * excludes early-morning Manila activity on the start day and includes the first
 * 8 hours of the day *after* the intended end date.
 */
export function manilaMidnightMs(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00+08:00`);
}

/**
 * Returns a human-readable Manila datetime, e.g. "Apr 22, 2026, 3:45 PM".
 * Accepts an ISO string, a Date, or nullish (falls back to empty string).
 */
export function formatManilaDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
