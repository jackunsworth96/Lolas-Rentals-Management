/** Days the store is closed every year, as Manila-time MM-DD. No pickups or returns on these days. */
export const STORE_CLOSED_DAYS: ReadonlyArray<{ monthDay: string; name: string }> = [
  { monthDay: '12-25', name: 'Christmas Day' },
  { monthDay: '01-01', name: "New Year's Day" },
];

/** YYYY-MM-DD for an ISO datetime in Manila time; a plain YYYY-MM-DD is returned as-is. */
function manilaDateKey(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Name of the closure ("Christmas Day") when the Manila date is a closed day, otherwise null. */
export function storeClosedDayName(dateOrDatetime: string | null | undefined): string | null {
  if (!dateOrDatetime) return null;
  const key = manilaDateKey(dateOrDatetime);
  if (!key) return null;
  return STORE_CLOSED_DAYS.find((d) => key.endsWith(`-${d.monthDay}`))?.name ?? null;
}

export function isStoreClosedDay(dateOrDatetime: string | null | undefined): boolean {
  return storeClosedDayName(dateOrDatetime) !== null;
}

const CLOSED_DAY_WHEN: Record<string, string> = {
  'Christmas Day': '25 December',
  "New Year's Day": '1 January',
};

export function storeClosedCopy(closedDayName: string): { title: string; body: string } {
  const when = CLOSED_DAY_WHEN[closedDayName] ?? closedDayName;
  return {
    title: `We're closed on ${closedDayName}`,
    body: `Pickups and returns aren't possible on ${when}. Please arrange yours for the day before or after. Thank you for understanding.`,
  };
}

export function storeClosedMessage(_kind: 'pickup' | 'return', closedDayName: string): string {
  const { title, body } = storeClosedCopy(closedDayName);
  return `${title}. ${body}`;
}

/** True when an API/UI error is the Christmas / New Year's Day closure, not a sold-out fleet. */
export function isStoreClosedError(err: unknown): boolean {
  if (storeClosedDayFromError(err) !== null) return true;
  return Boolean(
    err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'STORE_CLOSED',
  );
}

export function storeClosedDayFromError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/christmas day/i.test(msg)) return 'Christmas Day';
  if (/new year's day/i.test(msg)) return "New Year's Day";
  return null;
}

/** Short label for date pickers: "Closed – Christmas Day". */
export function storeClosedLabel(closedDayName: string): string {
  return `Closed – ${closedDayName}`;
}

/** First problem with a pickup/return pair, or null when both days are open. */
export function storeClosedProblem(
  pickupDatetime: string | null | undefined,
  dropoffDatetime: string | null | undefined,
): string | null {
  const pickupClosed = storeClosedDayName(pickupDatetime);
  if (pickupClosed) return storeClosedMessage('pickup', pickupClosed);
  const dropoffClosed = storeClosedDayName(dropoffDatetime);
  if (dropoffClosed) return storeClosedMessage('return', dropoffClosed);
  return null;
}

/** Throws a 422 when pickup or return falls on a day the store is closed. */
export function assertStoreOpenForBooking(
  pickupDatetime: string | null | undefined,
  dropoffDatetime: string | null | undefined,
): void {
  const problem = storeClosedProblem(pickupDatetime, dropoffDatetime);
  if (problem) {
    const err = new Error(problem);
    (err as Error & { statusCode?: number; code?: string }).statusCode = 422;
    (err as Error & { statusCode?: number; code?: string }).code = 'STORE_CLOSED';
    throw err;
  }
}
