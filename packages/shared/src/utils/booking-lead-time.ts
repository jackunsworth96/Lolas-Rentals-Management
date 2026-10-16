/** Minimum notice before a customer or partner pickup. Enforced at 15 minutes. */
export const MIN_BOOKING_LEAD_MS = 15 * 60 * 1000;

export function manilaCalendarDate(nowMs = Date.now()): string {
  return new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Manila-time label such as "4:15 PM" for the earliest pickup we can accept. */
export function earliestBookableLabel(nowMs = Date.now()): string {
  return new Date(nowMs + MIN_BOOKING_LEAD_MS).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function bookingLeadTimeMessage(nowMs = Date.now()): string {
  return (
    `We need at least 15 minutes' notice, but it's likely we can get to you sooner than that — ` +
    `go ahead and book for ${earliestBookableLabel(nowMs)} or later and we'll aim to be there by then. ` +
    `Need us there ASAP? Send us a message so we can make you a priority.`
  );
}

/** True when pickup is a valid instant at least 15 minutes after nowMs. */
export function hasBookingLeadTime(pickupDatetime: string, nowMs = Date.now()): boolean {
  const pickup = new Date(pickupDatetime);
  return !Number.isNaN(pickup.getTime()) && pickup.getTime() - nowMs >= MIN_BOOKING_LEAD_MS;
}

export function assertBookingLeadTime(pickupDatetime: string, nowMs = Date.now()): void {
  const pickup = new Date(pickupDatetime);
  if (Number.isNaN(pickup.getTime())) {
    const err = new Error('Invalid pickup datetime');
    (err as Error & { statusCode?: number }).statusCode = 422;
    throw err;
  }
  if (pickup.getTime() - nowMs < MIN_BOOKING_LEAD_MS) {
    const err = new Error(bookingLeadTimeMessage(nowMs));
    (err as Error & { statusCode?: number }).statusCode = 422;
    throw err;
  }
}
