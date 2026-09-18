import { describe, expect, it, vi } from 'vitest';
import type { ConfigRepository } from '@lolas/domain';
import { resolveDirectBookingTerms } from '../src/lib/direct-booking-terms.js';

function configRepo(): ConfigRepository {
  return {
    getVehicleModelById: vi.fn(async () => ({ id: 'model-1', name: 'Honda Beat', isActive: true, securityDeposit: 0 })),
    getLocations: vi.fn(async () => [
      { id: 1, name: "Lola's Shop", deliveryCost: 0, collectionCost: 0, locationType: null, storeId: 'lolas', isActive: true },
      { id: 2, name: 'General Luna', deliveryCost: 100, collectionCost: 150, locationType: null, storeId: 'lolas', isActive: true },
    ]),
    getAddons: vi.fn(async () => [
      { id: 9, name: '9PM Return', pricePerDay: 0, priceOneTime: 200, addonType: 'one_time', storeId: 'lolas', mutualExclusivityGroup: null, isActive: true },
    ]),
    getModelPricing: vi.fn(async () => [{ id: 1, modelId: 'model-1', storeId: 'lolas', minDays: 1, maxDays: 10, dailyRate: 500 }]),
  } as unknown as ConfigRepository;
}

describe('direct booking term reconstruction', () => {
  it('uses the stored rental subtotal and existing quote fields', async () => {
    const result = await resolveDirectBookingTerms({
      booking_channel: 'direct',
      vehicle_model_id: 'model-1',
      pickup_datetime: '2026-09-20T09:15:00+08:00',
      dropoff_datetime: '2026-09-22T09:15:00+08:00',
      pickup_location_id: 1,
      dropoff_location_id: 2,
      store_id: 'lolas',
      addon_ids: [9],
      rental_value_raw: 900,
      web_quote_raw: 1275,
      web_card_fee_surcharge: 25,
      transfer_amount: 0,
      charity_donation: 0,
    }, configRepo());

    expect(result).toMatchObject({
      source: 'reconstructed',
      vehicleModelId: 'model-1',
      rentalDays: 2,
      effectiveDailyRate: 450,
      rentalSubtotal: 900,
      pickupFee: 0,
      dropoffFee: 150,
      addonsTotal: 200,
      surcharge: 25,
      calculatedTotal: 1275,
      quotedTotal: 1275,
      totalDifference: 0,
      warning: null,
    });
  });

  it('reports configuration drift instead of changing the stored quote', async () => {
    const result = await resolveDirectBookingTerms({
      booking_channel: 'direct',
      vehicle_model_id: 'model-1',
      pickup_datetime: '2026-09-20T09:15:00+08:00',
      dropoff_datetime: '2026-09-22T09:15:00+08:00',
      pickup_location_id: 1,
      dropoff_location_id: 2,
      store_id: 'lolas',
      addon_ids: [9],
      rental_value_raw: 900,
      web_quote_raw: 1200,
      web_card_fee_surcharge: 25,
      transfer_amount: 0,
      charity_donation: 0,
    }, configRepo());

    expect(result?.calculatedTotal).toBe(1275);
    expect(result?.quotedTotal).toBe(1200);
    expect(result?.totalDifference).toBe(75);
    expect(result?.warning).toContain('differs from the original web quote');
  });

  it('does not apply direct-booking reconstruction to WooCommerce', async () => {
    const repo = configRepo();
    const result = await resolveDirectBookingTerms({
      booking_channel: 'woocommerce',
      vehicle_model_id: null,
      pickup_datetime: null,
      dropoff_datetime: null,
      pickup_location_id: null,
      dropoff_location_id: null,
      store_id: null,
      addon_ids: null,
      rental_value_raw: null,
      web_quote_raw: null,
      web_card_fee_surcharge: null,
      transfer_amount: null,
      charity_donation: null,
    }, repo);

    expect(result).toBeNull();
    expect(repo.getLocations).not.toHaveBeenCalled();
  });
});
