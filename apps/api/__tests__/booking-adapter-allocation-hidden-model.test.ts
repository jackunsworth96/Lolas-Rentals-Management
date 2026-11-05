import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Regression test for a bug where a vehicle model with `show_on_customer_website = false`
 * (e.g. TukTuk (TVS), kept active for back-office booking only) still appeared in the
 * customer website / partner portal availability list.
 *
 * `evaluateAvailability` correctly excludes hidden models. But `checkAvailability` also
 * merges in the result of the `allocation_availability` SQL RPC (which powers the partner
 * capacity-allocation overlay) and that RPC only gates on `is_active`, not
 * `show_on_customer_website`. The merge step must not let RPC rows resurrect models that
 * `evaluateAvailability` already excluded.
 */

class FakeQuery implements PromiseLike<{ data: unknown[]; error: null }> {
  constructor(private readonly result: { data: unknown[]; error: null }) {}
  select() { return this; }
  eq() { return this; }
  not() { return this; }
  lt() { return this; }
  gt() { return this; }
  in() { return this; }
  is() { return this; }
  or() { return this; }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

const fleet = [
  { id: 'tvs-1', name: 'TVS 1', model_id: 'tvs', status: 'Available' },
  { id: 'beat-1', name: 'Beat 1', model_id: 'beat', status: 'Available' },
];

// `vehicle_models` as it comes back from the real `is_active && show_on_customer_website`
// filtered query: the hidden TVS model is already absent here.
const visibleModels = [{ id: 'beat', name: 'Honda Beat' }];

// What the (buggy, unfiltered) `allocation_availability` RPC returns today: it includes
// the hidden TVS model because it only checks `is_active`.
const rpcModels = [
  { modelId: 'tvs', modelName: 'TukTuk (TVS)', availableCount: 0 },
  { modelId: 'beat', modelName: 'Honda Beat', availableCount: 1 },
];

function fakeSupabase(): SupabaseClient {
  let rawOrderCall = 0;
  return {
    from(table: string) {
      let rows: unknown[];
      switch (table) {
        case 'fleet': rows = fleet; break;
        case 'order_items': rows = []; break;
        case 'orders_raw': rows = rawOrderCall++ === 0 ? [] : []; break;
        case 'fleet_unavailability': rows = []; break;
        case 'booking_holds': rows = []; break;
        case 'vehicle_models': rows = visibleModels; break;
        default: throw new Error(`Unexpected table: ${table}`);
      }
      return new FakeQuery({ data: rows, error: null });
    },
    rpc: vi.fn(async () => ({ data: rpcModels, error: null })),
  } as unknown as SupabaseClient;
}

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => fakeSupabase(),
}));

const { createBookingAdapter } = await import('../src/adapters/supabase/booking-adapter.js');

const query = {
  storeId: 'store-lolas',
  pickupDatetime: '2026-07-21T09:15:00+08:00',
  dropoffDatetime: '2026-07-23T09:15:00+08:00',
};

describe('checkAvailability: allocation RPC must not resurrect a website-hidden model', () => {
  it('drops an RPC row for a model that evaluateAvailability excluded as hidden', async () => {
    const bookingPort = createBookingAdapter();
    const result = await bookingPort.checkAvailability(query, {});

    expect(result.map((m) => m.modelId)).not.toContain('tvs');
    expect(result).toEqual([
      expect.objectContaining({ modelId: 'beat', modelName: 'Honda Beat', availableCount: 1 }),
    ]);
  });
});
