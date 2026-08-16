export type TransportService = 'delivery' | 'collection' | 'both' | null;

export interface TransportLocation {
  id: string | number;
  name?: string | null;
  location_type?: string | null;
  delivery_cost?: number | string | null;
  collection_cost?: number | string | null;
}

export interface TransportLeg {
  pickup_location_id?: string | number | null;
  dropoff_location_id?: string | number | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  pickup_fee?: number | string | null;
  dropoff_fee?: number | string | null;
}

function normalizedName(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function isStoreLocation(location: TransportLocation): boolean {
  if (location.location_type) return location.location_type === 'store';
  return Number(location.delivery_cost ?? 0) === 0 && Number(location.collection_cost ?? 0) === 0;
}

/**
 * Derive the operational transport requirement from locations, not charged
 * fees. Partner benefits can waive a fee without removing the delivery job.
 */
export function deriveTransportService(
  legs: TransportLeg[],
  locations: TransportLocation[],
): TransportService {
  const locationsById = new Map(locations.map((location) => [String(location.id), location]));
  const locationsByName = new Map(
    locations
      .filter((location) => normalizedName(location.name))
      .map((location) => [normalizedName(location.name), location]),
  );

  const requiresTransport = (
    locationId: string | number | null | undefined,
    locationName: string | null | undefined,
    fee: number | string | null | undefined,
  ): boolean => {
    const id = locationId === null || locationId === undefined ? '' : String(locationId).trim();
    const location = (id ? locationsById.get(id) : undefined)
      ?? locationsByName.get(normalizedName(locationName));
    if (location) return !isStoreLocation(location);
    return Number(fee ?? 0) > 0;
  };

  const hasDelivery = legs.some((leg) => requiresTransport(
    leg.pickup_location_id,
    leg.pickup_location,
    leg.pickup_fee,
  ));
  const hasCollection = legs.some((leg) => requiresTransport(
    leg.dropoff_location_id,
    leg.dropoff_location,
    leg.dropoff_fee,
  ));

  if (hasDelivery && hasCollection) return 'both';
  if (hasDelivery) return 'delivery';
  if (hasCollection) return 'collection';
  return null;
}
