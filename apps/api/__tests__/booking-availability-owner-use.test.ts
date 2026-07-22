import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateAvailability } from '../src/adapters/supabase/booking-adapter.js';

type FakeData = {
  fleet: unknown[];
  orderItems?: unknown[];
  directOrders?: unknown[];
  walkInOrders?: unknown[];
  ownerUse?: unknown[];
  holds?: unknown[];
  models: unknown[];
};

class FakeQuery implements PromiseLike<{ data: unknown[]; error: null }> {
  constructor(private readonly result: { data: unknown[]; error: null }) {}
  select() { return this; }
  eq() { return this; }
  not() { return this; }
  lt() { return this; }
  gt() { return this; }
  in() { return this; }
  is() { return this; }
  neq() { return this; }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(data: FakeData): SupabaseClient {
  let rawOrderCall = 0;
  return {
    from(table: string) {
      let rows: unknown[];
      switch (table) {
        case 'fleet': rows = data.fleet; break;
        case 'order_items': rows = data.orderItems ?? []; break;
        case 'orders_raw':
          rows = rawOrderCall++ === 0 ? (data.directOrders ?? []) : (data.walkInOrders ?? []);
          break;
        case 'fleet_unavailability': rows = data.ownerUse ?? []; break;
        case 'booking_holds': rows = data.holds ?? []; break;
        case 'vehicle_models': rows = data.models; break;
        default: throw new Error(`Unexpected table: ${table}`);
      }
      return new FakeQuery({ data: rows, error: null });
    },
  } as unknown as SupabaseClient;
}

const query = {
  storeId: 'store-lolas',
  pickupDatetime: '2026-07-21T09:15:00+08:00',
  dropoffDatetime: '2026-07-23T09:15:00+08:00',
};

const fleet = [
  { id: 'daku', name: 'Daku', model_id: 'honda-beat', status: 'Available' },
  { id: 'alon', name: 'Alon', model_id: 'honda-beat', status: 'Available' },
  { id: 'tanggol', name: 'Tanggol', model_id: 'honda-beat', status: 'Available' },
];

describe('owner-use availability blocks', () => {
  it('reduces three eligible vehicles to two for an overlapping owner-use period', async () => {
    const result = await evaluateAvailability(query, fakeSupabase({
      fleet,
      ownerUse: [{ vehicle_id: 'daku' }],
      models: [{ id: 'honda-beat', name: 'Honda Beat' }],
    }));

    expect(result.models).toEqual([{ modelId: 'honda-beat', modelName: 'Honda Beat', availableCount: 2 }]);
    expect(result.explanation.models[0].exactVehicleExclusions).toEqual([
      { vehicleId: 'daku', vehicleName: 'Daku', reasons: ['owner_use'] },
    ]);
  });

  it('does not double-deduct a vehicle blocked by both an order and owner use', async () => {
    const result = await evaluateAvailability(query, fakeSupabase({
      fleet,
      orderItems: [{
        id: 'item-1', vehicle_id: 'daku', dropoff_datetime: '2026-07-22T09:15:00+08:00',
        orders: { status: 'confirmed' },
      }],
      ownerUse: [{ vehicle_id: 'daku' }],
      models: [{ id: 'honda-beat', name: 'Honda Beat' }],
    }));

    expect(result.models[0].availableCount).toBe(2);
    expect(result.explanation.models[0].exactVehicleExclusions[0].reasons).toEqual(['order', 'owner_use']);
  });

  it('keeps all three available when no owner-use period overlaps', async () => {
    const result = await evaluateAvailability(query, fakeSupabase({
      fleet,
      ownerUse: [],
      models: [{ id: 'honda-beat', name: 'Honda Beat' }],
    }));

    expect(result.models[0].availableCount).toBe(3);
    expect(result.explanation.models[0].exactVehicleExclusions).toEqual([]);
  });
});
