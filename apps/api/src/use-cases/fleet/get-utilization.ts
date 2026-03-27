import { getSupabaseClient } from '../../adapters/supabase/client.js';

const RENTABLE_STATUSES = ['Available', 'Active', 'Under Maintenance', 'Service Vehicle', 'Pending ORCR'];
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getFleetUtilization(
  from: string,
  to: string,
  storeId?: string,
  includePreviousPeriod = true,
): Promise<UtilizationResult> {
  const sb = getSupabaseClient();
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const periodDays = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)));

  // Fleet: rentable vehicles in period (exist in fleet, not Sold/Closed, optionally filter by store)
  let fleetQuery = sb
    .from('fleet')
    .select('id, name, store_id, rentable_start_date, date_sold, status');
  if (storeId && storeId !== 'all') {
    fleetQuery = fleetQuery.eq('store_id', storeId);
  }
  const { data: fleetRows, error: fleetErr } = await fleetQuery;
  if (fleetErr) throw new Error(`Fleet query failed: ${fleetErr.message}`);

  const rentableVehicles = (fleetRows ?? []).filter(
    (r: Record<string, unknown>) => !NON_RENTABLE.includes(String(r.status ?? '')),
  ) as Array<{ id: string; name: string; store_id: string; rentable_start_date: string | null; date_sold: string | null; status: string }>;
  const vehicleIds = rentableVehicles.map((v) => v.id);
  const vehicleMap = new Map(rentableVehicles.map((v) => [v.id, v]));

  // Order items in period: completed or active orders
  interface OrderItemRow {
    id: string;
    vehicle_id: string;
    order_id: string;
    rental_days_count: number;
    rental_rate: number;
    pickup_fee: number;
    dropoff_fee: number;
    discount: number;
  }

  let orderItems: OrderItemRow[] = [];
  if (vehicleIds.length > 0) {
    const { data, error: oiErr } = await sb
      .from('order_items')
      .select('id, vehicle_id, order_id, rental_days_count, rental_rate, pickup_fee, dropoff_fee, discount')
      .in('vehicle_id', vehicleIds);
    if (oiErr) throw new Error(`Order items query failed: ${oiErr.message}`);
    orderItems = (data ?? []) as OrderItemRow[];
  }

  const orderIds = [...new Set(orderItems.map((r) => r.order_id))];
  let completedOrActiveOrderIds = new Set<string>();
  if (orderIds.length > 0) {
    const { data: ordersData, error: ordErr } = await sb
      .from('orders')
      .select('id, status')
      .in('id', orderIds)
      .in('status', ['active', 'completed']);
    if (ordErr) throw new Error(`Orders query failed: ${ordErr.message}`);
    completedOrActiveOrderIds = new Set((ordersData ?? []).map((o: { id: string }) => o.id));
  }

  const rentalByVehicle: Record<string, { rentalDays: number; revenue: number }> = {};
  for (const oi of orderItems) {
    if (!oi.vehicle_id || !completedOrActiveOrderIds.has(oi.order_id)) continue;
    const days = Number(oi.rental_days_count ?? 0);
    const revenue =
      Number(oi.rental_rate ?? 0) * days +
      Number(oi.pickup_fee ?? 0) +
      Number(oi.dropoff_fee ?? 0) -
      Number(oi.discount ?? 0);
    if (!rentalByVehicle[oi.vehicle_id]) rentalByVehicle[oi.vehicle_id] = { rentalDays: 0, revenue: 0 };
    rentalByVehicle[oi.vehicle_id].rentalDays += days;
    rentalByVehicle[oi.vehicle_id].revenue += revenue;
  }

  // Maintenance downtime in period (by asset_id)
  const { data: maintenanceRows, error: mErr } = await sb
    .from('maintenance')
    .select('asset_id, downtime_start, downtime_end, total_downtime_days')
    .not('asset_id', 'is', null);
  if (mErr) throw new Error(`Maintenance query failed: ${mErr.message}`);

  const downtimeByVehicle: Record<string, number> = {};
  for (const m of maintenanceRows ?? []) {
    const row = m as { asset_id: string; downtime_start: string | null; downtime_end: string | null; total_downtime_days: number | null };
    const start = row.downtime_start ? new Date(row.downtime_start).getTime() : toDate.getTime();
    const end = row.downtime_end ? new Date(row.downtime_end).getTime() : fromDate.getTime();
    const periodStart = fromDate.getTime();
    const periodEnd = toDate.getTime();
    const overlapStart = Math.max(start, periodStart);
    const overlapEnd = Math.min(end, periodEnd);
    let days = 0;
    if (overlapEnd > overlapStart) {
      days = row.total_downtime_days != null
        ? Math.min(row.total_downtime_days, Math.ceil((overlapEnd - overlapStart) / (24 * 60 * 60 * 1000)))
        : Math.ceil((overlapEnd - overlapStart) / (24 * 60 * 60 * 1000));
    }
    if (days > 0) {
      downtimeByVehicle[row.asset_id] = (downtimeByVehicle[row.asset_id] ?? 0) + days;
    }
  }

  const vehicles: VehicleUtilizationRow[] = rentableVehicles.map((v) => {
    const rental = rentalByVehicle[v.id] ?? { rentalDays: 0, revenue: 0 };
    const downtime = downtimeByVehicle[v.id] ?? 0;
    const utilisationRate = periodDays > 0 ? Math.min(100, (rental.rentalDays / periodDays) * 100) : 0;
    return {
      vehicleId: v.id,
      vehicleName: v.name,
      storeId: v.store_id,
      rentalDays: rental.rentalDays,
      revenue: rental.revenue,
      downtimeDays: downtime,
      utilisationRate: Math.round(utilisationRate * 10) / 10,
    };
  });

  const totalRentalDays = vehicles.reduce((s, x) => s + x.rentalDays, 0);
  const totalRevenue = vehicles.reduce((s, x) => s + x.revenue, 0);
  const totalDowntimeDays = vehicles.reduce((s, x) => s + x.downtimeDays, 0);
  const n = vehicles.length || 1;
  const utilisationPercent = periodDays > 0 && n > 0
    ? Math.min(100, (totalRentalDays / (periodDays * n)) * 100)
    : 0;
  const averageRevenuePerVehicle = totalRevenue / n;

  const fleetKpis: UtilizationKpis = {
    utilisationPercent: Math.round(utilisationPercent * 10) / 10,
    averageRevenuePerVehicle: Math.round(averageRevenuePerVehicle * 100) / 100,
    totalDowntimeDays,
    totalRentalDays,
    totalRevenue,
    vehicleCount: vehicles.length,
  };

  const result: UtilizationResult = { from, to, fleetKpis, vehicles };

  if (includePreviousPeriod && from && to) {
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -periodDays + 1);
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
