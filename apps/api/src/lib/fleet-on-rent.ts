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
