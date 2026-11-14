import { describe, expect, it } from 'vitest';
import { fleetOnRentPercent } from '../src/lib/fleet-on-rent.js';

describe('fleetOnRentPercent', () => {
  it('counts vehicles on rent as part of the fleet even though their status is not rentable', () => {
    const fleet = [
      ...Array.from({ length: 21 }, (_, i) => ({ id: `out${i}`, isRentable: false })),
      ...Array.from({ length: 9 }, (_, i) => ({ id: `free${i}`, isRentable: true })),
      { id: 'workshop', isRentable: false },
    ];
    const onRent = new Set(Array.from({ length: 21 }, (_, i) => `out${i}`));
    expect(fleetOnRentPercent(fleet, onRent)).toBe(70);
  });

  it('ignores on-rent vehicles from other stores', () => {
    expect(fleetOnRentPercent([{ id: 'a', isRentable: true }], new Set(['elsewhere']))).toBe(0);
  });

  it('returns 0 for an empty fleet', () => {
    expect(fleetOnRentPercent([], new Set())).toBe(0);
  });
});
