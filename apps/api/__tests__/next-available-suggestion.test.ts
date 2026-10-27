import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityQuery, AvailableModel } from '@lolas/domain';

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: vi.fn(),
  supabase: {},
}));

const { verifyNextAvailableSuggestions } = await import('../src/adapters/supabase/booking-adapter.js');

const query: AvailabilityQuery = {
  storeId: 'store-lolas',
  pickupDatetime: '2026-10-27T01:15:00.000Z',
  dropoffDatetime: '2026-11-10T01:15:00.000Z',
};
const TUKTUK = 'Bajaj RE TukTuk';

function unavailable(nextAvailablePickup?: string): AvailableModel {
  return { modelId: TUKTUK, modelName: 'TukTuk (RE)', availableCount: 0, ...(nextAvailablePickup ? { nextAvailablePickup } : {}) };
}

describe('verifyNextAvailableSuggestions', () => {
  it('keeps a suggestion when the same-length rental fits from that date', async () => {
    const check = vi.fn(async () => [{ modelId: TUKTUK, modelName: 'TukTuk (RE)', availableCount: 1 }]);
    const [model] = await verifyNextAvailableSuggestions(query, [unavailable('2026-10-30T01:15:00.000Z')], check);
    expect(model.nextAvailablePickup).toBe('2026-10-30T01:15:00.000Z');
    expect(check).toHaveBeenCalledWith(expect.objectContaining({
      pickupDatetime: '2026-10-30T01:15:00.000Z',
      dropoffDatetime: '2026-11-13T01:15:00.000Z',
    }));
  });

  it('walks forward when the first suggestion collides with a later booking', async () => {
    const check = vi.fn(async (q: AvailabilityQuery) => (q.pickupDatetime === '2026-10-30T01:15:00.000Z'
      ? [unavailable('2026-11-04T02:45:00.000Z')]
      : [{ modelId: TUKTUK, modelName: 'TukTuk (RE)', availableCount: 1 }]));
    const [model] = await verifyNextAvailableSuggestions(query, [unavailable('2026-10-30T01:15:00.000Z')], check);
    expect(model.nextAvailablePickup).toBe('2026-11-04T02:45:00.000Z');
  });

  it('drops the suggestion when no fitting start is found', async () => {
    const check = vi.fn(async () => [unavailable()]);
    const [model] = await verifyNextAvailableSuggestions(query, [unavailable('2026-10-30T01:15:00.000Z')], check);
    expect(model.nextAvailablePickup).toBeUndefined();
    expect(model.availableCount).toBe(0);
  });

  it('stops if a re-check suggests a time that is not later', async () => {
    const check = vi.fn(async () => [unavailable('2026-10-30T01:15:00.000Z')]);
    const [model] = await verifyNextAvailableSuggestions(query, [unavailable('2026-10-30T01:15:00.000Z')], check);
    expect(model.nextAvailablePickup).toBeUndefined();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('leaves available models and partial-availability answers untouched', async () => {
    const check = vi.fn();
    const available: AvailableModel = { modelId: 'Honda Beat V3', modelName: 'Honda Beat', availableCount: 3 };
    const partial: AvailableModel = { ...unavailable('2026-10-27T08:00:00.000Z'), firstConflictAt: '2026-10-29T01:15:00.000Z' };
    const result = await verifyNextAvailableSuggestions(query, [available, partial], check);
    expect(result).toEqual([available, partial]);
    expect(check).not.toHaveBeenCalled();
  });
});
