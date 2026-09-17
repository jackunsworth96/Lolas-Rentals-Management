import { describe, expect, it } from 'vitest';
// @vitest-environment node

import type { PublicPartnerBenefit } from '../src/api/partners.js';
import {
  partnerAllowsFreeDeliveryLocation,
  partnerEstablishmentLocation,
} from '../src/utils/partnerDeliveryLocation.js';

function benefit(overrides: Partial<PublicPartnerBenefit> = {}): PublicPartnerBenefit {
  return {
    name: 'Bravo Beach Resort',
    dealType: 'commission_delivery',
    discountType: null,
    discountValue: null,
    freeDelivery: true,
    freeDeliveryLocationIds: [2],
    advanceBookingDays: null,
    advanceDiscountDays: null,
    earlyBirdDays: null,
    earlyBirdDiscountValue: null,
    logoUrl: null,
    welcomeMessage: null,
    logoDisplayWidth: null,
    logoDisplayHeight: null,
    vehicleTerms: [],
    ...overrides,
  };
}

describe('partner delivery location defaults', () => {
  it('uses the establishment name when the pricing location qualifies for free delivery', () => {
    expect(partnerEstablishmentLocation(benefit(), 2)).toBe('Bravo Beach Resort');
    expect(partnerAllowsFreeDeliveryLocation(benefit(), 2)).toBe(true);
  });

  it('keeps the normal location when it is outside the free-delivery allowlist', () => {
    expect(partnerEstablishmentLocation(benefit(), 3)).toBe('');
    expect(partnerAllowsFreeDeliveryLocation(benefit(), 3)).toBe(false);
  });

  it('supports free delivery configured for a specific vehicle model', () => {
    const vehicleBenefit = benefit({
      dealType: 'commission',
      freeDelivery: false,
      freeDeliveryLocationIds: null,
      vehicleTerms: [{
        vehicleModelId: 'honda-beat',
        dealType: 'commission_delivery',
        discountType: null,
        discountValue: null,
        freeDelivery: true,
        advanceDiscountDays: null,
        earlyBirdDays: null,
        earlyBirdDiscountValue: null,
      }],
    });

    expect(partnerEstablishmentLocation(vehicleBenefit, null, 'honda-beat')).toBe('Bravo Beach Resort');
    expect(partnerEstablishmentLocation(vehicleBenefit, null, 'yamaha-nmax')).toBe('');
  });
});
