/** True when string is `YYYY-MM-DDTHH:mm` or longer (pickup/return with a chosen time). */
export function hasBookingDatetimeWithTime(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso);
}

/** Datetime-local inputs are shop time, regardless of the staff device's timezone. */
export function bookingDatetimeISO(value: string): string {
  if (!value || /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return value;
  return `${value.length === 16 ? `${value}:00` : value}+08:00`;
}
