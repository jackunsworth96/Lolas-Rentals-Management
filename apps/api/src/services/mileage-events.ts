import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../adapters/supabase/client.js';

export async function recordMileageEvent(input: {
  vehicleId: string;
  storeId: string;
  previousMileage: number;
  newMileage: number;
  source: 'manual' | 'inspection';
  reason: string | null;
  employeeId: string | null;
  inspectionId?: string | null;
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
  });
  if (error) throw new Error(`Failed to record mileage change: ${error.message}`);
}
