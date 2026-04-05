/** True when string is `YYYY-MM-DDTHH:mm` or longer (pickup/return with a chosen time). */
export function hasBookingDatetimeWithTime(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso);
}
