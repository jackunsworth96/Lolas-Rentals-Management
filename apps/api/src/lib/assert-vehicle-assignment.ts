import { NonRentableVehicleError } from '@lolas/domain';
import { supabase } from '../adapters/supabase/client.js';
import { ownerUseBlocksAssignment } from './owner-use-window.js';

export async function assertAssignmentsAvailable(
  assignments: Array<{
    vehicleId: string;
    vehicleName?: string;
    pickupDatetime: string;
    dropoffDatetime: string;
  }>,
  options: { excludeRawOrderId?: string; excludeOrderId?: string } = {},
): Promise<void> {
  if (assignments.length === 0) return;
  const buffer = 30 * 60 * 1000;
  const overlaps = (a: typeof assignments[number], b: typeof assignments[number]) =>
    a.vehicleId === b.vehicleId
      && new Date(a.pickupDatetime).getTime() < new Date(b.dropoffDatetime).getTime() + buffer
      && new Date(a.dropoffDatetime).getTime() + buffer > new Date(b.pickupDatetime).getTime();
  for (const [index, assignment] of assignments.entries()) {
    const pickup = new Date(assignment.pickupDatetime).getTime();
    const dropoff = new Date(assignment.dropoffDatetime).getTime();
    if (!Number.isFinite(pickup) || !Number.isFinite(dropoff) || dropoff <= pickup) {
      throw Object.assign(new Error('Dropoff must be after a valid pickup datetime'), { statusCode: 422 });
    }
    if (assignments.slice(0, index).some((other) => overlaps(assignment, other))) {
      throw new NonRentableVehicleError(assignment.vehicleName || assignment.vehicleId, 'assigned twice for overlapping dates');
    }
  }
  const vehicleIds = [...new Set(assignments.map((assignment) => assignment.vehicleId))];
  const pickupBuffered = new Date(Math.min(...assignments.map((a) => new Date(a.pickupDatetime).getTime())) - buffer).toISOString();
  const dropoffBuffered = new Date(Math.max(...assignments.map((a) => new Date(a.dropoffDatetime).getTime())) + buffer).toISOString();
  let itemsQuery = supabase.from('order_items')
    .select('vehicle_id, pickup_datetime, dropoff_datetime, orders!inner(status)')
    .in('vehicle_id', vehicleIds).not('orders.status', 'in', '(cancelled,completed)')
    .lt('pickup_datetime', dropoffBuffered).gt('dropoff_datetime', pickupBuffered);
  if (options.excludeOrderId) itemsQuery = itemsQuery.neq('order_id', options.excludeOrderId);
  const { data: items, error: itemsError } = await itemsQuery;
  if (itemsError) throw new Error(`Rental conflict lookup failed: ${itemsError.message}`);
  let rawQuery = supabase.from('orders_raw')
    .select('vehicle_id, pickup_datetime, dropoff_datetime')
    .in('vehicle_id', vehicleIds).eq('status', 'unprocessed')
    .lt('pickup_datetime', dropoffBuffered).gt('dropoff_datetime', pickupBuffered);
  if (options.excludeRawOrderId) rawQuery = rawQuery.neq('id', options.excludeRawOrderId);
  const { data: raw, error: rawError } = await rawQuery;
  if (rawError) throw new Error(`Reservation conflict lookup failed: ${rawError.message}`);
  for (const assignment of assignments) {
    if (([...(items ?? []), ...(raw ?? [])] as Array<{ vehicle_id: string; pickup_datetime: string; dropoff_datetime: string }>).some((row) => overlaps(assignment, {
      vehicleId: row.vehicle_id, pickupDatetime: row.pickup_datetime, dropoffDatetime: row.dropoff_datetime,
    }))) {
      throw new NonRentableVehicleError(assignment.vehicleName || assignment.vehicleId, 'already booked for the selected dates');
    }
  }
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
