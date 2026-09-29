import { describe, expect, it } from 'vitest';
import { ownerUseOverlapsRange, ownerUseVehicleIdsOverlapping } from '../src/lib/owner-use-window.js';

const now = new Date('2026-09-29T01:20:00.000Z').getTime();
const tomorrowStart = new Date('2026-09-30T00:00:00+08:00').getTime();
const tomorrowEnd = new Date('2026-09-30T23:59:59.999+08:00').getTime();

describe('owner-use windows', () => {
  it('treats a period active at this instant as overlapping now', () => {
    expect(ownerUseOverlapsRange(
      '2026-09-28T01:00:00+00:00',
      '2026-10-20T09:00:00+00:00',
      now,
      now + 1,
    )).toBe(true);
  });

  it('does not treat a period that has already ended as overlapping now', () => {
    expect(ownerUseOverlapsRange(
      '2026-07-24T05:30:00+00:00',
      '2026-07-31T09:00:00+00:00',
      now,
      now + 1,
    )).toBe(false);
  });

  it('does not treat a period that starts tomorrow as overlapping now', () => {
    expect(ownerUseOverlapsRange(
      '2026-09-30T01:00:00+08:00',
      '2026-10-02T17:00:00+08:00',
      now,
      now + 1,
    )).toBe(false);
  });

  it('treats a period that covers any part of tomorrow as overlapping tomorrow', () => {
    expect(ownerUseOverlapsRange(
      '2026-09-27T21:00:00+00:00',
      '2026-10-02T09:00:00+00:00',
      tomorrowStart,
      tomorrowEnd,
    )).toBe(true);
  });

  it('keeps owner-use vehicles for the requested store only', () => {
    const ids = ownerUseVehicleIdsOverlapping([
      {
        vehicle_id: 'daku',
        store_id: 'store-lolas',
        starts_at: '2026-09-27T21:00:00+00:00',
        ends_at: '2026-10-02T09:00:00+00:00',
      },
      {
        vehicle_id: 'amber',
        store_id: 'store-bass',
        starts_at: '2026-09-27T21:00:00+00:00',
        ends_at: '2026-10-02T09:00:00+00:00',
      },
    ], now, now + 1, 'store-lolas');

    expect([...ids]).toEqual(['daku']);
  });
});
