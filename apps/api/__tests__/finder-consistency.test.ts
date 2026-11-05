import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: () => { throw new Error('use the fake client'); } }));

const { evaluateAvailability } = await import('../src/adapters/supabase/booking-adapter.js');
const { findAvailability } = await import('../src/use-cases/fleet/find-availability.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-05T10:00:00+08:00');
const iso = (t: number) => new Date(t).toISOString();
const STORE = 'store-lolas';

/** Fake PostgREST client: applies plain `eq` filters, ignores the rest (fixtures stay inside the window). */
function fakeClient(tables: Record<string, unknown>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const rows = () => {
        const data = tables[table];
        if (!Array.isArray(data)) return data ?? null;
        return data.filter((row: Record<string, unknown>) => filters.every(([k, v]) => !(k in row) || row[k] === v));
      };
      const query: Record<string, unknown> = {
        eq: (k: string, v: unknown) => { if (!k.includes('.')) filters.push([k, v]); return query; },
        maybeSingle: async () => ({ data: rows(), error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
      };
      for (const m of ['select', 'in', 'not', 'is', 'gt', 'gte', 'lt', 'lte', 'or', 'neq', 'overlaps']) query[m] = () => query;
      return query;
    },
  } as never;
}

describe('looking ahead to a future date', () => {
  it('does not call a rental overdue just because it is due before the chosen date', async () => {
    const realNow = Date.now();
    const sb = fakeClient({
      fleet: [{ id: 'A', name: 'Alpha', model_id: 'beat', status: 'Available', surf_rack: false, store_id: STORE }],
      vehicle_models: [{ id: 'beat', name: 'Honda Beat', type: 'scooter', is_active: true, show_on_customer_website: true }],
      orders_raw: [], booking_holds: [], fleet_unavailability: [],
      order_items: [{
        id: 'i1', order_id: 'o1', vehicle_id: 'A', store_id: STORE,
        pickup_datetime: iso(realNow - DAY), dropoff_datetime: iso(realNow + 17 * HOUR),
        orders: { status: 'active', booking_token: 'LR-1104-1411', booking_customer_name: 'Rider' },
      }],
      partner_allocation_settings: null, partner_allocation_type_map: [],
    });
    const finder = await findAvailability(sb, { storeId: STORE, fromMs: realNow + 2 * DAY, days: 1, quantity: 1, product: 'beat', partnerId: null });
    expect(finder.products[0].vehicles[0].state).toBe('free');
  });
});

describe('finder agrees with the booking engine', () => {
  it('counts the same free units now', async () => {
    const vehicle = (id: string) => ({ id, name: id, model_id: 'beat', status: 'Available', surf_rack: false, store_id: STORE });
    const sb = fakeClient({
      fleet: ['A', 'B', 'C', 'D'].map(vehicle),
      vehicle_models: [{ id: 'beat', name: 'Honda Beat', type: 'scooter', is_active: true, show_on_customer_website: true }],
      orders_raw: [{
        id: 'r1', order_reference: 'LR-2', customer_name: 'Web', vehicle_model_id: 'beat', vehicle_id: null,
        booking_channel: 'direct', status: 'unprocessed', store_id: STORE,
        pickup_datetime: iso(NOW + HOUR), dropoff_datetime: iso(NOW + 2 * DAY),
      }],
      booking_holds: [],
      order_items: [{
        id: 'i1', order_id: 'o1', vehicle_id: 'A', store_id: STORE,
        pickup_datetime: iso(NOW - DAY), dropoff_datetime: iso(NOW + 3 * HOUR),
        orders: { status: 'active', booking_token: 'LR-1', booking_customer_name: 'Rider' },
      }],
      fleet_unavailability: [{ vehicle_id: 'C', store_id: STORE, type: 'owner_use', starts_at: iso(NOW - DAY), ends_at: null, note: 'Owner trip' }],
      partner_allocation_settings: null,
      partner_allocation_type_map: [],
    });

    const engine = await evaluateAvailability(
      { storeId: STORE, pickupDatetime: iso(NOW), dropoffDatetime: iso(NOW + DAY) }, sb, { includeHiddenFromWebsite: true },
    );
    const finder = await findAvailability(sb, { storeId: STORE, fromMs: NOW, days: 1, quantity: 1, product: 'beat', partnerId: null });

    const beat = finder.products.find((p) => p.modelId === 'beat')!;
    expect(engine.models[0].availableCount).toBe(1);
    expect(beat.freeNow).toBe(engine.models[0].availableCount);
    expect(beat.heldNow).toBe(1);
    expect(finder.search?.answers[0]).toMatchObject({ readyNow: true });
    expect(beat.vehicles.find((v) => v.vehicleId === 'A')).toMatchObject({ state: 'on_rent', reference: 'LR-1', nextFreeAt: iso(NOW + 3.5 * HOUR) });
    expect(beat.vehicles.find((v) => v.vehicleId === 'C')).toMatchObject({ state: 'owner_use', nextFreeAt: null });
  });
});
