// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { PublicPartnerVehicleTerm } from '../src/api/partners.js';
import {
  customerFreeDeliveryNote,
  freeDeliveryOffer,
  pairReceivesFreeDelivery,
  portalDeliveryOffer,
  portalFreeDeliveryNote,
  presentLeg,
  presentPortalLeg,
  type FeeLocation,
} from '../src/utils/locationFeeDisplay.js';
import type { FreeDeliverySource } from '../src/utils/partnerDeliveryLocation.js';

const locations: FeeLocation[] = [
  { id: 1, name: "Lola's Rentals Store", deliveryCost: 0, collectionCost: 0, locationType: 'store' },
  { id: 2, name: 'General Luna', deliveryCost: 100, collectionCost: 150, locationType: 'area' },
  { id: 3, name: 'Santa Fe', deliveryCost: 100, collectionCost: 100, locationType: 'area' },
  { id: 4, name: 'IAO Airport', deliveryCost: 200, collectionCost: 250, locationType: 'area' },
];

function source(overrides: Partial<FreeDeliverySource> = {}): FreeDeliverySource {
  return {
    freeDelivery: true,
    dealType: 'commission_delivery',
    freeDeliveryLocationIds: [2],
    vehicleTerms: [],
    ...overrides,
  };
}

function vehicleTerm(overrides: Partial<PublicPartnerVehicleTerm> = {}): PublicPartnerVehicleTerm {
  return {
    vehicleModelId: 'honda-beat',
    dealType: 'commission_delivery',
    discountType: null,
    discountValue: null,
    freeDelivery: true,
    advanceDiscountDays: null,
    earlyBirdDays: null,
    earlyBirdDiscountValue: null,
    ...overrides,
  };
}

describe('location fee presentation', () => {
  it('leaves the shop blank and shows a paid delivery price', () => {
    expect(presentLeg(locations[0], 'delivery', true)).toEqual({ type: 'hidden' });
    expect(presentLeg(locations[1], 'delivery', false)).toEqual({ type: 'price', amount: 100 });
    expect(presentLeg(locations[1], 'collection', false)).toEqual({ type: 'price', amount: 150 });
  });

  it('strikes a real fee only when that leg is waived', () => {
    expect(presentLeg(locations[1], 'delivery', true)).toEqual({ type: 'waived', amount: 100 });
    expect(presentLeg(
      { id: 9, name: 'Malinao', deliveryCost: 80, collectionCost: 0, locationType: null },
      'collection',
      true,
    )).toEqual({ type: 'hidden' });
  });

  it('keeps a zero portal fee as included and marks a covered paid fee', () => {
    expect(presentPortalLeg(0, true)).toEqual({ type: 'included' });
    expect(presentPortalLeg(100, false)).toEqual({ type: 'price', amount: 100 });
    expect(presentPortalLeg(100, true)).toEqual({ type: 'waived', amount: 100 });
  });
});

describe('partner free-delivery offer', () => {
  it('names the allowlisted locations and requires both legs', () => {
    const offer = freeDeliveryOffer(source({ freeDeliveryLocationIds: [2, 3] }), null, locations);
    expect(offer).toMatchObject({ coversAll: false, names: ['General Luna', 'Santa Fe'] });
    expect(pairReceivesFreeDelivery(offer, 2, 3)).toBe(true);
    expect(pairReceivesFreeDelivery(offer, 2, 4)).toBe(false);
    expect(pairReceivesFreeDelivery(offer, 2, 1)).toBe(false);
  });

  it('covers every location when the partnership has no allowlist', () => {
    const offer = freeDeliveryOffer(source({ freeDeliveryLocationIds: null }), null, locations);
    expect(offer?.coversAll).toBe(true);
    expect(pairReceivesFreeDelivery(offer, 4, 1)).toBe(true);
  });

  it('follows the scooter when free delivery is only on some models', () => {
    const benefit = source({
      freeDelivery: false,
      dealType: 'commission',
      freeDeliveryLocationIds: [2, 3],
      vehicleTerms: [vehicleTerm()],
    });
    expect(freeDeliveryOffer(benefit, 'honda-beat', locations)?.names).toEqual(['General Luna', 'Santa Fe']);
    expect(freeDeliveryOffer(benefit, 'yamaha-nmax', locations)).toBeNull();
  });

  it('tells the guest the perk is on, or how to claim it', () => {
    const offer = freeDeliveryOffer(source({ freeDeliveryLocationIds: [2, 3, 4] }), null, locations);
    expect(customerFreeDeliveryNote(offer, 'Bravo Beach Resort', true))
      .toBe('Free with your stay at Bravo Beach Resort.');
    expect(customerFreeDeliveryNote(offer, 'Bravo Beach Resort', false))
      .toBe('Free delivery applies when you pick up and return at General Luna, Santa Fe, or IAO Airport.');
    expect(customerFreeDeliveryNote(null, 'Bravo Beach Resort', false)).toBeNull();
  });

  it('describes the portal offering, including a model limit', () => {
    const benefit = source({
      freeDelivery: false,
      dealType: 'commission',
      freeDeliveryLocationIds: [2],
      vehicleTerms: [
        vehicleTerm(),
        vehicleTerm({ vehicleModelId: 'yamaha-nmax', dealType: 'discount_delivery' }),
      ],
    });
    const view = portalDeliveryOffer(benefit, null, locations, {
      'honda-beat': 'Honda Beat',
      'yamaha-nmax': 'Yamaha NMAX',
    });
    expect(portalFreeDeliveryNote(view!)).toBe(
      'Your guests get free delivery and collection at General Luna on Honda Beat and Yamaha NMAX.',
    );
    expect(portalDeliveryOffer(benefit, 'yamaha-nmax', locations)?.limitedToModels).toBeNull();
    expect(portalDeliveryOffer(benefit, 'tuktuk', locations)).toBeNull();
    expect(portalFreeDeliveryNote({
      offer: freeDeliveryOffer(source({ freeDeliveryLocationIds: null }), null, locations)!,
      limitedToModels: null,
    })).toBe('Your guests get free delivery and collection at every location.');
  });
});
