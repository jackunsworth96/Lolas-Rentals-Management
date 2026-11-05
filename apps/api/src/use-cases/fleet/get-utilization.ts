import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { addDaysToDateStr, manilaMidnightMs } from '../../utils/manila-date.js';
import { DAY_MS, computeOrderItemOverlap, attributeAddonRevenue, type AddonRow } from '../shared/rental-period-overlap.js';

/** Bikes still in the operating fleet. Active means out on a rental, not off the fleet. */
const CURRENT_STATUSES = new Set(['Available', 'Active', 'Under Maintenance', 'Pending ORCR']);
/** Left the rental fleet. Shown only in the sold & retired view, never in the main KPIs. */
const ARCHIVE_STATUSES = new Set(['Sold', 'Closed', 'Retired']);

export type UtilizationScope = 'current' | 'archive';

export interface FleetUtilizationDeps {
  storeId?: string;
}

export interface ModelUtilizationKpis {
  modelId: string;
  modelName: string;
  vehicleCount: number;
  utilisationPercent: number;
  averageRevenuePerVehicle: number;
  totalDowntimeDays: number;
}

export interface UtilizationKpis {
  utilisationPercent: number;
  averageRevenuePerVehicle: number;
  totalDowntimeDays: number;
  totalRentalDays: number;
  totalRevenue: number;
  vehicleCount: number;
  /** Breakdown of the KPIs above by vehicle model, so a small high-value fleet
   * (e.g. tuktuks) doesn't skew the blended numbers for a large low-value one
   * (e.g. scooters). Sorted by vehicleCount descending. */
  byModel: ModelUtilizationKpis[];
}

export interface VehicleUtilizationRow {
  vehicleId: string;
  vehicleName: string;
  storeId: string;
  modelId: string | null;
  modelName: string;
  rentalDays: number;
  revenue: number;
  downtimeDays: number;
  /** Days blocked for owner use (fleet_unavailability) within the active window. */
  ownerUseDays: number;
  /** Rental days divided by availableDays. */
  utilisationRate: number;
  /** Days this vehicle was actually part of the rentable fleet within [from, to]. */
  activeDays: number;
  /** activeDays minus maintenance downtime and owner use, with overlaps counted once. */
  availableDays: number;
}

type Interval = [number, number];

interface MaintenanceRow {
  asset_id: string;
  status: string | null;
  downtime_start: string | null;
  downtime_end: string | null;
  total_downtime_days: number | null;
}

/**
 * Downtime window for a maintenance record, or null when no downtime was recorded.
 * downtime_end is rarely saved, so the length falls back to total_downtime_days,
 * then to "still open" for unfinished jobs, then to a single day for finished ones.
 */
export function maintenanceInterval(row: MaintenanceRow, periodEndMs: number): Interval | null {
  if (!row.downtime_start) return null;
  const start = manilaMidnightMs(row.downtime_start.slice(0, 10));
  let end: number;
  if (row.downtime_end) end = Math.max(manilaMidnightMs(row.downtime_end.slice(0, 10)), start + DAY_MS);
  else if (row.total_downtime_days != null) end = start + Math.max(1, row.total_downtime_days) * DAY_MS;
  else if (row.status !== 'Completed') end = Math.max(periodEndMs, start + DAY_MS);
  else end = start + DAY_MS;
  return [start, end];
}

/** Milliseconds of [from, to) covered by the union of the intervals. */
function coveredMs(intervals: Interval[], from: number, to: number): number {
  const clipped = intervals
    .map(([s, e]): Interval => [Math.max(s, from), Math.min(e, to)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of clipped) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else {
      curEnd = Math.max(curEnd, e);
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

const roundDays = (days: number) => Math.round(days * 10) / 10;

export interface UtilizationResult {
  from: string;
  to: string;
  scope: UtilizationScope;
  /** True when each vehicle is measured from its own rentable start through `to`. */
  lifetime: boolean;
  /** Sold, Closed, and Retired vehicles in the store filter, ignoring the period window. */
  archiveCount: number;
  fleetKpis: UtilizationKpis;
  vehicles: VehicleUtilizationRow[];
  previousPeriod?: {
    from: string;
    to: string;
    fleetKpis: UtilizationKpis;
    vehicles: VehicleUtilizationRow[];
  };
  deltas?: {
    utilisationPercentDelta: number;
    averageRevenuePerVehicleDelta: number;
    totalDowntimeDaysDelta: number;
  };
}

export async function getFleetUtilization(
  from: string,
  to: string,
  storeId?: string,
  includePreviousPeriod = true,
  scope: UtilizationScope = 'current',
  lifetime = false,
): Promise<UtilizationResult> {
  const sb = getSupabaseClient();
  // Period boundaries anchored to Manila midnight (not UTC midnight — see
  // manilaMidnightMs doc comment). `to` is treated as an exclusive upper bound,
  // i.e. the period covers [from 00:00, to 00:00) Manila time.
  // Lifetime replaces `from` once the in-scope fleet is known (below).
  let periodFrom = from;
  let periodTo = to;

  // Fleet: vehicles that were part of the rentable fleet at some point during [from, to).
  // A vehicle can be partially in-scope (sold mid-period, or just became rentable mid-period);
  // that partial window is resolved per-vehicle below via rentable_start_date / date_sold.
  let fleetQuery = sb
    .from('fleet')
    .select('id, name, store_id, model_id, rentable_start_date, date_sold, status, stores(is_active)');
  if (storeId && storeId !== 'all') {
    fleetQuery = fleetQuery.eq('store_id', storeId);
  }
  const { data: fleetRows, error: fleetErr } = await fleetQuery;
  if (fleetErr) throw new Error(`Fleet query failed: ${fleetErr.message}`);

  type FleetRow = {
    id: string;
    name: string;
    store_id: string;
    model_id: string | null;
    rentable_start_date: string | null;
    date_sold: string | null;
    status: string;
    stores?: { is_active: boolean } | Array<{ is_active: boolean }> | null;
  };

  const storeIsActive = (r: FleetRow) => {
    const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;
    return store?.is_active !== false;
  };

  // A closed store is not part of the operating fleet, even if a bike was left
  // marked Available. Service vehicles stay out of both views.
  const inArchive = (r: FleetRow) => {
    const status = String(r.status ?? '');
    if (status === 'Service Vehicle') return false;
    if (!storeIsActive(r)) return true;
    return ARCHIVE_STATUSES.has(status);
  };
  const inCurrent = (r: FleetRow) => storeIsActive(r) && CURRENT_STATUSES.has(String(r.status ?? ''));

  const allFleetRows = (fleetRows ?? []) as unknown as FleetRow[];
  const archiveCount = allFleetRows.filter(inArchive).length;
  const scopedVehicles = allFleetRows.filter(scope === 'archive' ? inArchive : inCurrent);

  if (lifetime) {
    const starts = scopedVehicles
      .map((v) => v.rentable_start_date)
      .filter((d): d is string => !!d)
      .sort();
    if (starts.length > 0) periodFrom = starts[0];
  }

  const periodStartMs = manilaMidnightMs(periodFrom);
  const periodEndMs = manilaMidnightMs(periodTo);
  const periodDays = Math.max(1, Math.ceil((periodEndMs - periodStartMs) / DAY_MS));

  const rentableVehicles = scopedVehicles.filter((r) => {
    const dateSoldMs = r.date_sold ? manilaMidnightMs(r.date_sold) : null;
    const rentableStartMs = r.rentable_start_date ? manilaMidnightMs(r.rentable_start_date) : null;
    // Already sold before this period started — nothing of theirs falls in the window.
    if (dateSoldMs != null && dateSoldMs <= periodStartMs) return false;
    // Not rentable yet by the time this period ends.
    if (rentableStartMs != null && rentableStartMs >= periodEndMs) return false;
    return true;
  });
  const vehicleIds = rentableVehicles.map((v) => v.id);

  // Vehicle model names, for grouping KPIs by model (e.g. tuktuk vs. scooter)
  // so a small high-value fleet doesn't skew the blended per-vehicle numbers.
  const modelIds = [...new Set(rentableVehicles.map((v) => v.model_id).filter((id): id is string => !!id))];
  const modelNameById = new Map<string, string>();
  if (modelIds.length > 0) {
    const { data: modelRows, error: modelErr } = await sb
      .from('vehicle_models')
      .select('id, name')
      .in('id', modelIds);
    if (modelErr) throw new Error(`Vehicle models query failed: ${modelErr.message}`);
    for (const m of (modelRows ?? []) as Array<{ id: string; name: string }>) {
      modelNameById.set(m.id, m.name);
    }
  }

  // Order items overlapping the period: completed or active orders only.
  interface OrderItemRow {
    id: string;
    vehicle_id: string;
    order_id: string;
    rental_days_count: number;
    rental_rate: number;
    pickup_fee: number;
    dropoff_fee: number;
    discount: number;
    pickup_datetime: string | null;
    dropoff_datetime: string | null;
  }

  let orderItems: OrderItemRow[] = [];
  if (vehicleIds.length > 0) {
    // Pre-filter at the DB level to bookings that could possibly overlap the window
    // (generous day bounds); exact overlap/proration happens below in JS.
    const queryFloor = new Date(periodStartMs - DAY_MS).toISOString();
    const queryCeiling = new Date(periodEndMs + DAY_MS).toISOString();
    const { data, error: oiErr } = await sb
      .from('order_items')
      .select(
        'id, vehicle_id, order_id, rental_days_count, rental_rate, pickup_fee, dropoff_fee, discount, pickup_datetime, dropoff_datetime',
      )
      .in('vehicle_id', vehicleIds)
      .lte('pickup_datetime', queryCeiling)
      .gte('dropoff_datetime', queryFloor);
    if (oiErr) throw new Error(`Order items query failed: ${oiErr.message}`);
    orderItems = (data ?? []) as OrderItemRow[];
  }

  const orderIds = [...new Set(orderItems.map((r) => r.order_id))];
  const completedOrActiveOrderIds = new Set<string>();
  if (orderIds.length > 0) {
    console.info('[fleet-utilization] orders lookup', {
      orderItemCount: orderItems.length,
      orderIdCount: orderIds.length,
    });
    // Keep ID filters small to avoid oversized URLs and response headers.
    for (let i = 0; i < orderIds.length; i += 100) {
      const { data: ordersData, error: ordErr } = await sb
        .from('orders')
        .select('id, status')
        .in('id', orderIds.slice(i, i + 100))
        .in('status', ['active', 'completed']);
      if (ordErr) {
        console.error('[fleet-utilization] orders query failed', ordErr);
        throw new Error(`Orders query failed: ${ordErr.message}`);
      }
      for (const order of ordersData ?? []) completedOrActiveOrderIds.add(order.id);
    }
  }

  // Sum rental days/revenue per vehicle, prorated to the overlap between each
  // booking and [from, to). See computeOrderItemOverlap for the proration rules.
  const rentalByVehicle: Record<string, { rentalDays: number; revenue: number }> = {};
  // Tracks, per order, which in-scope items actually contributed days to this period —
  // used below to attribute order_addons (which aren't linked to a specific order_item
  // in this data model; see attributeAddonRevenue doc comment).
  const contributingItemsByOrder: Record<string, Array<{ vehicleId: string; overlapDays: number; totalBookingDays: number }>> = {};

  for (const oi of orderItems) {
    if (!oi.vehicle_id || !completedOrActiveOrderIds.has(oi.order_id)) continue;
    const overlap = computeOrderItemOverlap(oi, periodStartMs, periodEndMs);
    if (!overlap) continue;

    if (!rentalByVehicle[oi.vehicle_id]) rentalByVehicle[oi.vehicle_id] = { rentalDays: 0, revenue: 0 };
    rentalByVehicle[oi.vehicle_id].rentalDays += overlap.overlapDays;
    rentalByVehicle[oi.vehicle_id].revenue += overlap.revenue;

    (contributingItemsByOrder[oi.order_id] ??= []).push({
      vehicleId: oi.vehicle_id,
      overlapDays: overlap.overlapDays,
      totalBookingDays: overlap.totalBookingDays,
    });
  }

  // Add-on revenue (surfboards, helmets, delivery, etc.) — see attributeAddonRevenue.
  if (completedOrActiveOrderIds.size > 0) {
    const addonOrderIds = Object.keys(contributingItemsByOrder);
    let addonRows: AddonRow[] = [];
    for (let i = 0; i < addonOrderIds.length; i += 100) {
      const { data, error: addonErr } = await sb
        .from('order_addons')
        .select('order_id, addon_type, total_amount, added_at')
        .in('order_id', addonOrderIds.slice(i, i + 100));
      if (addonErr) throw new Error(`Order addons query failed: ${addonErr.message}`);
      addonRows = addonRows.concat((data ?? []) as AddonRow[]);
    }

    attributeAddonRevenue(addonRows, contributingItemsByOrder, periodStartMs, periodEndMs, (item, amount) => {
      rentalByVehicle[item.vehicleId].revenue += amount;
    });
  }

  // Maintenance downtime and owner-use blocks, as [start, end) intervals per vehicle.
  const maintenanceByVehicle: Record<string, Interval[]> = {};
  const ownerUseByVehicle: Record<string, Interval[]> = {};
  if (vehicleIds.length > 0) {
    const { data: maintenanceRows, error: mErr } = await sb
      .from('maintenance')
      .select('asset_id, status, downtime_start, downtime_end, total_downtime_days')
      .not('asset_id', 'is', null)
      .in('asset_id', vehicleIds);
    if (mErr) throw new Error(`Maintenance query failed: ${mErr.message}`);
    for (const m of maintenanceRows ?? []) {
      const row = m as MaintenanceRow;
      const interval = maintenanceInterval(row, periodEndMs);
      if (interval) (maintenanceByVehicle[row.asset_id] ??= []).push(interval);
    }

    const { data: unavailabilityRows, error: uErr } = await sb
      .from('fleet_unavailability')
      .select('vehicle_id, starts_at, ends_at')
      .is('cancelled_at', null)
      .in('vehicle_id', vehicleIds);
    if (uErr) throw new Error(`Owner-use query failed: ${uErr.message}`);
    for (const u of unavailabilityRows ?? []) {
      const row = u as { vehicle_id: string; starts_at: string; ends_at: string | null };
      const start = Date.parse(row.starts_at);
      const end = row.ends_at ? Date.parse(row.ends_at) : periodEndMs;
      if (end > start) (ownerUseByVehicle[row.vehicle_id] ??= []).push([start, end]);
    }
  }

  const vehicles: VehicleUtilizationRow[] = rentableVehicles.map((v) => {
    const rental = rentalByVehicle[v.id] ?? { rentalDays: 0, revenue: 0 };
    const dateSoldMs = v.date_sold ? manilaMidnightMs(v.date_sold) : null;
    const rentableStartMs = v.rentable_start_date ? manilaMidnightMs(v.rentable_start_date) : null;
    const windowStart = Math.max(periodStartMs, rentableStartMs ?? periodStartMs);
    const windowEnd = Math.min(periodEndMs, dateSoldMs ?? periodEndMs);
    const activeDays = windowEnd > windowStart ? Math.max(1, Math.ceil((windowEnd - windowStart) / DAY_MS)) : 0;
    const maintenance = maintenanceByVehicle[v.id] ?? [];
    const ownerUse = ownerUseByVehicle[v.id] ?? [];
    const downtimeDays = Math.ceil(coveredMs(maintenance, windowStart, windowEnd) / DAY_MS);
    const ownerUseDays = roundDays(coveredMs(ownerUse, windowStart, windowEnd) / DAY_MS);
    const blockedDays = coveredMs([...maintenance, ...ownerUse], windowStart, windowEnd) / DAY_MS;
    const availableDays = roundDays(Math.max(0, activeDays - blockedDays));
    const utilisationRate = availableDays > 0 ? Math.min(100, (rental.rentalDays / availableDays) * 100) : 0;
    return {
      vehicleId: v.id,
      vehicleName: v.name,
      storeId: v.store_id,
      modelId: v.model_id,
      modelName: (v.model_id && modelNameById.get(v.model_id)) || 'Unassigned',
      rentalDays: rental.rentalDays,
      revenue: Math.round(rental.revenue * 100) / 100,
      downtimeDays,
      ownerUseDays,
      utilisationRate: Math.round(utilisationRate * 10) / 10,
      activeDays,
      availableDays,
    };
  });

  const totalRentalDays = vehicles.reduce((s, x) => s + x.rentalDays, 0);
  const totalRevenue = vehicles.reduce((s, x) => s + x.revenue, 0);
  const totalDowntimeDays = vehicles.reduce((s, x) => s + x.downtimeDays, 0);
  const totalAvailableDays = vehicles.reduce((s, x) => s + x.availableDays, 0);
  const n = vehicles.length || 1;
  const utilisationPercent = totalAvailableDays > 0
    ? Math.min(100, (totalRentalDays / totalAvailableDays) * 100)
    : 0;
  const averageRevenuePerVehicle = totalRevenue / n;

  // Group the same KPIs by vehicle model so a small high-value fleet (e.g. tuktuks)
  // doesn't get blended into — and skewed by — a large low-value one (e.g. scooters).
  const modelGroups = new Map<
    string,
    { modelId: string; modelName: string; vehicleCount: number; totalRevenue: number; totalDowntimeDays: number; totalRentalDays: number; totalAvailableDays: number }
  >();
  for (const v of vehicles) {
    const key = v.modelId ?? 'unassigned';
    let group = modelGroups.get(key);
    if (!group) {
      group = { modelId: key, modelName: v.modelName, vehicleCount: 0, totalRevenue: 0, totalDowntimeDays: 0, totalRentalDays: 0, totalAvailableDays: 0 };
      modelGroups.set(key, group);
    }
    group.vehicleCount += 1;
    group.totalRevenue += v.revenue;
    group.totalDowntimeDays += v.downtimeDays;
    group.totalRentalDays += v.rentalDays;
    group.totalAvailableDays += v.availableDays;
  }
  const byModel: ModelUtilizationKpis[] = [...modelGroups.values()]
    .map((g) => ({
      modelId: g.modelId,
      modelName: g.modelName,
      vehicleCount: g.vehicleCount,
      utilisationPercent: g.totalAvailableDays > 0 ? Math.round(Math.min(100, (g.totalRentalDays / g.totalAvailableDays) * 100) * 10) / 10 : 0,
      averageRevenuePerVehicle: Math.round((g.totalRevenue / g.vehicleCount) * 100) / 100,
      totalDowntimeDays: g.totalDowntimeDays,
    }))
    .sort((a, b) => b.vehicleCount - a.vehicleCount);

  const fleetKpis: UtilizationKpis = {
    utilisationPercent: Math.round(utilisationPercent * 10) / 10,
    averageRevenuePerVehicle: Math.round(averageRevenuePerVehicle * 100) / 100,
    totalDowntimeDays,
    totalRentalDays,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    vehicleCount: vehicles.length,
    byModel,
  };

  const result: UtilizationResult = {
    from: periodFrom,
    to: periodTo,
    scope,
    lifetime,
    archiveCount,
    fleetKpis,
    vehicles,
  };

  if (includePreviousPeriod && !lifetime && periodFrom && periodTo) {
    const prevTo = periodFrom;
    const prevFrom = addDaysToDateStr(periodFrom, -periodDays);
    const prev = await getFleetUtilization(prevFrom, prevTo, storeId, false, scope, false);
    result.previousPeriod = {
      from: prev.from,
      to: prev.to,
      fleetKpis: prev.fleetKpis,
      vehicles: prev.vehicles,
    };
    result.deltas = {
      utilisationPercentDelta: Math.round((result.fleetKpis.utilisationPercent - prev.fleetKpis.utilisationPercent) * 10) / 10,
      averageRevenuePerVehicleDelta: Math.round((result.fleetKpis.averageRevenuePerVehicle - prev.fleetKpis.averageRevenuePerVehicle) * 100) / 100,
      totalDowntimeDaysDelta: result.fleetKpis.totalDowntimeDays - prev.fleetKpis.totalDowntimeDays,
    };
  }

  return result;
}
