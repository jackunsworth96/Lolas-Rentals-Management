/**
 * Pure pickup-time calculation for airport transfers.
 *
 * All times are interpreted and returned in PHT (Asia/Manila, UTC+8).
 * This module has no side effects and no imports beyond Node built-ins.
 */

export type TransferDirection = 'inbound' | 'outbound';

/**
 * Result of a pickup time calculation.
 * - `from` is always set (HH:MM string in PHT).
 * - `to` is only set for shared-van outbound bookings (the window upper bound).
 */
export interface PickupTimeResult {
  /** Lower bound (or exact time) formatted as "HH:MM". */
  from: string;
  /** Upper bound formatted as "HH:MM", or null for non-window bookings. */
  to: string | null;
}

/**
 * Derives the transfer direction from the raw route string stored in the
 * database.  The first segment (before "→" or "->") is checked: if it
 * mentions "iao" or "airport" the trip originates at the airport (inbound
 * from the customer's perspective — they are arriving).
 */
export function inferDirection(route: string): TransferDirection {
  const firstSegment = route
    .split(/→|->/)
    .map((s) => s.trim().toLowerCase())[0] ?? '';
  return firstSegment.includes('iao') || firstSegment.includes('airport')
    ? 'inbound'
    : 'outbound';
}

/**
 * Parses a flight time string into a Date on the given service date.
 *
 * Accepts:
 *  - "HH:MM" — combined with serviceDate in PHT.
 *  - ISO 8601 / full datetime string — used as-is.
 */
function parseFlightTime(flightTime: string, serviceDate: string): Date {
  // If it looks like a bare time (HH:MM or H:MM), attach the service date.
  if (/^\d{1,2}:\d{2}$/.test(flightTime.trim())) {
    // Build a PHT timestamp so arithmetic stays in the correct timezone.
    return new Date(`${serviceDate}T${flightTime.trim()}:00+08:00`);
  }
  // Otherwise trust whatever datetime string was stored.
  return new Date(flightTime);
}

/** Formats a Date as "HH:MM" in PHT (Asia/Manila). */
function formatPHT(date: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Returns a new Date offset by `minutes` (negative = earlier). */
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Calculates the customer pickup time for an airport transfer.
 *
 * Rules:
 *  - **inbound**: pickup = exact arrival time (no offset). The driver meets
 *    the customer at the airport after the plane lands.
 *  - **outbound + shared_van**: pickup window from (flightTime − 120 min) to
 *    (flightTime − 90 min). The shared van collects multiple passengers so it
 *    leaves earlier with a wider window.
 *  - **outbound + private_van | tuktuk**: single pickup time of
 *    (flightTime − 90 min). Private vehicles don't need the extra buffer.
 *
 * @param direction  - 'inbound' or 'outbound'
 * @param vanType    - raw van_type value from the database (e.g. 'shared_van',
 *                     'private_van', 'tuktuk') — may be null
 * @param flightTime - flight time string, either "HH:MM" or a full ISO string
 * @param serviceDate - booking date in "YYYY-MM-DD" format
 * @returns PickupTimeResult with HH:MM strings in PHT
 */
export function calculatePickupTime(
  direction: TransferDirection,
  vanType: string | null,
  flightTime: string,
  serviceDate: string,
): PickupTimeResult {
  const flightDate = parseFlightTime(flightTime, serviceDate);

  if (direction === 'inbound') {
    // Driver picks up at arrival — no offset needed.
    return { from: formatPHT(flightDate), to: null };
  }

  // Outbound: shared van gets a 30-minute window starting 2 hours before.
  if (vanType === 'shared_van') {
    const windowStart = addMinutes(flightDate, -120);
    const windowEnd   = addMinutes(flightDate, -90);
    return { from: formatPHT(windowStart), to: formatPHT(windowEnd) };
  }

  // Outbound: private van and tuktuk — single time 90 minutes before.
  const pickupTime = addMinutes(flightDate, -90);
  return { from: formatPHT(pickupTime), to: null };
}
