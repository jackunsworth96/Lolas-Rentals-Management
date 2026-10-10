import { randomUUID } from 'node:crypto';
import { maintenanceOdometerSyncsFleet, normalizeMileage } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

export async function recordMileageEvent(input: {
  vehicleId: string;
  storeId: string;
  previousMileage: number;
  newMileage: number;
  source: 'manual' | 'inspection' | 'maintenance';
  reason: string | null;
  employeeId: string | null;
  inspectionId?: string | null;
  maintenanceId?: string | null;
}): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('fleet_mileage_events').insert({
    id: randomUUID(),
    vehicle_id: input.vehicleId,
    store_id: input.storeId,
    previous_mileage: input.previousMileage,
    new_mileage: input.newMileage,
    source: input.source,
    reason: input.reason,
    employee_id: input.employeeId,
    inspection_id: input.inspectionId ?? null,
    maintenance_id: input.maintenanceId ?? null,
  });
  if (error) throw new Error(`Failed to record mileage change: ${error.message}`);
}

/** Write a maintenance odometer onto the vehicle when that reading is new or changed. */
export async function syncFleetMileageFromMaintenance(input: {
  vehicleId: string;
  storeId: string;
  previousRecordOdometer: number | null;
  nextOdometer: number | null;
  maintenanceId: string;
  employeeId: string | null;
}): Promise<void> {
  if (!maintenanceOdometerSyncsFleet(input.previousRecordOdometer, input.nextOdometer)) return;
  const next = normalizeMileage(input.nextOdometer as number);
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('fleet')
    .select('current_mileage, store_id')
    .eq('id', input.vehicleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;

  const previous = Number((data as { current_mileage?: number | string }).current_mileage ?? 0);
  if (normalizeMileage(previous) === next) return;

  const storeId = (data as { store_id?: string }).store_id ?? input.storeId;
  const { error: updateErr } = await sb
    .from('fleet')
    .update({ current_mileage: next, updated_at: new Date().toISOString() })
    .eq('id', input.vehicleId);
  if (updateErr) throw new Error(updateErr.message);

  try {
    await recordMileageEvent({
      vehicleId: input.vehicleId,
      storeId,
      previousMileage: normalizeMileage(previous),
      newMileage: next,
      source: 'maintenance',
      reason: null,
      employeeId: input.employeeId,
      maintenanceId: input.maintenanceId,
    });
  } catch (eventErr) {
    await sb
      .from('fleet')
      .update({ current_mileage: previous, updated_at: new Date().toISOString() })
      .eq('id', input.vehicleId);
    throw eventErr;
  }
}
