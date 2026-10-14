import {
  hasPartnerFreeDelivery,
  type FreeDeliverySource,
} from './partnerDeliveryLocation.js';

export interface FeeLocation {
  id: number;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
}

export type FeeKind = 'delivery' | 'collection';

export type FeePresentation =
  | { type: 'hidden' }
  | { type: 'price'; amount: number }
  | { type: 'waived'; amount: number };

export type PortalLegPresentation =
  | { type: 'included' }
  | { type: 'price'; amount: number }
  | { type: 'waived'; amount: number };

export interface FreeDeliveryOfferView {
  /** True when the partnership waives every location, not a named allowlist. */
  coversAll: boolean;
  locationIds: number[];
  names: string[];
}

export interface PortalDeliveryOffer {
  offer: FreeDeliveryOfferView;
  /** Vehicle names when free delivery is only on some models. Null when every vehicle qualifies. */
  limitedToModels: string[] | null;
}

export function isShopLocation(loc: FeeLocation): boolean {
  if (loc.locationType === 'store') return true;
  return Number(loc.deliveryCost) === 0 && Number(loc.collectionCost) === 0;
}

export function legAmount(loc: FeeLocation, kind: FeeKind): number {
  const raw = kind === 'delivery' ? loc.deliveryCost : loc.collectionCost;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Shop collection has no delivery price to show. A partner waiver only
 * strikes through a real fee — a zero amount stays blank.
 */
export function presentLeg(loc: FeeLocation, kind: FeeKind, waived: boolean): FeePresentation {
  if (isShopLocation(loc)) return { type: 'hidden' };
  const amount = legAmount(loc, kind);
  if (amount <= 0) return { type: 'hidden' };
  if (waived) return { type: 'waived', amount };
  return { type: 'price', amount };
}

/** Price-list row. A zero fee stays "Free"; a covered paid fee is the struck price. */
export function presentPortalLeg(amount: number, covered: boolean): PortalLegPresentation {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { type: 'included' };
  if (covered) return { type: 'waived', amount: value };
  return { type: 'price', amount: value };
}

export function freeDeliveryOffer(
  benefit: FreeDeliverySource | null | undefined,
  vehicleModelId: string | null | undefined,
  locations: FeeLocation[],
): FreeDeliveryOfferView | null {
  if (!benefit || !hasPartnerFreeDelivery(benefit, vehicleModelId)) return null;
  const ids = benefit.freeDeliveryLocationIds;
  if (!ids || ids.length === 0) {
    return { coversAll: true, locationIds: locations.map((loc) => loc.id), names: [] };
  }
  const matched = locations.filter((loc) => ids.includes(loc.id));
  if (matched.length === 0) return null;
  return {
    coversAll: false,
    locationIds: matched.map((loc) => loc.id),
    names: matched.map((loc) => loc.name),
  };
}

/** Free delivery applies only when both pickup and return are covered locations. */
export function pairReceivesFreeDelivery(
  offer: FreeDeliveryOfferView | null,
  pickupLocationId: number | null | undefined,
  dropoffLocationId: number | null | undefined,
): boolean {
  if (!offer || pickupLocationId == null || dropoffLocationId == null) return false;
  return offer.locationIds.includes(pickupLocationId) && offer.locationIds.includes(dropoffLocationId);
}

export function customerFreeDeliveryNote(
  offer: FreeDeliveryOfferView | null,
  partnerName: string,
  pairQualifies: boolean,
): string | null {
  if (!offer) return null;
  const name = partnerName.trim() || 'your partner';
  if (pairQualifies) return `Free with your stay at ${name}.`;
  if (offer.coversAll) return `Free delivery and collection with your stay at ${name}.`;
  return `Free delivery applies when you pick up and return at ${formatOrList(offer.names)}.`;
}

export function portalDeliveryOffer(
  benefit: FreeDeliverySource | null | undefined,
  selectedModelId: string | null,
  locations: FeeLocation[],
  modelNames: Record<string, string> = {},
): PortalDeliveryOffer | null {
  if (!benefit) return null;

  if (selectedModelId) {
    const offer = freeDeliveryOffer(benefit, selectedModelId, locations);
    return offer ? { offer, limitedToModels: null } : null;
  }

  const globalOffer = freeDeliveryOffer(benefit, null, locations);
  if (globalOffer) return { offer: globalOffer, limitedToModels: null };

  const qualifying = Array.from(new Set(
    (benefit.vehicleTerms ?? [])
      .filter((term) => hasPartnerFreeDelivery(benefit, term.vehicleModelId))
      .map((term) => modelNames[term.vehicleModelId] || term.vehicleModelId),
  ));
  if (qualifying.length === 0) return null;

  const offer = freeDeliveryOffer({ ...benefit, freeDelivery: true }, null, locations);
  if (!offer) return null;
  return { offer, limitedToModels: qualifying };
}

export function portalFreeDeliveryNote(view: PortalDeliveryOffer): string {
  const where = view.offer.coversAll ? 'every location' : formatOrList(view.offer.names);
  const base = `Your guests get free delivery and collection at ${where}`;
  if (!view.limitedToModels?.length) return `${base}.`;
  return `${base} on ${formatAndList(view.limitedToModels)}.`;
}

function formatOrList(names: string[]): string {
  if (names.length === 0) return 'an eligible location';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}

function formatAndList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
