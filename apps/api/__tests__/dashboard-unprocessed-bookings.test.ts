import { describe, expect, it } from 'vitest';
import {
  availableAfterUnassignedHolds,
  unprocessedBookingHolds,
} from '../src/lib/dashboard-unprocessed-bookings.js';

const modelNames = new Map([
  ['Bajaj RE TukTuk', 'TukTuk (RE)'],
  ['Honda Beat V3', 'Honda Beat'],
]);

const now = new Date('2026-10-30T03:58:00Z').getTime();
const endOfDay = new Date('2026-10-30T23:59:59.999+08:00').getTime();

describe('unprocessed booking holds on the dashboard', () => {
  it('holds a unit per model for uncollected web bookings with no vehicle assigned', () => {
    const holds = unprocessedBookingHolds(
      [
        { store_id: 'store-lolas', vehicle_model_id: 'Bajaj RE TukTuk', pickup_datetime: '2026-10-30T01:15:00Z', dropoff_datetime: '2026-11-11T01:15:00Z' },
        { store_id: 'store-lolas', vehicle_model_id: 'Honda Beat V3', pickup_datetime: '2026-10-30T01:15:00Z', dropoff_datetime: '2026-11-10T08:45:00Z' },
      ],
      modelNames,
      now,
      endOfDay,
      'store-lolas',
    );

    expect(Object.fromEntries(holds.modelCounts)).toEqual({ tuktuk: 1, 'honda-beat': 1 });
    expect(holds.vehicleIds.size).toBe(0);
  });

  it('holds the named vehicle when the booking already has one', () => {
    const holds = unprocessedBookingHolds(
      [{ store_id: 'store-lolas', vehicle_id: 'VEH38', vehicle_model_id: 'Bajaj RE TukTuk', pickup_datetime: '2026-10-30T06:00:00Z', dropoff_datetime: '2026-10-31T06:00:00Z' }],
      modelNames,
      now,
      endOfDay,
    );

    expect([...holds.vehicleIds]).toEqual(['VEH38']);
    expect(holds.modelCounts.size).toBe(0);
  });

  it('ignores other stores and bookings outside the window', () => {
    const holds = unprocessedBookingHolds(
      [
        { store_id: 'other', vehicle_model_id: 'Honda Beat V3', pickup_datetime: '2026-10-30T01:15:00Z', dropoff_datetime: '2026-11-01T01:15:00Z' },
        { store_id: 'store-lolas', vehicle_model_id: 'Honda Beat V3', pickup_datetime: '2026-11-02T01:15:00Z', dropoff_datetime: '2026-11-05T01:15:00Z' },
        { store_id: 'store-lolas', vehicle_model_id: 'Honda Beat V3', pickup_datetime: '2026-10-28T01:15:00Z', dropoff_datetime: '2026-10-30T02:00:00Z' },
      ],
      modelNames,
      now,
      endOfDay,
      'store-lolas',
    );

    expect(holds.modelCounts.size).toBe(0);
  });

  it('subtracts holds per model without going below zero', () => {
    const free = new Map([['tuktuk', 3], ['honda-beat', 1]] as const);
    const held = new Map([['tuktuk', 1], ['honda-beat', 2]] as const);
    expect(availableAfterUnassignedHolds(new Map(free), new Map(held))).toBe(2);
  });
});
