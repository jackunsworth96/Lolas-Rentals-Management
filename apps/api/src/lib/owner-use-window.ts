/** True when a half-open owner-use period overlaps [rangeStartMs, rangeEndMs). */
export function ownerUseOverlapsRange(
  startsAt: string,
  endsAt: string,
  rangeStartMs: number,
  rangeEndMs: number,
): boolean {
  const startsMs = new Date(startsAt).getTime();
  const endsMs = new Date(endsAt).getTime();
  if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs)) return false;
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
    if (!row.vehicle_id || !row.starts_at || !row.ends_at) continue;
    if (ownerUseOverlapsRange(row.starts_at, row.ends_at, rangeStartMs, rangeEndMs)) {
      ids.add(row.vehicle_id);
    }
  }
  return ids;
}
