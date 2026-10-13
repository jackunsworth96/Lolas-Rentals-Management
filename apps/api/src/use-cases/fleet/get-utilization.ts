import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { addDaysToDateStr, manilaMidnightMs } from '../../utils/manila-date.js';
import { DAY_MS, computeOrderItemOverlap, attributeAddonRevenue, type AddonRow } from '../shared/rental-period-overlap.js';

const NON_RENTABLE = ['Sold', 'Closed'];

export interface FleetUtilizationDeps {
  storeId?: string;
}

export interface UtilizationKpis {
  utilisationPercent: number;
  averageRevenuePerVehicle: number;
  totalDowntimeDays: number;
  totalRentalDays: number;
  totalRevenue: number;
  vehicleCount: number;
}

export interface VehicleUtilizationRow {
  vehicleId: string;
  vehicleName: string;
  storeId: string;
  rentalDays: number;
  revenue: number;
  downtimeDays: number;
  utilisationRate: number;
  /** Days this vehicle was actually part of the rentable fleet within [from, to]. */
  activeDays: number;
}

export interface UtilizationResult {
  from: string;
  to: string;
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
): Promise<UtilizationResult> {
  const sb = getSupabaseClient();
  // Period boundaries anchored to Manila midnight (not UTC midnight — see
  // manilaMidnightMs doc comment). `to` is treated as an exclusive upper bound,
  // i.e. the period covers [from 00:00, to 00:00) Manila time.
  const periodStartMs = manilaMidnightMs(from);
  const periodEndMs = manilaMidnightMs(to);
  const periodDays = Math.max(1, Math.ceil((periodEndMs - periodStartMs) / DAY_MS));

  // Fleet: vehicles that were part of the rentable fleet at some point during [from, to).
  // A vehicle can be partially in-scope (sold mid-period, or just became rentable mid-period);
  // that partial window is resolved per-vehicle below via rentable_start_date / date_sold.
  let fleetQuery = sb
    .from('fleet')
    .select('id, name, store_id, rentable_start_date, date_sold, status');
  if (storeId && storeId !== 'all') {
    fleetQuery = fleetQuery.eq('store_id', storeId);
  }
  const { data: fleetRows, error: fleetErr } = await fleetQuery;
  if (fleetErr) throw new Error(`Fleet query failed: ${fleetErr.message}`);

  type FleetRow = {
    id: string;
    name: string;
    store_id: string;
    rentable_start_date: string | null;
    date_sold: string | null;
    status: string;
  };

  const rentableVehicles = ((fleetRows ?? []) as FleetRow[]).filter((r) => {
    const status = String(r.status ?? '');
    const dateSoldMs = r.date_sold ? manilaMidnightMs(r.date_sold) : null;
    const rentableStartMs = r.rentable_start_date ? manilaMidnightMs(r.rentable_start_date) : null;
    // Fully sold/closed before this period started — not part of this period's fleet.
    if (dateSoldMs != null && dateSoldMs <= periodStartMs) return false;
    // Not rentable yet by the time this period ends.
    if (rentableStartMs != null && rentableStartMs >= periodEndMs) return false;
    // Marked Sold/Closed with no recorded date_sold to anchor a partial window —
    // conservatively exclude rather than guess when it left the fleet.
    if (NON_RENTABLE.includes(status) && dateSoldMs == null) return false;
    return true;
  });
  const vehicleIds = rentableVehicles.map((v) => v.id);

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

  // Maintenance downtime in period (by asset_id), scoped to the vehicles in scope.
  const downtimeByVehicle: Record<string, number> = {};
  if (vehicleIds.length > 0) {
    const { data: maintenanceRows, error: mErr } = await sb
      .from('maintenance')
      .select('asset_id, downtime_start, downtime_end, total_downtime_days')
      .not('asset_id', 'is', null)
      .in('asset_id', vehicleIds);
    if (mErr) throw new Error(`Maintenance query failed: ${mErr.message}`);

    for (const m of maintenanceRows ?? []) {
      const row = m as { asset_id: string; downtime_start: string | null; downtime_end: string | null; total_downtime_days: number | null };
      // No start date recorded: conservatively assume downtime began at the period start.
      // No end date recorded: maintenance is still ongoing, so it runs through the period end.
      const start = row.downtime_start ? new Date(row.downtime_start).getTime() : periodStartMs;
      const end = row.downtime_end ? new Date(row.downtime_end).getTime() : periodEndMs;
      const overlapStart = Math.max(start, periodStartMs);
      const overlapEnd = Math.min(end, periodEndMs);
      let days = 0;
      if (overlapEnd > overlapStart) {
        days = row.total_downtime_days != null
          ? Math.min(row.total_downtime_days, Math.ceil((overlapEnd - overlapStart) / DAY_MS))
          : Math.ceil((overlapEnd - overlapStart) / DAY_MS);
      }
      if (days > 0) {
        downtimeByVehicle[row.asset_id] = (downtimeByVehicle[row.asset_id] ?? 0) + days;
      }
    }
  }

  const vehicles: VehicleUtilizationRow[] = rentableVehicles.map((v) => {
    const rental = rentalByVehicle[v.id] ?? { rentalDays: 0, revenue: 0 };
    const downtime = downtimeByVehicle[v.id] ?? 0;
    const dateSoldMs = v.date_sold ? manilaMidnightMs(v.date_sold) : null;
    const rentableStartMs = v.rentable_start_date ? manilaMidnightMs(v.rentable_start_date) : null;
    const windowStart = Math.max(periodStartMs, rentableStartMs ?? periodStartMs);
    const windowEnd = Math.min(periodEndMs, dateSoldMs ?? periodEndMs);
    const activeDays = windowEnd > windowStart ? Math.max(1, Math.ceil((windowEnd - windowStart) / DAY_MS)) : 0;
    const utilisationRate = activeDays > 0 ? Math.min(100, (rental.rentalDays / activeDays) * 100) : 0;
    return {
      vehicleId: v.id,
      vehicleName: v.name,
      storeId: v.store_id,
      rentalDays: rental.rentalDays,
      revenue: Math.round(rental.revenue * 100) / 100,
      downtimeDays: downtime,
      utilisationRate: Math.round(utilisationRate * 10) / 10,
      activeDays,
    };
  });

  const totalRentalDays = vehicles.reduce((s, x) => s + x.rentalDays, 0);
  const totalRevenue = vehicles.reduce((s, x) => s + x.revenue, 0);
  const totalDowntimeDays = vehicles.reduce((s, x) => s + x.downtimeDays, 0);
  const totalActiveDays = vehicles.reduce((s, x) => s + x.activeDays, 0);
  const n = vehicles.length || 1;
  const utilisationPercent = totalActiveDays > 0
    ? Math.min(100, (totalRentalDays / totalActiveDays) * 100)
    : 0;
  const averageRevenuePerVehicle = totalRevenue / n;

  const fleetKpis: UtilizationKpis = {
    utilisationPercent: Math.round(utilisationPercent * 10) / 10,
    averageRevenuePerVehicle: Math.round(averageRevenuePerVehicle * 100) / 100,
    totalDowntimeDays,
    totalRentalDays,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    vehicleCount: vehicles.length,
  };

  const result: UtilizationResult = { from, to, fleetKpis, vehicles };

  if (includePreviousPeriod && from && to) {
    const prevTo = addDaysToDateStr(from, -1);
    const prevFrom = addDaysToDateStr(prevTo, -periodDays + 1);
    const prev = await getFleetUtilization(prevFrom, prevTo, storeId, false);
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
