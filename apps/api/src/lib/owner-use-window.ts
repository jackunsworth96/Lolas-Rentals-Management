/** PostgREST filter: the period is still open at this instant, including a null end. */
export function ownerUseNotEndedBy(iso: string): string {
  return `ends_at.is.null,ends_at.gt.${iso}`;
}

/** True when a half-open owner-use period overlaps [rangeStartMs, rangeEndMs). A null end stays open. */
export function ownerUseOverlapsRange(
  startsAt: string,
  endsAt: string | null,
  rangeStartMs: number,
  rangeEndMs: number,
): boolean {
  const startsMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsMs)) return false;
  const endsMs = endsAt == null ? Number.POSITIVE_INFINITY : new Date(endsAt).getTime();
  if (endsAt != null && !Number.isFinite(endsMs)) return false;
  return startsMs < rangeEndMs && endsMs > rangeStartMs;
}

export function ownerUseVehicleIdsOverlapping(
  rows: Array<{
    vehicle_id?: string | null;
    store_id?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  }>,
  rangeStartMs: number,
  rangeEndMs: number,
  storeId?: string,
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (storeId && row.store_id !== storeId) continue;
    if (!row.vehicle_id || !row.starts_at) continue;
    if (ownerUseOverlapsRange(row.starts_at, row.ends_at, rangeStartMs, rangeEndMs)) {
      ids.add(row.vehicle_id);
    }
  }
  return ids;
}

/** True when this assignment's pickup/dropoff overlaps an owner-use row for the same vehicle. */
export function ownerUseBlocksAssignment(
  rows: Array<{
    vehicle_id?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  }>,
  assignment: { vehicleId: string; pickupDatetime: string; dropoffDatetime: string },
): boolean {
  const pickupMs = new Date(assignment.pickupDatetime).getTime();
  const dropoffMs = new Date(assignment.dropoffDatetime).getTime();
  if (!Number.isFinite(pickupMs) || !Number.isFinite(dropoffMs) || pickupMs >= dropoffMs) return false;
  return rows.some((row) =>
    row.vehicle_id === assignment.vehicleId
    && !!row.starts_at
    && ownerUseOverlapsRange(row.starts_at, row.ends_at ?? null, pickupMs, dropoffMs),
  );
}
