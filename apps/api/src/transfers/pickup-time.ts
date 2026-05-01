/**
 * Pure pickup-time calculation for airport transfers.
 *
 * All times are interpreted and returned in PHT (Asia/Manila, UTC+8).
 * This module has no side effects and no imports beyond Node built-ins.
 *
 * Rules summary:
 *  - inbound:              pickup = exact arrival time (driver meets at airport).
 *  - outbound shared_van:  floor flight hour to nearest hour, look up bracket
 *                          rule table, return the matching pickup window.
 *  - outbound private_van: single time = flight departure − 90 min.
 *  - outbound tuktuk:      single time = flight departure − 90 min.
 */

export type TransferDirection = 'inbound' | 'outbound';

/**
 * A single row from transfer_pickup_rules, mapped to camelCase.
 * Pass an array loaded from the database to calculatePickupTime.
 */
export interface PickupRule {
  vehicleType: string;
  direction: string;
  ruleType: 'bracket' | 'offset';
  /** For bracket rules: the floored PHT departure hour (0–23). */
  flightHour: number | null;
  /** For bracket rules: window start in "HH:MM" or "HH:MM:SS" format. */
  pickupFrom: string | null;
  /** For bracket rules: window end in "HH:MM" or "HH:MM:SS" format. Null = no window. */
  pickupTo: string | null;
  /** For offset rules: minutes relative to flight time (negative = before flight). */
  offsetMins: number | null;
}

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
  if (/^\d{1,2}:\d{2}$/.test(flightTime.trim())) {
    return new Date(`${serviceDate}T${flightTime.trim()}:00+08:00`);
  }
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

/** Extracts the hour component (0–23) of a Date in PHT using Intl.DateTimeFormat. */
function getFlightHourPHT(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  return hourPart ? parseInt(hourPart.value, 10) : 0;
}

/** Returns a new Date offset by `minutes` (negative = earlier). */
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Strips trailing seconds from a Postgres time string so it is always "HH:MM".
 * Postgres returns time columns as "HH:MM:SS"; this normalises to "HH:MM".
 */
function toHHMM(t: string): string {
  return t.slice(0, 5);
}

/**
 * Calculates the customer pickup time for an airport transfer.
 *
 * @param direction   - 'inbound' or 'outbound'
 * @param vanType     - raw van_type value from the database, e.g. 'shared_van',
 *                      'private_van', 'tuktuk' — may be null
 * @param flightTime  - flight time string, either "HH:MM" or a full ISO string
 * @param serviceDate - booking date in "YYYY-MM-DD" format
 * @param rules       - active rows from transfer_pickup_rules, loaded from DB
 * @returns PickupTimeResult with HH:MM strings in PHT
 */
export function calculatePickupTime(
  direction: TransferDirection,
  vanType: string | null,
  flightTime: string,
  serviceDate: string,
  rules: PickupRule[],
): PickupTimeResult {
  const flightDate = parseFlightTime(flightTime, serviceDate);

  // Inbound: driver meets customer at IAO on arrival. No offset applied.
  if (direction === 'inbound') {
    return { from: formatPHT(flightDate), to: null };
  }

  // Outbound shared_van: floor flight hour, look up bracket rule.
  if (vanType === 'shared_van') {
    const flightHour = getFlightHourPHT(flightDate);
    const rule = rules.find(
      (r) =>
        r.vehicleType === 'shared_van' &&
        r.direction === 'outbound' &&
        r.ruleType === 'bracket' &&
        r.flightHour === flightHour,
    );

    if (rule?.pickupFrom) {
      return {
        from: toHHMM(rule.pickupFrom),
        to: rule.pickupTo ? toHHMM(rule.pickupTo) : null,
      };
    }

    // No bracket rule found for this hour — fall back to 90-min offset.
    const fallback = addMinutes(flightDate, -90);
    return { from: formatPHT(fallback), to: null };
  }

  // Outbound private_van / tuktuk: look up offset rule.
  const effectiveVanType = vanType ?? 'private_van';
  const offsetRule = rules.find(
    (r) =>
      r.vehicleType === effectiveVanType &&
      r.direction === 'outbound' &&
      r.ruleType === 'offset',
  );

  const offsetMins = offsetRule?.offsetMins ?? -90;
  const pickupTime = addMinutes(flightDate, offsetMins);
  return { from: formatPHT(pickupTime), to: null };
}
