import { supabase } from '../adapters/supabase/client.js';

const PROTECTED_STATUSES = ['Sold', 'Closed', 'Service Vehicle'];

export async function syncFleetStatuses(): Promise<void> {
  console.log('[fleet-status-sync] Syncing fleet statuses from active orders and maintenance...');

  const { data: activeItems } = await supabase
    .from('order_items')
    .select('vehicle_id, orders!inner(status)')
    .eq('orders.status', 'active');

  const activeVehicleIds = new Set(
    (activeItems ?? []).map((item: any) => item.vehicle_id).filter(Boolean),
  );

  const { data: maintenanceRecords } = await supabase
    .from('maintenance')
    .select('asset_id')
    .eq('status', 'In Progress');

  const maintenanceVehicleIds = new Set(
    (maintenanceRecords ?? []).map((r: any) => r.asset_id).filter(Boolean),
  );

  const { data: vehicles } = await supabase
    .from('fleet')
    .select('id, status');

  if (!vehicles) { console.log('[fleet-status-sync] No vehicles found'); return; }

  let updated = 0;

  for (const vehicle of vehicles) {
    if (PROTECTED_STATUSES.includes(vehicle.status)) continue;

    let expectedStatus = 'Available';
    if (activeVehicleIds.has(vehicle.id)) expectedStatus = 'Active';
    else if (maintenanceVehicleIds.has(vehicle.id)) expectedStatus = 'Under Maintenance';

    if (vehicle.status !== expectedStatus) {
      await supabase.from('fleet').update({ status: expectedStatus }).eq('id', vehicle.id);
      updated++;
    }
  }

  console.log(`[fleet-status-sync] Updated ${updated} vehicles`);
}

if (process.env.RUN_FLEET_STATUS_SYNC === 'true') {
  syncFleetStatuses().catch(console.error);
}
