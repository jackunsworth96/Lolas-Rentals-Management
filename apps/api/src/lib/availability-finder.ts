import { additionalUnitsThatFit, canAssignAll, type Period } from './fleet-assignment.js';
import { peakRackUsage, type RackUsageInterval } from './rack-usage.js';

/** Handover time after every return before the vehicle can go out again (same as the booking engine). */
export const HANDOVER_MS = 30 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const FIRST_SLOT_MINS = 9 * 60 + 15;
const LAST_SLOT_MINS = 16 * 60 + 45;

export interface FinderVehicle { id: string; name: string; modelId: string | null; status: string; surfRack: boolean }
export interface FinderModel { id: string; name: string; type: string | null; isActive: boolean; showOnWebsite: boolean }

export interface FixedBlock extends Period {
  kind: 'order' | 'walk_in' | 'owner_use';
  reference: string | null;
  customerName: string | null;
  orderId: string | null;
  rawOrderId: string | null;
  pickedUp: boolean;
  /** Picked up and past its return time: the bike is still out even though the booking has ended. */
  overdue: boolean;
}

export interface FloatingBooking extends Period {
  modelId: string;
  hold: boolean;
  reference: string | null;
  customerName: string | null;
  rawOrderId: string | null;
}

/** Move a time to the next bookable pickup slot (09:15–16:45 Manila). */
export function snapToSlot(at: number): number {
  const local = new Date(at + MANILA_OFFSET_MS);
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - MANILA_OFFSET_MS;
  if (mins < FIRST_SLOT_MINS) return midnight + FIRST_SLOT_MINS * 60_000;
  if (mins > LAST_SLOT_MINS) return midnight + DAY_MS + FIRST_SLOT_MINS * 60_000;
  return at;
}

/** Overdue rentals stay busy until they come back; assume no earlier than a handover from now. */
export function effectiveBlocks(blocks: FixedBlock[], fromMs: number): FixedBlock[] {
  return blocks.map((b) => (b.overdue ? { ...b, end: Math.max(b.end, fromMs + HANDOVER_MS) } : b));
}

const overlaps = (a: Period, b: Period) => a.start < b.end && b.start < a.end;

export type VehicleState = 'free' | 'on_rent' | 'overdue' | 'awaiting_pickup' | 'walk_in' | 'owner_use';

export interface VehicleTimeline {
  state: VehicleState;
  current: FixedBlock | null;
  /** When the current run of commitments ends (incl. handover). Null when open-ended. */
  busyUntil: number | null;
  /** Earliest time it can go out. Null when it never frees up (open-ended owner use). */
  nextFreeAt: number | null;
  /** Start of the next commitment after nextFreeAt. Null = no upcoming bookings. */
  freeUntil: number | null;
}

export function vehicleTimeline(blocks: FixedBlock[], fromMs: number): VehicleTimeline {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const covering = (t: number) => sorted.find((b) => b.start <= t && b.end > t);
  const current = covering(fromMs) ?? null;
  const state: VehicleState = !current ? 'free'
    : current.kind === 'owner_use' ? 'owner_use'
      : current.kind === 'walk_in' ? 'walk_in'
        : current.overdue ? 'overdue'
          : current.pickedUp ? 'on_rent' : 'awaiting_pickup';

  let cursor = fromMs;
  let busyUntil: number | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    for (let b = covering(cursor); b; b = covering(cursor)) {
      cursor = b.end;
      if (!Number.isFinite(cursor)) return { state, current, busyUntil: null, nextFreeAt: null, freeUntil: null };
    }
    if (current && busyUntil == null) busyUntil = cursor;
    const slot = cursor === fromMs ? fromMs : snapToSlot(cursor);
    const next = sorted.filter((b) => b.start >= cursor).reduce<number | null>((min, b) => (min == null || b.start < min ? b.start : min), null);
    // Returned too late to go out again before the next booking starts.
    if (next != null && next <= slot) { cursor = next; continue; }
    return { state, current, busyUntil, nextFreeAt: slot, freeUntil: next };
  }
  return { state, current, busyUntil, nextFreeAt: null, freeUntil: null };
}

/**
 * Free vehicles that must stay free so every unassigned booking of the model
 * still gets a vehicle (same rule as the walk-in picker's reservedForBookings).
 */
export function heldForUnassigned(
  vehicleIds: string[],
  blocksOf: (id: string) => Period[],
  floating: Period[],
  request: Period,
): Set<string> {
  const held = new Set<string>();
  const all = vehicleIds.map(blocksOf);
  if (floating.length === 0 || !canAssignAll(all, floating)) return held;
  const open: string[] = [];
  vehicleIds.forEach((id, index) => {
    if (all[index].some((b) => overlaps(b, request))) return;
    const withRequest = all.map((list, i) => (i === index ? [...list, request] : list));
    if (!canAssignAll(withRequest, floating)) held.add(id);
    else open.push(id);
  });
  // Interchangeable bikes: no single one is needed, but together they cover the bookings.
  const fit = additionalUnitsThatFit(all, floating, request);
  while (open.length > fit) held.add(open.pop()!);
  return held;
}

export interface SearchAnswer {
  unit: number;
  startsAt: number;
  vehicleId: string | null;
  vehicleName: string | null;
  /** Next commitment for that vehicle after the rental starts. Null = no upcoming bookings. */
  freeUntil: number | null;
}

export interface UnitSearch {
  vehicles: FinderVehicle[];
  blocks: Map<string, FixedBlock[]>;
  floating: Period[];
  fromMs: number;
  lengthMs: number;
  quantity: number;
  horizonMs: number;
  /** Other instants when capacity can grow (allocation pools freeing up, month changes). */
  extraCandidates?: number[];
  /** Allocation-rule cap for a rental over [start, end); Infinity when allocations don't apply. */
  capacity?: (start: number, end: number) => number;
  /** Vehicles to name last (carrying a partner-protection label). */
  avoid?: Set<string>;
}

/**
 * For k = 1..quantity, the earliest start at which k rentals of `lengthMs`
 * fit together, using the same fit test as the booking engine. Answers past
 * the horizon are left out.
 */
export function searchUnits(s: UnitSearch): SearchAnswer[] {
  const start = snapToSlot(s.fromMs);
  const last = s.fromMs + s.horizonMs;
  const blocksOf = (id: string) => effectiveBlocks(s.blocks.get(id) ?? [], s.fromMs);
  const vehicleBlocks = s.vehicles.map((v) => blocksOf(v.id));
  const raw = [start, ...s.floating.map((f) => f.end), ...(s.extraCandidates ?? [])];
  for (const list of vehicleBlocks) for (const b of list) raw.push(b.end);
  const candidates = [...new Set(raw.filter(Number.isFinite).map(snapToSlot))]
    .filter((t) => t >= start && t <= last)
    .sort((a, b) => a - b);

  const answers: SearchAnswer[] = [];
  const used = new Map<string, Period[]>();
  for (const t of candidates) {
    if (answers.length >= s.quantity) break;
    const request: Period = { start: t, end: t + s.lengthMs + HANDOVER_MS };
    const fit = additionalUnitsThatFit(vehicleBlocks, s.floating, request);
    const cap = Math.min(fit, s.capacity ? s.capacity(request.start, request.end) : Number.POSITIVE_INFINITY);
    while (answers.length < Math.min(cap, s.quantity)) {
      const pick = pickVehicle(s, blocksOf, used, request);
      if (pick) used.set(pick.id, [...(used.get(pick.id) ?? []), request]);
      answers.push({
        unit: answers.length + 1,
        startsAt: t,
        vehicleId: pick?.id ?? null,
        vehicleName: pick?.name ?? null,
        freeUntil: pick ? nextStartAfter(blocksOf(pick.id), request.start) : null,
      });
    }
  }
  return answers;
}

function nextStartAfter(blocks: Period[], at: number): number | null {
  return blocks.filter((b) => b.start >= at).reduce<number | null>((min, b) => (min == null || b.start < min ? b.start : min), null);
}

function pickVehicle(
  s: UnitSearch,
  blocksOf: (id: string) => FixedBlock[],
  used: Map<string, Period[]>,
  request: Period,
): FinderVehicle | null {
  const withUsed = (id: string): Period[] => [...blocksOf(id), ...(used.get(id) ?? [])];
  const options = s.vehicles
    .filter((v) => !withUsed(v.id).some((b) => overlaps(b, request)))
    .map((v) => ({ v, next: nextStartAfter(withUsed(v.id), request.end) ?? Number.POSITIVE_INFINITY }))
    // Best fit: keep the vehicles with long open runs for longer rentals.
    .sort((a, b) => Number(s.avoid?.has(a.v.id) ?? false) - Number(s.avoid?.has(b.v.id) ?? false)
      || a.next - b.next || a.v.name.localeCompare(b.v.name));
  for (const { v } of options) {
    const all = s.vehicles.map((x) => (x.id === v.id ? [...withUsed(x.id), request] : withUsed(x.id)));
    if (canAssignAll(all, s.floating)) return v;
  }
  return options[0]?.v ?? null;
}

export interface RackSearch {
  intervals: RackUsageInterval[];
  total: number;
  fromMs: number;
  lengthMs: number;
  quantity: number;
  horizonMs: number;
  /** Rack-fitted bikes free for the whole of [start, end). */
  rackBikesFree: (start: number, end: number) => number;
  extraCandidates?: number[];
}

/** Earliest start for each of `quantity` surf racks, capped by rack stock and free rack-fitted bikes. */
export function searchRacks(s: RackSearch): Array<{ unit: number; startsAt: number }> {
  const start = snapToSlot(s.fromMs);
  const last = s.fromMs + s.horizonMs;
  const candidates = [...new Set([start, ...s.intervals.map((i) => i.endMs), ...(s.extraCandidates ?? [])]
    .filter(Number.isFinite).map(snapToSlot))]
    .filter((t) => t >= start && t <= last)
    .sort((a, b) => a - b);
  const answers: Array<{ unit: number; startsAt: number }> = [];
  for (const t of candidates) {
    if (answers.length >= s.quantity) break;
    const end = t + s.lengthMs;
    const free = Math.min(
      s.total - peakRackUsage(s.intervals, t, end),
      s.rackBikesFree(t, end + HANDOVER_MS),
    );
    while (answers.length < Math.min(free, s.quantity)) answers.push({ unit: answers.length + 1, startsAt: t });
  }
  return answers;
}
