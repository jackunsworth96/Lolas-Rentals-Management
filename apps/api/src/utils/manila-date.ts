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
