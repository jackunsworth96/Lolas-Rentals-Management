import { afterEach, expect, it, vi } from 'vitest';
import { getFleetUtilization } from '../src/use-cases/fleet/get-utilization.js';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => ({ from }),
}));

afterEach(() => vi.restoreAllMocks());

function mockFleet(orderCount: number, failBatch = -1) {
  const ids = Array.from({ length: orderCount }, (_, i) => `order-${i}`);
  const batches: string[][] = [];
  from.mockImplementation((table: string) => {
    let batch: string[] = [];
    const query = {
      select: () => query,
      in: (column: string, values: string[]) => {
        if (table === 'orders' && column === 'id') batch = values;
        return query;
      },
      not: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'orders') {
          batches.push(batch);
          if (batches.length === failBatch) return Promise.resolve(resolve({ data: null, error: { message: 'fetch failed' } }));
          expect(batch.length).toBeLessThanOrEqual(100);
          return Promise.resolve(resolve({ data: batch.map((id) => ({ id, status: 'active' })), error: null }));
        }
        const data = table === 'fleet'
          ? [{ id: 'vehicle', name: 'Vehicle', store_id: 'store', status: 'Available' }]
          : table === 'order_items'
            ? ids.map((order_id) => ({ order_id, vehicle_id: 'vehicle', rental_days_count: 1, rental_rate: 10 }))
            : [];
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return query;
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return { ids, batches };
}

it.each([0, 1, 205])('retains totals across bounded orders queries for %i orders', async (count) => {
  const { ids, batches } = mockFleet(count);
  const result = await getFleetUtilization('2026-10-01', '2026-10-31', undefined, false);
  expect(batches).toHaveLength(Math.ceil(count / 100));
  expect(batches.flat()).toEqual(ids);
  expect(result.fleetKpis.totalRentalDays).toBe(count);
  expect(result.fleetKpis.totalRevenue).toBe(count * 10);
});

it('rejects a failed later batch instead of returning partial totals', async () => {
  mockFleet(205, 2);
  await expect(getFleetUtilization('2026-10-01', '2026-10-31', undefined, false))
    .rejects.toThrow('Orders query failed: fetch failed');
});
