export interface OwnerUseWindow {
  startsAt: string;
  /** Null means the vehicle stays on owner use until staff cancel it. */
  endsAt: string | null;
}

function parseWindow(value: unknown): OwnerUseWindow | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { startsAt?: unknown; endsAt?: unknown };
  const startsAt = record.startsAt;
  const endsAt = record.endsAt;
  if (typeof startsAt !== 'string') return null;
  if (!(endsAt === null || typeof endsAt === 'string')) return null;
  return { startsAt, endsAt };
}

/** Current and upcoming owner-use periods already attached to a fleet vehicle. */
export function ownerUsePeriodsFromVehicle(vehicle: {
  ownerUsePeriods?: unknown;
  activeOwnerUse?: unknown;
}): OwnerUseWindow[] {
  const periods = Array.isArray(vehicle.ownerUsePeriods) ? vehicle.ownerUsePeriods : [];
  const parsed = periods.flatMap((period) => {
    const window = parseWindow(period);
    return window ? [window] : [];
  });
  if (parsed.length > 0) return parsed;
  const active = parseWindow(vehicle.activeOwnerUse);
  return active ? [active] : [];
}

/**
 * True when any owner-use period overlaps the booking window.
 * Matches the half-open overlap used by fleet availability: the period
 * starts before dropoff and ends after pickup.
 */
export function ownerUseOverlapsBooking(
  periods: OwnerUseWindow[],
  pickupDatetime: string,
  dropoffDatetime: string,
): boolean {
  const pickupMs = new Date(pickupDatetime).getTime();
  const dropoffMs = new Date(dropoffDatetime).getTime();
  if (!Number.isFinite(pickupMs) || !Number.isFinite(dropoffMs) || pickupMs >= dropoffMs) return false;
  return periods.some((period) => {
    const startsMs = new Date(period.startsAt).getTime();
    if (!Number.isFinite(startsMs)) return false;
    const endsMs = period.endsAt == null ? Number.POSITIVE_INFINITY : new Date(period.endsAt).getTime();
    if (period.endsAt != null && !Number.isFinite(endsMs)) return false;
    return startsMs < dropoffMs && endsMs > pickupMs;
  });
}
