import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateAvailability } from '../src/adapters/supabase/booking-adapter.js';
import { additionalUnitsThatFit, canAssignAll } from '../src/lib/fleet-assignment.js';

const t = (iso: string) => new Date(iso).getTime();

describe('canAssignAll', () => {
  it('does not split one rental across two vehicles that are each free for half of it', () => {
    const blocks = [
      [{ start: t('2026-11-01T00:00:00Z'), end: t('2026-11-05T00:00:00Z') }],
      [{ start: t('2026-11-05T00:00:00Z'), end: t('2026-11-10T00:00:00Z') }],
    ];
    expect(canAssignAll(blocks, [{ start: t('2026-11-01T00:00:00Z'), end: t('2026-11-10T00:00:00Z') }])).toBe(false);
  });

  it('reuses a vehicle for back-to-back rentals', () => {
    const jobs = [
      { start: t('2026-11-01T00:00:00Z'), end: t('2026-11-03T00:00:00Z') },
      { start: t('2026-11-03T00:00:00Z'), end: t('2026-11-05T00:00:00Z') },
    ];
    expect(canAssignAll([[]], jobs)).toBe(true);
  });

  it('keeps the vehicle with no later commitments for the longer booking', () => {
    const blocks = [[], [{ start: t('2026-11-04T00:00:00Z'), end: t('2026-11-06T00:00:00Z') }]];
    const short = { start: t('2026-11-01T00:00:00Z'), end: t('2026-11-03T00:00:00Z') };
    const long = { start: t('2026-11-02T00:00:00Z'), end: t('2026-11-08T00:00:00Z') };
    expect(canAssignAll(blocks, [short, long])).toBe(true);
    expect(additionalUnitsThatFit(blocks, [long], short)).toBe(1);
  });
});

type Rows = Record<string, unknown[]>;
function fakeSupabase(rows: Rows): SupabaseClient {
  let rawCall = 0;
  return {
    from(table: string) {
      const key = table === 'orders_raw' ? (rawCall++ === 0 ? 'direct' : 'walkIn') : table;
      const result = { data: rows[key] ?? [], error: null };
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      for (const method of ['select', 'eq', 'not', 'lt', 'gt', 'in', 'is', 'neq', 'or']) query[method] = () => query;
      return query;
    },
  } as unknown as SupabaseClient;
}

describe('TukTuk availability across returns and future bookings', () => {
  const tuktuk = (id: string) => ({ id, name: id, model_id: 'Bajaj RE TukTuk', status: 'Available' });
  const rentedUntil29 = (vehicle: string) => ({
    id: `${vehicle}-item`, vehicle_id: vehicle, orders: { status: 'active' },
    pickup_datetime: '2026-10-26T15:15:00+08:00', dropoff_datetime: '2026-10-29T16:45:00+08:00',
  });
  const alexandra = { id: 'alexandra', vehicle_model_id: 'Bajaj RE TukTuk',
    pickup_datetime: '2026-10-30T09:15:00+08:00', dropoff_datetime: '2026-11-11T09:15:00+08:00' };
  const micheal = { id: 'micheal', vehicle_model_id: 'Bajaj RE TukTuk',
    pickup_datetime: '2026-11-01T12:15:00+08:00', dropoff_datetime: '2026-11-04T10:15:00+08:00' };
  const base: Rows = {
    fleet: ['pepper', 'nawa', 'sublease'].map(tuktuk),
    order_items: [rentedUntil29('nawa'), rentedUntil29('sublease')],
    direct: [alexandra, micheal],
    vehicle_models: [{ id: 'Bajaj RE TukTuk', name: 'TukTuk (RE)' }],
  };
  const fortnight = {
    storeId: 'store-lolas', pickupDatetime: '2026-10-27T16:15:00+08:00', dropoffDatetime: '2026-11-10T16:45:00+08:00',
  };

  it('sells Pepper for two weeks because returning TukTuks cover the later bookings', async () => {
    const result = await evaluateAvailability(fortnight, fakeSupabase(base));
    expect(result.models[0].availableCount).toBe(1);
  });

  it('still refuses a fourth TukTuk while three are needed at once', async () => {
    const result = await evaluateAvailability(fortnight, fakeSupabase({
      ...base, direct: [alexandra, micheal, { ...micheal, id: 'third' }],
    }));
    expect(result.models[0].availableCount).toBe(0);
  });

  it('holds back a free TukTuk that a pending booking needs', async () => {
    const nawaBusyLonger = { ...rentedUntil29('nawa'), dropoff_datetime: '2026-11-05T16:45:00+08:00' };
    const result = await evaluateAvailability(fortnight, fakeSupabase({
      ...base, fleet: ['pepper', 'nawa'].map(tuktuk), order_items: [nawaBusyLonger], direct: [alexandra],
    }), { vehicleAssignments: true });
    expect(result.models[0].availableCount).toBe(0);
    expect(result.explanation.models[0].reservedForBookings).toEqual([{ vehicleId: 'pepper', vehicleName: 'pepper' }]);
  });

  it('counts blocks after the searched dates that an unassigned booking runs into', async () => {
    const shortSearch = { ...fortnight, dropoffDatetime: '2026-11-02T16:45:00+08:00' };
    const after = (vehicle: string) => ({ ...rentedUntil29(vehicle), id: `${vehicle}-later`,
      pickup_datetime: '2026-11-08T09:15:00+08:00', dropoff_datetime: '2026-11-09T09:15:00+08:00' });
    const result = await evaluateAvailability(shortSearch, fakeSupabase({
      ...base, fleet: ['pepper', 'nawa'].map(tuktuk), order_items: [after('pepper')], direct: [alexandra],
    }));
    // Alexandra runs to 11 Nov, so only Nawa can take her; Pepper is free for the short search.
    expect(result.models[0].availableCount).toBe(1);
    const both = await evaluateAvailability(shortSearch, fakeSupabase({
      ...base, fleet: ['pepper', 'nawa'].map(tuktuk), order_items: [after('pepper'), after('nawa')], direct: [alexandra],
    }));
    expect(both.models[0].availableCount).toBe(0);
  });
});
