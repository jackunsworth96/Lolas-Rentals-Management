import { NonRentableVehicleError } from '@lolas/domain';
import { supabase } from '../adapters/supabase/client.js';
import { ownerUseBlocksAssignment } from './owner-use-window.js';

export async function assertAssignmentsNotOnOwnerUse(
  assignments: Array<{
    vehicleId: string;
    vehicleName?: string;
    pickupDatetime: string;
    dropoffDatetime: string;
  }>,
): Promise<void> {
  if (assignments.length === 0) return;
  const vehicleIds = [...new Set(assignments.map((assignment) => assignment.vehicleId))];
  const { data, error } = await supabase
    .from('fleet_unavailability')
    .select('vehicle_id, starts_at, ends_at')
    .in('vehicle_id', vehicleIds)
    .eq('type', 'owner_use')
    .is('cancelled_at', null);
  if (error) throw new Error(`Owner use lookup failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    vehicle_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
  }>;
  for (const assignment of assignments) {
    if (!ownerUseBlocksAssignment(rows, assignment)) continue;
    throw new NonRentableVehicleError(
      assignment.vehicleName || assignment.vehicleId,
      'reserved for owner use during this booking',
    );
  }
}
