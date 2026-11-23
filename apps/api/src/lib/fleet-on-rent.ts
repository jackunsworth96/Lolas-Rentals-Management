/** Fleet status id/name used while a vehicle is out on a rental. Not is_rentable. */
const ON_RENT_STATUS = new Set(['active', 'Active']);

/**
 * Status ids and names that belong on the dashboard availability board: units
 * that can be handed to a customer, plus units that are out and will come back.
 * Maintenance, sold, and service vehicles stay out.
 */
export function operatingFleetStatusKeys(
  fleetStatuses: Array<{ id: string; name: string; is_rentable: boolean }>,
): Set<string> {
  const keys = new Set<string>(ON_RENT_STATUS);
  for (const s of fleetStatuses) {
    if (s.is_rentable || ON_RENT_STATUS.has(s.id) || ON_RENT_STATUS.has(s.name)) {
      keys.add(s.id);
      keys.add(s.name);
    }
  }
  return keys;
}

/**
 * Share of the working fleet that is out on rent right now. A vehicle on rent
 * has a non-rentable fleet status, so the fleet is the rentable vehicles plus
 * the ones currently out.
 */
export function fleetOnRentPercent(
  storeFleet: Array<{ id: string; isRentable: boolean }>,
  onRentVehicleIds: Set<string>,
): number {
  let fleetSize = 0;
  let onRent = 0;
  for (const v of storeFleet) {
    const out = onRentVehicleIds.has(v.id);
    if (out) onRent += 1;
    if (out || v.isRentable) fleetSize += 1;
  }
  return fleetSize > 0 ? Math.round((onRent / fleetSize) * 100) : 0;
}
