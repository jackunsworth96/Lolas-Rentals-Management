import { describe, expect, it } from 'vitest';
import type { PublicPartnerBenefit } from '../src/api/partners.js';
import type { Addon } from '../src/components/basket/basket-types.js';
import type { BasketItem } from '../src/stores/bookingStore.js';
import { calculateBasketPricing } from '../src/utils/basket-pricing.js';

const pickupDatetime = '2026-10-01T09:00:00+08:00';
const now = new Date('2026-09-01T00:00:00+08:00');

const basketItem = (overrides: Partial<BasketItem> = {}): BasketItem => ({
  holdId: 'hold-1',
  vehicleModelId: 'model-1',
  modelName: 'Local Beat',
  dailyRate: 1000,
  securityDeposit: 500,
  expiresAt: '2026-10-01T09:15:00+08:00',
  ...overrides,
});

const perDayAddon: Addon = {
  id: 1,
  name: 'Helmet upgrade',
  addonType: 'per_day',
  pricePerDay: 100,
  priceOneTime: 0,
  storeId: null,
  mutualExclusivityGroup: null,
  isActive: true,
  applicableModelIds: null,
};

const partnerBenefit = (overrides: Partial<PublicPartnerBenefit>): PublicPartnerBenefit => ({
  name: 'Test Partner',
  dealType: 'discount',
  discountType: 'percentage',
  discountValue: 10,
  freeDelivery: false,
  freeDeliveryLocationIds: null,
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
});

function price(overrides: Partial<Parameters<typeof calculateBasketPricing>[0]> = {}) {
  return calculateBasketPricing({
    basket: [basketItem()],
    rentalDays: 1,
    addons: [],
    selectedAddonIds: new Set(),
    pickupFeePerVehicle: 0,
    dropoffFeePerVehicle: 0,
    pickupDatetime,
    pickupLocationId: 1,
    dropoffLocationId: 2,
    surchargePercent: 0,
    transferFee: 0,
    charityDonation: 0,
    partnerBenefit: null,
    now,
    ...overrides,
  });
}

describe('calculateBasketPricing', () => {
  it('includes a Xendit surcharge on rental, add-ons, and delivery fees', () => {
    const totals = price({
      rentalDays: 2,
      addons: [perDayAddon],
      selectedAddonIds: new Set([1]),
      pickupFeePerVehicle: 150,
      dropoffFeePerVehicle: 100,
      surchargePercent: 3,
    });

    expect(totals).toMatchObject({
      vehicleSubtotal: 2000,
      addonsTotal: 200,
      pickupFee: 150,
      dropoffFee: 100,
      surchargeAmount: 73.5,
      grandTotal: 2523.5,
    });
  });

  it('keeps pickup and return fees per vehicle and rounds surcharge per line', () => {
    const totals = price({
      basket: [basketItem(), basketItem({ holdId: 'hold-2', vehicleModelId: 'model-2' })],
      pickupFeePerVehicle: 100,
      dropoffFeePerVehicle: 50,
      surchargePercent: 3,
    });

    expect(totals).toMatchObject({
      vehicleSubtotal: 2000,
      pickupFee: 200,
      dropoffFee: 100,
      surchargeAmount: 69,
      grandTotal: 2369,
    });
  });

  it('adds transfer and charity to the total without applying a surcharge to either', () => {
    const totals = price({
      surchargePercent: 3,
      transferFee: 500,
      charityDonation: 100,
    });

    expect(totals).toMatchObject({
      surchargeAmount: 30,
      transferFee: 500,
      charityDonation: 100,
      grandTotal: 1630,
    });
  });

  it('applies percentage partner discounts before calculating the surcharge', () => {
    const totals = price({ partnerBenefit: partnerBenefit({}) });

    expect(totals).toMatchObject({ rentalDiscount: 100, surchargeAmount: 0, grandTotal: 900 });
  });

  it('applies fixed partner discounts per vehicle', () => {
    const totals = price({
      basket: [basketItem(), basketItem({ holdId: 'hold-2' })],
      partnerBenefit: partnerBenefit({ discountType: 'fixed', discountValue: 200 }),
    });

    expect(totals).toMatchObject({ rentalDiscount: 400, grandTotal: 1600 });
  });

  it('removes eligible pickup and return fees for free-delivery partners', () => {
    const totals = price({
      pickupFeePerVehicle: 100,
      dropoffFeePerVehicle: 50,
      partnerBenefit: partnerBenefit({
        dealType: 'free_delivery',
        discountType: null,
        discountValue: null,
        freeDelivery: true,
        freeDeliveryLocationIds: [1, 2],
      }),
    });

    expect(totals).toMatchObject({ deliveryDiscount: 150, grandTotal: 1000 });
  });
});
