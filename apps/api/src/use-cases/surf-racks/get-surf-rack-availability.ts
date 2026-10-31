import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateAvailability } from '../../adapters/supabase/booking-adapter.js';

export interface RackUsageInterval {
  startMs: number;
  endMs: number;
  quantity: number;
}

/**
 * Highest number of racks out at the same moment inside [rangeStartMs, rangeEndMs).
 * Intervals that only touch end-to-start do not overlap, so one rack can serve both.
 */
export function peakRackUsage(
  intervals: RackUsageInterval[],
  rangeStartMs: number,
  rangeEndMs: number,
): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const iv of intervals) {
    const start = Math.max(iv.startMs, rangeStartMs);
    const end = Math.min(iv.endMs, rangeEndMs);
    if (!(end > start) || iv.quantity <= 0) continue;
    events.push({ t: start, delta: iv.quantity }, { t: end, delta: -iv.quantity });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const e of events) {
    current += e.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

export interface SurfRackAvailability {
  /** False when the store has no rack stock configured; callers fall back to "subject to availability". */
  tracked: boolean;
  total: number;
  peakInUse: number;
  /** Free compatible-mount bikes of the requested model, when a model was given. */
  compatibleVehiclesFree: number | null;
  remaining: number;
  soldOut: boolean;
  rackAddonIds: number[];
}

export interface SurfRackAvailabilityQuery {
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  vehicleModelId?: string | null;
  excludeOrderId?: string | null;
  excludeRawOrderId?: string | null;
  excludeSessionToken?: string | null;
}

export async function loadSurfRackAddons(
  sb: SupabaseClient,
  storeId: string,
): Promise<Array<{ id: number; name: string }>> {
  const { data, error } = await sb
    .from('addons')
    .select('id, name, inventory_type, store_id')
    .or(`store_id.eq.${storeId},store_id.is.null`);
  if (error) throw new Error(`Failed to load surf rack add-ons: ${error.message}`);
  return ((data ?? []) as Array<{ id: number; name: string; inventory_type: string | null }>)
    .filter((a) => a.inventory_type === 'surf_rack' || /surf\s*rack/i.test(a.name))
    .map((a) => ({ id: Number(a.id), name: a.name }));
}

export async function getSurfRackAddonIds(sb: SupabaseClient, storeId: string): Promise<number[]> {
  return (await loadSurfRackAddons(sb, storeId)).map((a) => a.id);
}

export function countRackAddons(addonIds: Array<number | string> | null | undefined, rackAddonIds: number[]): number {
  if (!addonIds || rackAddonIds.length === 0) return 0;
  const rackSet = new Set(rackAddonIds);
  return addonIds.filter((id) => rackSet.has(Number(id))).length;
}

/** Racks requested by order_addons-style lines, matched by catalog name (or the "surf rack" name pattern). */
export function countRackAddonLines(
  lines: Array<{ addonName: string; quantity?: number | null }>,
  rackAddonNames: string[],
): number {
  const names = new Set(rackAddonNames.map((n) => n.trim().toLowerCase()));
  return lines
    .filter((l) => names.has(l.addonName.trim().toLowerCase()) || /surf\s*rack/i.test(l.addonName))
    .reduce((s, l) => s + Math.max(1, Number(l.quantity) || 1), 0);
}

async function countFreeCompatibleVehicles(
  sb: SupabaseClient,
  q: SurfRackAvailabilityQuery,
): Promise<number | null> {
  if (!q.vehicleModelId) return null;
  try {
    const evaluation = await evaluateAvailability(
      {
        storeId: q.storeId,
        pickupDatetime: q.pickupDatetime,
        dropoffDatetime: q.dropoffDatetime,
        excludeRawOrderId: q.excludeRawOrderId ?? undefined,
        excludeSessionToken: q.excludeSessionToken ?? undefined,
      },
      sb,
      { vehicleAssignments: true, includeHiddenFromWebsite: true },
    );
    const blocked = new Set([
      ...evaluation.explanation.configurationExclusions.map((v) => v.vehicleId),
      ...evaluation.explanation.models.flatMap((m) => m.exactVehicleExclusions.map((v) => v.vehicleId)),
      ...evaluation.explanation.models.flatMap((m) => (m.reservedForBookings ?? []).map((v) => v.vehicleId)),
    ]);
    const { data, error } = await sb
      .from('fleet')
      .select('id')
      .eq('store_id', q.storeId)
      .eq('model_id', q.vehicleModelId)
      .eq('surf_rack', true);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string }>).filter((v) => !blocked.has(v.id)).length;
  } catch {
    // The bike cap is a refinement; rack stock alone still prevents double-booking.
    return null;
  }
}

export async function getSurfRackAvailability(
  sb: SupabaseClient,
  q: SurfRackAvailabilityQuery,
): Promise<SurfRackAvailability> {
  const startMs = new Date(q.pickupDatetime).getTime();
  const endMs = new Date(q.dropoffDatetime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw Object.assign(new Error('Dropoff must be after a valid pickup datetime'), { statusCode: 422 });
  }
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  const [storeRes, rackAddonIds] = await Promise.all([
    sb.from('stores').select('surf_rack_count').eq('id', q.storeId).maybeSingle(),
    getSurfRackAddonIds(sb, q.storeId),
  ]);
  if (storeRes.error) throw new Error(`Failed to load store rack count: ${storeRes.error.message}`);
  const total = Number((storeRes.data as { surf_rack_count?: number } | null)?.surf_rack_count ?? 0);

  if (total <= 0) {
    return {
      tracked: false, total: 0, peakInUse: 0, compatibleVehiclesFree: null,
      remaining: 0, soldOut: false, rackAddonIds,
    };
  }

  let allocQuery = sb
    .from('surf_rack_allocations')
    .select('order_id, quantity, starts_at, ends_at, released_at')
    .eq('store_id', q.storeId)
    .lt('starts_at', endIso)
    .gt('ends_at', startIso)
    .or(`released_at.is.null,released_at.gt.${startIso}`);
  if (q.excludeOrderId) allocQuery = allocQuery.neq('order_id', q.excludeOrderId);

  const rawQuery = rackAddonIds.length > 0
    ? (() => {
        let rq = sb
          .from('orders_raw')
          .select('id, addon_ids, pickup_datetime, dropoff_datetime')
          .eq('store_id', q.storeId)
          .eq('status', 'unprocessed')
          .is('cancelled_at', null)
          .lt('pickup_datetime', endIso)
          .gt('dropoff_datetime', startIso)
          .overlaps('addon_ids', rackAddonIds);
        if (q.excludeRawOrderId) rq = rq.neq('id', q.excludeRawOrderId);
        return rq;
      })()
    : null;

  const [allocRes, rawRes, compatibleVehiclesFree] = await Promise.all([
    allocQuery,
    rawQuery ?? Promise.resolve({ data: [], error: null }),
    countFreeCompatibleVehicles(sb, q),
  ]);
  if (allocRes.error) throw new Error(`Failed to load rack allocations: ${allocRes.error.message}`);
  if (rawRes.error) throw new Error(`Failed to load pending rack bookings: ${rawRes.error.message}`);

  const intervals: RackUsageInterval[] = [];
  for (const a of (allocRes.data ?? []) as Array<{ quantity: number; starts_at: string; ends_at: string; released_at: string | null }>) {
    const end = new Date(a.ends_at).getTime();
    const released = a.released_at ? new Date(a.released_at).getTime() : Infinity;
    intervals.push({ startMs: new Date(a.starts_at).getTime(), endMs: Math.min(end, released), quantity: Number(a.quantity) || 1 });
  }
  for (const r of (rawRes.data ?? []) as Array<{ addon_ids: number[] | null; pickup_datetime: string; dropoff_datetime: string }>) {
    const qty = countRackAddons(r.addon_ids, rackAddonIds);
    if (qty > 0) {
      intervals.push({ startMs: new Date(r.pickup_datetime).getTime(), endMs: new Date(r.dropoff_datetime).getTime(), quantity: qty });
    }
  }

  const peakInUse = peakRackUsage(intervals, startMs, endMs);
  const stockFree = Math.max(0, total - peakInUse);
  const remaining = compatibleVehiclesFree == null ? stockFree : Math.min(stockFree, compatibleVehiclesFree);
  return {
    tracked: true, total, peakInUse, compatibleVehiclesFree,
    remaining, soldOut: remaining <= 0, rackAddonIds,
  };
}

/** Throws 409 when a booking asks for more racks than are free. No-op while stock is untracked. */
export async function assertSurfRacksAvailable(
  sb: SupabaseClient,
  q: SurfRackAvailabilityQuery & { requested: number },
): Promise<void> {
  if (q.requested <= 0) return;
  const availability = await getSurfRackAvailability(sb, q);
  if (!availability.tracked) return;
  if (availability.remaining < q.requested) {
    const msg = availability.remaining === 0
      ? 'Surf racks are fully booked for these dates. Please remove the surf rack or choose different dates.'
      : `Only ${availability.remaining} surf rack${availability.remaining === 1 ? '' : 's'} left for these dates.`;
    throw Object.assign(new Error(msg), { statusCode: 409 });
  }
}
