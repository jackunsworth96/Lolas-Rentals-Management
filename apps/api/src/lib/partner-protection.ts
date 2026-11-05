/**
 * Partner allocations reserve a number of units per vehicle type ("1 bike for
 * Bravo"), not a named vehicle. Mirrors public.allocation_counts: a booking
 * that is not for the partner can only use the shared pool, which is
 *   rentable units - every partner's allowance - shared-pool bookings,
 * and must have a free slot at every moment of the rental. Keep in step with
 * the database, which is the final check (allocation_reserve).
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface ProtectionData {
  enabled: boolean;
  partnerNames: Map<string, string>;
  /** Monthly allowance per partner (partner_allocations). */
  baselines: Array<{ partnerId: string; vehicleType: string; month: string; qty: number }>;
  overrides: Array<{ partnerId: string; vehicleType: string; startsOn: string; endsBefore: string; qty: number }>;
  /** Rentable units by allocation vehicle type ('bike' | 'tuktuk'). */
  units: Array<{ vehicleId: string; vehicleType: string }>;
  unavailable: Array<{ vehicleId: string; start: number; end: number }>;
  /** Existing capacity_reservation_segments, already in a pool. */
  commitments: Array<{ partnerId: string | null; vehicleType: string; pool: 'guaranteed' | 'shared'; start: number; end: number }>;
}

export interface PartnerAllowance {
  partnerId: string;
  partnerName: string;
  allowance: number;
  inUse: number;
  unused: number;
}

export const manilaDate = (at: number) => new Date(at + MANILA_OFFSET_MS).toISOString().slice(0, 10);
export const manilaMidnight = (date: string) => Date.parse(`${date}T00:00:00+08:00`);

export function allocationQty(d: ProtectionData, partnerId: string, vehicleType: string, at: number): number {
  const day = manilaDate(at);
  const override = d.overrides.find((o) => o.partnerId === partnerId && o.vehicleType === vehicleType
    && o.startsOn <= day && o.endsBefore > day);
  if (override) return override.qty;
  const month = `${day.slice(0, 7)}-01`;
  return d.baselines.find((b) => b.partnerId === partnerId && b.vehicleType === vehicleType && b.month === month)?.qty ?? 0;
}

function allocatedPartners(d: ProtectionData, vehicleType: string): string[] {
  return [...new Set([...d.baselines, ...d.overrides].filter((b) => b.vehicleType === vehicleType).map((b) => b.partnerId))];
}

const covers = (p: { start: number; end: number }, at: number) => p.start <= at && p.end > at;

export function poolCounts(d: ProtectionData, vehicleType: string, partnerId: string | null, at: number) {
  const unavailable = new Set(d.unavailable.filter((u) => covers(u, at)).map((u) => u.vehicleId));
  const units = d.units.filter((u) => u.vehicleType === vehicleType && !unavailable.has(u.vehicleId)).length;
  const live = d.commitments.filter((c) => c.vehicleType === vehicleType && covers(c, at));
  const guarantees = allocatedPartners(d, vehicleType).reduce((sum, p) => sum + allocationQty(d, p, vehicleType, at), 0);
  const sharedFree = units - guarantees - live.filter((c) => c.pool === 'shared').length;
  const protectedFree = partnerId
    ? allocationQty(d, partnerId, vehicleType, at) - live.filter((c) => c.partnerId === partnerId && c.pool === 'guaranteed').length
    : 0;
  return { sharedFree, protectedFree };
}

/** Instants inside [start, end) where any pool count can change. */
function boundaries(d: ProtectionData, vehicleType: string, start: number, end: number): number[] {
  const points = new Set<number>([start]);
  const add = (t: number) => { if (t > start && t < end) points.add(t); };
  for (const c of d.commitments) if (c.vehicleType === vehicleType) { add(c.start); add(c.end); }
  for (const u of d.unavailable) { add(u.start); add(u.end); }
  for (const o of d.overrides) if (o.vehicleType === vehicleType) { add(manilaMidnight(o.startsOn)); add(manilaMidnight(o.endsBefore)); }
  const first = manilaDate(start).slice(0, 7);
  for (let [y, m] = first.split('-').map(Number); ; m++) {
    if (m > 12) { y++; m = 1; }
    const t = manilaMidnight(`${y}-${String(m).padStart(2, '0')}-01`);
    if (t >= end) break;
    add(t);
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * How many more bookings of this vehicle type the allocation rules allow for
 * the whole of [start, end). Infinity when allocations are off for the store
 * or the type isn't allocated.
 */
export function bookableUnits(d: ProtectionData, vehicleType: string | null, partnerId: string | null, start: number, end: number): number {
  if (!d.enabled || !vehicleType || allocatedPartners(d, vehicleType).length === 0) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const at of boundaries(d, vehicleType, start, end)) {
    const { sharedFree, protectedFree } = poolCounts(d, vehicleType, partnerId, at);
    min = Math.min(min, Math.max(0, sharedFree) + Math.max(0, protectedFree));
  }
  return min;
}

/** Each partner's allowance at `at` and how much of it their own bookings are using. */
export function partnerAllowances(d: ProtectionData, vehicleType: string, at: number): PartnerAllowance[] {
  if (!d.enabled) return [];
  return allocatedPartners(d, vehicleType).map((partnerId) => {
    const allowance = allocationQty(d, partnerId, vehicleType, at);
    const inUse = d.commitments.filter((c) => c.vehicleType === vehicleType && c.partnerId === partnerId
      && c.pool === 'guaranteed' && covers(c, at)).length;
    return { partnerId, partnerName: d.partnerNames.get(partnerId) ?? 'Partner', allowance, inUse, unused: Math.max(0, allowance - inUse) };
  }).filter((a) => a.allowance > 0 || a.inUse > 0);
}

/** The partners whose unused allowance blocks a non-partner booking at any point in [start, end). */
export function blockingPartners(d: ProtectionData, vehicleType: string, exceptPartnerId: string | null, start: number, end: number): PartnerAllowance[] {
  const byId = new Map<string, PartnerAllowance>();
  for (const at of boundaries(d, vehicleType, start, end)) {
    for (const a of partnerAllowances(d, vehicleType, at)) {
      if (a.unused > 0 && a.partnerId !== exceptPartnerId && !byId.has(a.partnerId)) byId.set(a.partnerId, a);
    }
  }
  return [...byId.values()];
}

/**
 * Which of `free` (already in label order) carry a "Protected for <partner>"
 * label: as many as the partners' unused allowance, so the label floats to
 * whichever bikes are free rather than being pinned to one.
 */
export function assignProtectionLabels<T extends { id: string }>(
  free: T[],
  allowances: PartnerAllowance[],
  count: number = allowances.reduce((s, a) => s + a.unused, 0),
): Map<string, { partnerId: string | null; partnerName: string | null }> {
  const labels = new Map<string, { partnerId: string | null; partnerName: string | null }>();
  const queue = allowances.flatMap((a) => Array.from({ length: a.unused }, () => a));
  free.slice(0, Math.min(count, free.length)).forEach((vehicle, i) => {
    const partner = queue[i];
    labels.set(vehicle.id, { partnerId: partner?.partnerId ?? null, partnerName: partner?.partnerName ?? null });
  });
  return labels;
}
