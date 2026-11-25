import { describe, expect, it } from 'vitest';
import { computeQuote } from '../src/use-cases/booking/compute-quote.js';

function configRepo() {
  return {
    getVehicleModelById: async () => ({ id: 'scooter', name: 'Scooter', securityDeposit: 1000 }),
    getModelPricing: async () => [{ minDays: 1, maxDays: 30, dailyRate: 500 }],
    getLocations: async () => [{ id: 1, name: 'Store', deliveryCost: 0, collectionCost: 0 }],
    getAddons: async () => [
      {
        id: 1, name: 'Cancellation Cover', addonType: 'percentage', pricePerDay: 0, priceOneTime: 0,
        pricePercentage: 10, minimumAmount: 300, isActive: true, mutualExclusivityGroup: null,
      },
      {
        id: 2, name: 'Peace of Mind', addonType: 'per_day', pricePerDay: 95, priceOneTime: 0,
        isActive: true, mutualExclusivityGroup: null,
      },
    ],
  };
}

const base = {
  storeId: 'store-1',
  vehicleModelId: 'scooter',
  pickupLocationId: 1,
  dropoffLocationId: 1,
  addonIds: [1, 2],
};

describe('computeQuote percentage add-ons', () => {
  it('charges cancellation cover on the rental subtotal only', async () => {
    const quote = await computeQuote({ configRepo: configRepo() as never }, {
      ...base,
      pickupDatetime: '2026-12-01T02:00:00.000Z',
      dropoffDatetime: '2026-12-11T02:00:00.000Z',
    });

    expect(quote.rentalSubtotal).toBe(5000);
    const cover = quote.addons.find((a) => a.id === 1);
    expect(cover).toMatchObject({ type: 'percentage', unitPrice: 10, minimumAmount: 300, total: 500 });
    expect(quote.addonsTotal).toBe(500 + 950);
  });

  it('applies the minimum on short rentals', async () => {
    const quote = await computeQuote({ configRepo: configRepo() as never }, {
      ...base,
      pickupDatetime: '2026-12-01T02:00:00.000Z',
      dropoffDatetime: '2026-12-03T02:00:00.000Z',
    });

    expect(quote.addons.find((a) => a.id === 1)?.total).toBe(300);
  });
});
