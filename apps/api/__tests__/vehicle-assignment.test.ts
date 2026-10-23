import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, error: null as null | { message: string } }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  supabase: { from: (table: string) => result(state.tables[table] ?? []) },
}));

function result(initial: Record<string, unknown>[]) {
  let rows = initial;
  const value = (row: Record<string, unknown>, key: string): unknown => key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)?.[part], row);
  const query = {
    select: () => query,
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(value(row, key))); return query; },
    eq: (key: string, expected: unknown) => { rows = rows.filter((row) => value(row, key) === expected); return query; },
    is: (key: string, expected: unknown) => query.eq(key, expected),
    neq: (key: string, expected: unknown) => { rows = rows.filter((row) => value(row, key) !== expected); return query; },
    not: (key: string, _operator: string, values: string) => { rows = rows.filter((row) => !values.slice(1, -1).split(',').includes(String(value(row, key)))); return query; },
    lt: (key: string, date: string) => { rows = rows.filter((row) => new Date(String(value(row, key))).getTime() < new Date(date).getTime()); return query; },
    gt: (key: string, date: string) => { rows = rows.filter((row) => new Date(String(value(row, key))).getTime() > new Date(date).getTime()); return query; },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: rows, error: state.error }).then(resolve, reject),
  };
  return query;
}

const { assertAssignmentsAvailable } = await import('../src/lib/assert-vehicle-assignment.js');
const assignment = { vehicleId: 'beat', pickupDatetime: '2026-11-01T09:00:00+08:00', dropoffDatetime: '2026-11-03T09:00:00+08:00' };
const item = { id: 'item', order_id: 'order', vehicle_id: 'beat', pickup_datetime: assignment.pickupDatetime, dropoff_datetime: assignment.dropoffDatetime, orders: { status: 'active' } };

describe('vehicle assignment checks', () => {
  beforeEach(() => { state.tables = {}; state.error = null; });

  it('rejects an overlapping active rental', async () => {
    state.tables.order_items = [item];
    await expect(assertAssignmentsAvailable([assignment])).rejects.toThrow('already booked');
  });

  it.each(['cancelled', 'completed'])('ignores %s rentals', async (status) => {
    state.tables.order_items = [{ ...item, orders: { status } }];
    await expect(assertAssignmentsAvailable([assignment])).resolves.toBeUndefined();
  });

  it('does not block an existing order with itself when editing', async () => {
    state.tables.order_items = [item];
    await expect(assertAssignmentsAvailable([assignment], { excludeOrderId: 'order' })).resolves.toBeUndefined();
  });

  it('excludes the raw reservation being activated but still rejects other reservations', async () => {
    state.tables.orders_raw = [{ ...item, id: 'own', status: 'unprocessed' }];
    await expect(assertAssignmentsAvailable([assignment], { excludeRawOrderId: 'own' })).resolves.toBeUndefined();
    state.tables.orders_raw.push({ ...item, id: 'other', status: 'unprocessed' });
    await expect(assertAssignmentsAvailable([assignment], { excludeRawOrderId: 'own' })).rejects.toThrow('already booked');
  });

  it.each([['08:30', false], ['08:31', true]])('handles a previous rental returning at %s', async (time, blocked) => {
    state.tables.order_items = [{ ...item, pickup_datetime: '2026-10-31T09:00:00+08:00', dropoff_datetime: `2026-11-01T${time}:00+08:00` }];
    const check = expect(assertAssignmentsAvailable([assignment]));
    if (blocked) await check.rejects.toThrow('already booked');
    else await check.resolves.toBeUndefined();
  });

  it('protects the handover before a later reservation too', async () => {
    state.tables.order_items = [{ ...item, pickup_datetime: '2026-11-03T09:29:00+08:00', dropoff_datetime: '2026-11-04T09:00:00+08:00' }];
    await expect(assertAssignmentsAvailable([assignment])).rejects.toThrow('already booked');
  });

  it('rejects duplicate overlapping assignments in one request', async () => {
    await expect(assertAssignmentsAvailable([assignment, assignment])).rejects.toThrow('assigned twice');
  });

  it('retains open-ended owner-use protection', async () => {
    state.tables.fleet_unavailability = [{ vehicle_id: 'beat', starts_at: '2026-10-01T09:00:00+08:00', ends_at: null, type: 'owner_use', cancelled_at: null }];
    await expect(assertAssignmentsAvailable([assignment])).rejects.toThrow('owner use');
  });

  it('fails closed when conflict lookup fails', async () => {
    state.error = { message: 'database unavailable' };
    await expect(assertAssignmentsAvailable([assignment])).rejects.toThrow('Rental conflict lookup failed');
  });

  it('rejects invalid dates before querying', async () => {
    await expect(assertAssignmentsAvailable([{ ...assignment, dropoffDatetime: assignment.pickupDatetime }])).rejects.toMatchObject({ statusCode: 422 });
  });
});
