import { describe, expect, it } from 'vitest';
import { deriveTransportService } from '../src/lib/transport-service.js';

const locations = [
  { id: 1, name: "Lola's Rentals", location_type: 'store', delivery_cost: 0, collection_cost: 0 },
  { id: 2, name: 'Partner Hotel', location_type: 'delivery', delivery_cost: 300, collection_cost: 300 },
];

describe('deriveTransportService', () => {
  it('keeps zero-fee partner delivery and collection visible from location IDs', () => {
    expect(deriveTransportService([{
      pickup_location_id: 2,
      dropoff_location_id: 2,
      pickup_fee: 0,
      dropoff_fee: 0,
    }], locations)).toBe('both');
  });

  it('recovers legacy activated partner transport from saved location names', () => {
    expect(deriveTransportService([{
      pickup_location: 'Partner Hotel',
      dropoff_location: "Lola's Rentals",
      pickup_fee: 0,
      dropoff_fee: 0,
    }], locations)).toBe('delivery');
  });

  it('falls back to charged fees when a legacy location cannot be resolved', () => {
    expect(deriveTransportService([{
      pickup_location: 'Unknown resort',
      pickup_fee: 250,
      dropoff_fee: 0,
    }], locations)).toBe('delivery');
  });
});
