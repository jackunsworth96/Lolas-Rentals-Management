import { describe, expect, it } from 'vitest';
import { buildLocationIndex, isLegOffsite } from '../src/lib/transport-service.js';

const locations = [
  { id: 10, name: "Lola's Rentals Store", location_type: 'store', delivery_cost: 0, collection_cost: 0 },
  { id: 2, name: 'General Luna', location_type: '', delivery_cost: 100, collection_cost: 100 },
];

describe('isLegOffsite', () => {
  it('treats a free partner delivery as off-site even with a zero fee — the Bravo Beach Resort bug', () => {
    // This is the exact shape of the order_items row that was silently
    // dropped from the reminder pipeline: a partner-benefit free delivery,
    // saved by establishment name (not a configured pricing-zone id), with
    // pickup_fee of 0. The old `pickup_fee > 0` filter never saw this.
    const index = buildLocationIndex(locations);
    expect(
      isLegOffsite(null, 'Bravo Beach Resort', 0, index, {
        unknownNamedLocationsRequireTransport: true,
      }),
    ).toBe(true);
  });

  it('does not flag an in-store pickup as off-site', () => {
    const index = buildLocationIndex(locations);
    expect(
      isLegOffsite(10, "Lola's Rentals Store", 0, index, {
        unknownNamedLocationsRequireTransport: true,
      }),
    ).toBe(false);
  });

  it('still flags a known off-site pricing-zone location with zero fee', () => {
    const index = buildLocationIndex(locations);
    expect(
      isLegOffsite(2, 'General Luna', 100, index, {}),
    ).toBe(true);
  });

  it('falls back to the charged fee when the location is unresolved and the option is off', () => {
    const index = buildLocationIndex(locations);
    expect(isLegOffsite(null, 'Some Random Place', 0, index, {})).toBe(false);
    expect(isLegOffsite(null, 'Some Random Place', 150, index, {})).toBe(true);
  });
});
