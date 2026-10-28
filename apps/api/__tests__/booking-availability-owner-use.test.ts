import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityQuery, BookingPort, ConfigRepository, HoldRow, InsertHoldInput, TransferRepository } from '@lolas/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateAvailability } from '../src/adapters/supabase/booking-adapter.js';
import { createHold } from '../src/use-cases/booking/create-hold.js';
import { submitDirectBooking } from '../src/use-cases/booking/submit-direct-booking.js';

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
  neq(key: string, value: unknown) {
    this.result.data = this.result.data.filter((row) => (row as Record<string, unknown>)[key] !== value);
    return this;
  }
  or() { return this; }
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

  it.each([
    ['10:14', 0], // still inside the 30-minute handover buffer after owner-use ends at 10:15
    ['10:15', 1], // buffer has fully elapsed
  ])('applies the 30-minute handover buffer after owner use ends (pickup %s)', async (time, expected) => {
    const result = await evaluateAvailability({
      storeId: 'store-lolas',
      pickupDatetime: `2026-07-21T${time}:00+08:00`,
      dropoffDatetime: '2026-07-23T09:15:00+08:00',
    }, fakeSupabase({
      fleet: [{ id: 'tuktuk-1', name: 'TukTuk 1', model_id: 'tuktuk', status: 'Available' }],
      ownerUse: [{
        vehicle_id: 'tuktuk-1',
        starts_at: '2026-07-20T09:15:00+08:00',
        ends_at: '2026-07-21T09:45:00+08:00',
      }],
      models: [{ id: 'tuktuk', name: 'TukTuk' }],
    }));

    expect(result.models[0].availableCount).toBe(expected);
  });

  it('returns the next booking slot when owner use fully books a model', async () => {
    const result = await evaluateAvailability(query, fakeSupabase({
      fleet: [{ id: 'tuktuk-1', name: 'TukTuk 1', model_id: 'tuktuk', status: 'Available' }],
      ownerUse: [{
        vehicle_id: 'tuktuk-1',
        starts_at: '2026-07-20T09:15:00+08:00',
        ends_at: '2026-07-21T10:15:00+08:00',
      }],
      models: [{ id: 'tuktuk', name: 'TukTuk' }],
    }));

    expect(result.models[0]).toMatchObject({
      modelId: 'tuktuk',
      modelName: 'TukTuk',
      availableCount: 0,
      nextAvailablePickup: '2026-07-21T02:45:00.000Z',
    });
  });

  it('returns the latest confirmed return when a future booking shortens the window', async () => {
    const result = await evaluateAvailability({
      storeId: 'store-lolas',
      pickupDatetime: '2026-08-01T16:30:00+08:00',
      dropoffDatetime: '2026-08-05T16:30:00+08:00',
      requestedQuantity: 1,
    }, fakeSupabase({
      fleet: [{ id: 'tuktuk-1', name: 'TukTuk 1', model_id: 'tuktuk', status: 'Available' }],
      orderItems: [{
        id: 'future-booking',
        vehicle_id: 'tuktuk-1',
        pickup_datetime: '2026-08-03T10:15:00+08:00',
        dropoff_datetime: '2026-08-06T10:15:00+08:00',
        orders: { status: 'confirmed' },
      }],
      models: [{ id: 'tuktuk', name: 'TukTuk' }],
    }));

    expect(result.models[0]).toMatchObject({
      modelId: 'tuktuk',
      availableCount: 0,
      availableUntil: '2026-08-03T01:45:00.000Z',
    });
  });
});

describe('simultaneous model demand', () => {
  const tenBikes = Array.from({ length: 10 }, (_, index) => ({
    id: `beat-${index}`, name: `Beat ${index}`, model_id: 'honda-beat', status: 'Available',
  }));
  const early = {
    vehicle_model_id: 'honda-beat', pickup_datetime: '2026-07-21T09:15:00+08:00',
    dropoff_datetime: '2026-07-21T16:00:00+08:00', expires_at: '2099-01-01T00:00:00Z',
  };
  const late = { ...early, pickup_datetime: '2026-07-22T09:15:00+08:00', dropoff_datetime: '2026-07-22T16:00:00+08:00' };
  const five = (period: typeof early) => Array.from({ length: 5 }, () => ({ ...period }));
  const data = (extra: Partial<FakeData> = {}): FakeData => ({
    fleet: tenBikes, models: [{ id: 'honda-beat', name: 'Honda Beat' }], ...extra,
  });

  it('keeps five of ten bikes bookable across two sequential groups of five reservations', async () => {
    const result = await evaluateAvailability(query, fakeSupabase(data({ directOrders: [...five(early), ...five(late)] })));
    expect(result.models[0].availableCount).toBe(5);
    expect(result.explanation.models[0].capacityDeductions).toEqual({ directReservations: 5, holds: 0 });
  });

  it('completes hold and checkout with staggered reservations, preserving the quote', async () => {
    const storage = data({ directOrders: [...five(early), ...five(late)], holds: [] });
    let hold: HoldRow;
    const insertDirectBooking = vi.fn(async () => ({ id: 'booked', orderReference: 'LR-TEST', cancellationToken: 'cancel-test' }));
    const bookingPort = {
      checkAvailability: async (input: AvailabilityQuery) => (await evaluateAvailability(input, fakeSupabase(storage))).models,
      insertHold: async (input: InsertHoldInput) => {
        hold = { ...input, id: 'hold-test', createdAt: new Date().toISOString() };
        storage.holds!.push({ vehicle_model_id: input.vehicleModelId, pickup_datetime: input.pickupDatetime,
          dropoff_datetime: input.dropoffDatetime, expires_at: input.expiresAt, session_token: input.sessionToken });
        return hold;
      },
      findActiveHold: async () => hold,
      isOrderReferenceUnique: async () => true,
      insertDirectBooking,
    } as unknown as BookingPort;
    const input = { ...query, vehicleModelId: 'honda-beat', sessionToken: 'customer' };
    const held = await createHold({ bookingPort }, input);
    const configRepo = {
      getVehicleModelById: async () => ({ id: 'honda-beat', name: 'Honda Beat', securityDeposit: 500 }),
      getModelPricing: async () => [{ minDays: 1, maxDays: 99, dailyRate: 500 }],
      getLocations: async () => [],
    } as unknown as ConfigRepository;
    const afterCommit: Array<() => Promise<void>> = [];
    const result = await submitDirectBooking({ bookingPort, configRepo, transferRepo: {} as TransferRepository, afterCommit }, {
      ...input, holdId: held.id, customerName: 'Guest', customerEmail: 'guest@example.invalid', customerMobile: '+639000000000',
      pickupLocationId: 1, dropoffLocationId: 1,
    });
    expect(result.id).toBe('booked');
    expect(result.serverQuote).toBe(1000);
    expect(insertDirectBooking).toHaveBeenCalledWith(expect.objectContaining({ bookingHoldId: held.id, webQuoteRaw: 1000 }));
    expect(afterCommit).toHaveLength(1);
  });

  it('counts the peak of staggered holds', async () => {
    const result = await evaluateAvailability(query, fakeSupabase(data({ holds: [...five(early), ...five(late)] })));
    expect(result.models[0].availableCount).toBe(5);
  });

  it('combines reservations and holds before taking their peak', async () => {
    const result = await evaluateAvailability(query, fakeSupabase(data({ directOrders: five(early), holds: five(late) })));
    expect(result.models[0].availableCount).toBe(5);
    expect(result.explanation.models[0].capacityDeductions).toEqual({ directReservations: 5, holds: 0 });
  });

  it('still blocks ten simultaneous reservations and holds', async () => {
    const result = await evaluateAvailability(query, fakeSupabase(data({ directOrders: five(early), holds: five(early) })));
    expect(result.models[0].availableCount).toBe(0);
    expect(result.explanation.models[0].capacityDeductions).toEqual({ directReservations: 5, holds: 5 });
    expect(result.models[0].holdExpiresAt).toBe(early.expires_at);
  });

  it.each([
    ['16:29', 0], ['16:30', 5],
  ])('respects the 30-minute handover when the next group starts at %s', async (time, expected) => {
    const next = { ...early, pickup_datetime: `2026-07-21T${time}:00+08:00`, dropoff_datetime: '2026-07-22T09:15:00+08:00' };
    const result = await evaluateAvailability(query, fakeSupabase(data({ directOrders: [...five(early), ...five(next)] })));
    expect(result.models[0].availableCount).toBe(expected);
  });

  it('compares equivalent timestamps across offsets', async () => {
    const next = { ...early, pickup_datetime: '2026-07-21T08:30:00.000Z', dropoff_datetime: '2026-07-22T01:15:00.000Z' };
    const result = await evaluateAvailability(query, fakeSupabase(data({ directOrders: [...five(early), ...five(next)] })));
    expect(result.models[0].availableCount).toBe(5);
  });

  it('requires the same bike to remain free throughout the rental', async () => {
    const result = await evaluateAvailability(query, fakeSupabase(data({
      fleet: tenBikes.slice(0, 2),
      orderItems: [early, late].map((period, index) => ({ ...period, id: `item-${index}`, vehicle_id: `beat-${index}`, orders: { status: 'active' } })),
    })));
    expect(result.models[0].availableCount).toBe(0);
  });

  it('excludes the current reservation when assigning its bike', async () => {
    const result = await evaluateAvailability({ ...query, excludeRawOrderId: 'own' }, fakeSupabase(data({
      fleet: tenBikes.slice(0, 1), walkInOrders: [{ ...early, id: 'own', vehicle_id: 'beat-0' }],
    })));
    expect(result.models[0].availableCount).toBe(1);
  });

  it('excludes the customer session without excluding other holds', async () => {
    const result = await evaluateAvailability({ ...query, excludeSessionToken: 'own' }, fakeSupabase(data({
      holds: [{ ...early, session_token: 'own' }, { ...early, session_token: 'other' }],
    })));
    expect(result.models[0].availableCount).toBe(9);
  });

  it('keeps the rental being extended from blocking itself', async () => {
    const result = await evaluateAvailability({ ...query, excludeOrderItemId: 'own' }, fakeSupabase(data({
      fleet: tenBikes.slice(0, 1), orderItems: [{ ...early, id: 'own', vehicle_id: 'beat-0', orders: { status: 'active' } }],
    })));
    expect(result.models[0].availableCount).toBe(1);
  });

  it('releases earlier demand when calculating a shorter rental alternative', async () => {
    const last = { ...early, pickup_datetime: '2026-07-23T12:00:00+08:00', dropoff_datetime: '2026-07-24T09:15:00+08:00' };
    const result = await evaluateAvailability({ ...query, dropoffDatetime: last.dropoff_datetime }, fakeSupabase(data({
      directOrders: [...five(early), ...five(late), ...five(last), ...five(last)],
    })));
    expect(result.models[0].availableUntil).toBe('2026-07-23T03:30:00.000Z');
    expect(result.models[0].availableCount).toBe(0);
  });
});
