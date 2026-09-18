export interface FleetStatusLike {
  id: string;
  name: string;
  isRentable?: boolean;
  is_rentable?: boolean;
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase();
}

export function isFleetStatusRentable(
  vehicleStatus: string | null | undefined,
  configuredStatuses: FleetStatusLike[],
): boolean {
  if (!vehicleStatus) return false;
  const normalized = normalizeStatus(vehicleStatus);
  return configuredStatuses.some((status) => {
    const rentable = status.isRentable ?? status.is_rentable ?? false;
    return rentable && (
      normalizeStatus(status.id) === normalized ||
      normalizeStatus(status.name) === normalized
    );
  });
}
