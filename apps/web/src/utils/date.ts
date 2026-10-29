const TIMEZONE = 'Asia/Manila';

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-PH', { timeZone: TIMEZONE });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-PH', { timeZone: TIMEZONE });
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-PH', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

/** Short month + day + time in Manila, e.g. "Apr 6, 09:15 AM" */
export function formatPickupDatetimeManila(date: string | Date): string {
  return new Date(date).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function today(): string {
  return toISODate(new Date());
}

/**
 * Current Manila calendar date as YYYY-MM-DD.
 * Use this (not `new Date().toISOString().slice(0, 10)`) for "today" defaults/caps
 * on date pickers tied to real-world events — the UTC date lags Manila's by one day
 * during Manila's 12:00am-7:59am window (Manila = UTC+8), which silently logs
 * overnight events a day early.
 */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Current Manila wall-clock time as HH:mm (24-hour). */
export function manilaNowTime(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false }).slice(0, 5);
}

/**
 * Current Manila date+time as "YYYY-MM-DDTHH:mm", for pre-filling
 * <input type="datetime-local"> so the displayed default matches the clock
 * on the wall, not a UTC timestamp mislabeled as local.
 */
export function manilaNowDateTimeLocal(): string {
  return `${manilaToday()}T${manilaNowTime()}`;
}

/**
 * Converts a "YYYY-MM-DDTHH:mm"-ish local datetime string (as produced by a
 * date/time or datetime-local input) into a UTC ISO string, treating the
 * input as Manila time regardless of the browser/OS's own timezone setting.
 * Use this instead of `new Date(str).toISOString()`, which silently uses
 * whatever timezone the machine happens to be set to.
 */
export function manilaLocalToISO(localDateTime: string): string {
  const withSeconds = localDateTime.length === 16 ? `${localDateTime}:00` : localDateTime;
  return new Date(`${withSeconds}+08:00`).toISOString();
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
