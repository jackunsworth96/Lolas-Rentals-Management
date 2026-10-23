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

export interface DeriveTransportServiceOptions {
  /**
   * Partner bookings may save the establishment name instead of a configured
   * pricing-zone name. A named, non-store destination still requires transport
   * even when the partner benefit has waived its fee.
   */
  unknownNamedLocationsRequireTransport?: boolean;
}

function normalizedName(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function isStoreLocation(location: TransportLocation): boolean {
  if (location.location_type) return location.location_type === 'store';
  return Number(location.delivery_cost ?? 0) === 0 && Number(location.collection_cost ?? 0) === 0;
}

/** A location index built once and reused across many leg lookups. */
export interface LocationIndex {
  byId: Map<string, TransportLocation>;
  byName: Map<string, TransportLocation>;
}

export function buildLocationIndex(locations: TransportLocation[]): LocationIndex {
  return {
    byId: new Map(locations.map((location) => [String(location.id), location])),
    byName: new Map(
      locations
        .filter((location) => normalizedName(location.name))
        .map((location) => [normalizedName(location.name), location]),
    ),
  };
}

/**
 * Determines whether a single pickup/dropoff leg is operationally off-site
 * (someone physically has to deliver/collect the vehicle) — derived from the
 * *location*, not the charged fee. A partner benefit can waive the fee
 * without removing the physical job, so a naive `fee > 0` check (as the
 * delivery-reminder system historically used) silently drops every free
 * partner delivery/collection from detection.
 *
 * Unresolved named locations are only treated as off-site when
 * `unknownNamedLocationsRequireTransport` is set, since a truly unknown name
 * with no fee could just be a data-entry quirk on an in-store handover.
 */
export function isLegOffsite(
  locationId: string | number | null | undefined,
  locationName: string | null | undefined,
  fee: number | string | null | undefined,
  index: LocationIndex,
  options: DeriveTransportServiceOptions = {},
): boolean {
  const id = locationId === null || locationId === undefined ? '' : String(locationId).trim();
  const location = (id ? index.byId.get(id) : undefined) ?? index.byName.get(normalizedName(locationName));
  if (location) return !isStoreLocation(location);
  if (options.unknownNamedLocationsRequireTransport && normalizedName(locationName)) return true;
  return Number(fee ?? 0) > 0;
}

/**
 * Derive the operational transport requirement from locations, not charged
 * fees. Partner benefits can waive a fee without removing the delivery job.
 */
export function deriveTransportService(
  legs: TransportLeg[],
  locations: TransportLocation[],
  options: DeriveTransportServiceOptions = {},
): TransportService {
  const index = buildLocationIndex(locations);

  const hasDelivery = legs.some((leg) => isLegOffsite(
    leg.pickup_location_id,
    leg.pickup_location,
    leg.pickup_fee,
    index,
    options,
  ));
  const hasCollection = legs.some((leg) => isLegOffsite(
    leg.dropoff_location_id,
    leg.dropoff_location,
    leg.dropoff_fee,
    index,
    options,
  ));

  if (hasDelivery && hasCollection) return 'both';
  if (hasDelivery) return 'delivery';
  if (hasCollection) return 'collection';
  return null;
}
