import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertSurfRacksAvailable,
  countRackAddonLines,
  countRackAddons,
  getSurfRackAvailability,
  peakRackUsage,
} from '../src/use-cases/surf-racks/get-surf-rack-availability.js';

const t = (iso: string) => new Date(iso).getTime();

describe('peakRackUsage', () => {
  const range = [t('2026-11-01T00:00:00Z'), t('2026-11-10T00:00:00Z')] as const;

  it('counts overlapping bookings at the same moment', () => {
    expect(peakRackUsage([
      { startMs: t('2026-11-01T00:00:00Z'), endMs: t('2026-11-05T00:00:00Z'), quantity: 1 },
      { startMs: t('2026-11-03T00:00:00Z'), endMs: t('2026-11-08T00:00:00Z'), quantity: 1 },
    ], ...range)).toBe(2);
  });

  it('lets one rack serve back-to-back bookings', () => {
    expect(peakRackUsage([
      { startMs: t('2026-11-01T00:00:00Z'), endMs: t('2026-11-04T00:00:00Z'), quantity: 1 },
      { startMs: t('2026-11-04T00:00:00Z'), endMs: t('2026-11-08T00:00:00Z'), quantity: 1 },
    ], ...range)).toBe(1);
  });

  it('does not add up bookings that never overlap each other', () => {
    expect(peakRackUsage([
      { startMs: t('2026-11-01T00:00:00Z'), endMs: t('2026-11-02T00:00:00Z'), quantity: 1 },
      { startMs: t('2026-11-03T00:00:00Z'), endMs: t('2026-11-04T00:00:00Z'), quantity: 1 },
      { startMs: t('2026-11-05T00:00:00Z'), endMs: t('2026-11-06T00:00:00Z'), quantity: 1 },
    ], ...range)).toBe(1);
  });

  it('ignores usage outside the requested range and honours quantity', () => {
    expect(peakRackUsage([
      { startMs: t('2026-10-20T00:00:00Z'), endMs: t('2026-11-01T00:00:00Z'), quantity: 3 },
      { startMs: t('2026-11-02T00:00:00Z'), endMs: t('2026-11-03T00:00:00Z'), quantity: 2 },
    ], ...range)).toBe(2);
  });
});

describe('rack add-on counting', () => {
  it('counts rack add-on ids on a raw booking', () => {
    expect(countRackAddons([3, 7, '7'], [7])).toBe(2);
    expect(countRackAddons([3], [7])).toBe(0);
    expect(countRackAddons(null, [7])).toBe(0);
  });

  it('counts rack lines by catalog name or the surf rack name pattern', () => {
    expect(countRackAddonLines([
      { addonName: 'Board Holder', quantity: 2 },
      { addonName: 'Surf Rack', quantity: null },
      { addonName: 'Bungee Cord', quantity: 1 },
    ], ['Board Holder'])).toBe(3);
  });
});

type Rows = Record<string, unknown[]>;

/** Minimal chainable Supabase stand-in: every filter is a no-op, results come from `rows[table]`. */
function fakeSupabase(rows: Rows): SupabaseClient {
  const builder = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'lt', 'gt', 'or', 'is', 'overlaps', 'order', 'in']) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
    chain.then = (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  return { from: builder } as unknown as SupabaseClient;
}

const query = {
  storeId: 'store-lolas',
  pickupDatetime: '2026-11-02T01:00:00Z',
  dropoffDatetime: '2026-11-04T01:00:00Z',
};

describe('getSurfRackAvailability', () => {
  it('is untracked when the store has no racks configured', async () => {
    const result = await getSurfRackAvailability(fakeSupabase({
      stores: [{ surf_rack_count: 0 }],
      addons: [{ id: 7, name: 'Surf Rack', inventory_type: 'surf_rack' }],
    }), query);
    expect(result).toMatchObject({ tracked: false, soldOut: false });
  });

  it('subtracts allocations and unprocessed web bookings from stock', async () => {
    const result = await getSurfRackAvailability(fakeSupabase({
      stores: [{ surf_rack_count: 3 }],
      addons: [{ id: 7, name: 'Surf Rack', inventory_type: 'surf_rack' }],
      surf_rack_allocations: [
        { quantity: 1, starts_at: '2026-11-01T01:00:00Z', ends_at: '2026-11-05T01:00:00Z', released_at: null },
      ],
      orders_raw: [
        { addon_ids: [7], pickup_datetime: '2026-11-03T01:00:00Z', dropoff_datetime: '2026-11-06T01:00:00Z' },
      ],
    }), query);
    expect(result).toMatchObject({ tracked: true, total: 3, peakInUse: 2, remaining: 1, soldOut: false });
  });

  it('frees a rack from the moment it is released', async () => {
    const result = await getSurfRackAvailability(fakeSupabase({
      stores: [{ surf_rack_count: 1 }],
      addons: [{ id: 7, name: 'Surf Rack', inventory_type: 'surf_rack' }],
      surf_rack_allocations: [
        { quantity: 1, starts_at: '2026-11-01T01:00:00Z', ends_at: '2026-11-05T01:00:00Z', released_at: '2026-11-02T00:00:00Z' },
      ],
    }), query);
    expect(result).toMatchObject({ remaining: 1, soldOut: false });
  });

  it('rejects a booking when every rack is taken', async () => {
    const sb = fakeSupabase({
      stores: [{ surf_rack_count: 1 }],
      addons: [{ id: 7, name: 'Surf Rack', inventory_type: 'surf_rack' }],
      surf_rack_allocations: [
        { quantity: 1, starts_at: '2026-11-01T01:00:00Z', ends_at: '2026-11-05T01:00:00Z', released_at: null },
      ],
    });
    await expect(assertSurfRacksAvailable(sb, { ...query, requested: 1 })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('fully booked'),
    });
  });

  it('never blocks while stock is untracked', async () => {
    const sb = fakeSupabase({ stores: [{ surf_rack_count: 0 }], addons: [] });
    await expect(assertSurfRacksAvailable(sb, { ...query, requested: 5 })).resolves.toBeUndefined();
  });
});
