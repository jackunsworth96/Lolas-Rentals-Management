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
      eq: () => query,
      lte: () => query,
      gte: () => query,
      order: () => query,
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
          ? [{ id: 'vehicle', name: 'Vehicle', store_id: 'store', status: 'Available', rentable_start_date: null, date_sold: null }]
          : table === 'order_items'
            ? ids.map((order_id) => ({
                order_id,
                vehicle_id: 'vehicle',
                rental_days_count: 1,
                rental_rate: 10,
                pickup_fee: 0,
                dropoff_fee: 0,
                discount: 0,
                pickup_datetime: '2026-10-15T00:00:00+08:00',
                dropoff_datetime: '2026-10-16T00:00:00+08:00',
              }))
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

/** Builds a from() mock with explicit per-table fixtures for the finer-grained tests below. */
function mockTables(options: {
  fleet?: Array<Record<string, unknown>>;
  orderItems?: Array<Record<string, unknown>>;
  orders?: Array<{ id: string; status: string }>;
  maintenance?: Array<Record<string, unknown>>;
  orderAddons?: Array<Record<string, unknown>>;
}) {
  const fleet = options.fleet ?? [{ id: 'vehicle', name: 'Vehicle', store_id: 'store', status: 'Available', rentable_start_date: null, date_sold: null }];
  const orderItems = options.orderItems ?? [];
  const orders = options.orders ?? [];
  const maintenance = options.maintenance ?? [];
  const orderAddons = options.orderAddons ?? [];
  from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      lte: () => query,
      gte: () => query,
      order: () => query,
      in: () => query,
      not: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'fleet') return Promise.resolve(resolve({ data: fleet, error: null }));
        if (table === 'order_items') return Promise.resolve(resolve({ data: orderItems, error: null }));
        if (table === 'orders') return Promise.resolve(resolve({ data: orders, error: null }));
        if (table === 'maintenance') return Promise.resolve(resolve({ data: maintenance, error: null }));
        if (table === 'order_addons') return Promise.resolve(resolve({ data: orderAddons, error: null }));
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };
    return query;
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

it('prorates a booking that spans before the period start, counting only the in-period days', async () => {
  // Booking runs Sep 25 -> Oct 10 (15 days total), period is Oct 1 -> Oct 11 (10 days).
  // Only the 9 days from Oct 1 (inclusive) to Oct 10 should count toward this period.
  mockTables({
    orderItems: [{
      order_id: 'o1',
      vehicle_id: 'vehicle',
      rental_days_count: 15,
      rental_rate: 100,
      pickup_fee: 50,
      dropoff_fee: 50,
      discount: 150,
      pickup_datetime: '2026-09-25T00:00:00+08:00',
      dropoff_datetime: '2026-10-10T00:00:00+08:00',
    }],
    orders: [{ id: 'o1', status: 'completed' }],
  });
  const result = await getFleetUtilization('2026-10-01', '2026-10-11', undefined, false);
  expect(result.vehicles[0].rentalDays).toBe(9);
  // Rate revenue prorated to 9/15 days (900), discount prorated to 9/15 (90), dropoff fee
  // in-period (dropoff lands Oct 10, inside the window) but pickup fee excluded (pickup was Sep 25).
  expect(result.vehicles[0].revenue).toBeCloseTo(900 + 50 - 90, 2);
});

it('does not inflate rental days beyond the booking length when the whole booking is outside a wider period', async () => {
  mockTables({
    orderItems: [{
      order_id: 'o1',
      vehicle_id: 'vehicle',
      rental_days_count: 3,
      rental_rate: 100,
      pickup_fee: 0,
      dropoff_fee: 0,
      discount: 0,
      pickup_datetime: '2025-01-01T00:00:00+08:00',
      dropoff_datetime: '2025-01-04T00:00:00+08:00',
    }],
    orders: [{ id: 'o1', status: 'completed' }],
  });
  // Period doesn't overlap the booking at all — should be excluded entirely, not counted.
  const result = await getFleetUtilization('2026-10-01', '2026-10-31', undefined, false);
  expect(result.vehicles[0].rentalDays).toBe(0);
  expect(result.vehicles[0].revenue).toBe(0);
});

it('excludes a vehicle sold entirely before the period and prorates one sold mid-period', async () => {
  mockTables({
    fleet: [
      { id: 'sold-before', name: 'Sold Before', store_id: 'store', status: 'Sold', rentable_start_date: null, date_sold: '2026-09-01' },
      { id: 'sold-mid', name: 'Sold Mid', store_id: 'store', status: 'Sold', rentable_start_date: null, date_sold: '2026-10-11' },
    ],
  });
  const result = await getFleetUtilization('2026-10-01', '2026-10-21', undefined, false);
  const ids = result.vehicles.map((v) => v.vehicleId);
  expect(ids).not.toContain('sold-before');
  expect(ids).toContain('sold-mid');
  const soldMid = result.vehicles.find((v) => v.vehicleId === 'sold-mid')!;
  // Period is 20 days (Oct 1 -> Oct 21), vehicle only active through Oct 11 -> 10 active days.
  expect(soldMid.activeDays).toBe(10);
});

it('excludes a vehicle not yet rentable by period end and prorates one that becomes rentable mid-period', async () => {
  mockTables({
    fleet: [
      { id: 'too-new', name: 'Too New', store_id: 'store', status: 'Available', rentable_start_date: '2026-11-01', date_sold: null },
      { id: 'new-mid', name: 'New Mid', store_id: 'store', status: 'Available', rentable_start_date: '2026-10-11', date_sold: null },
    ],
  });
  const result = await getFleetUtilization('2026-10-01', '2026-10-21', undefined, false);
  const ids = result.vehicles.map((v) => v.vehicleId);
  expect(ids).not.toContain('too-new');
  expect(ids).toContain('new-mid');
  const newMid = result.vehicles.find((v) => v.vehicleId === 'new-mid')!;
  expect(newMid.activeDays).toBe(10);
});

it('prorates a per_day addon by the share of booking days that fall in this period', async () => {
  // Same spanning booking as the earlier proration test: 15 total days, 9 in-period.
  mockTables({
    orderItems: [{
      order_id: 'o1',
      vehicle_id: 'vehicle',
      rental_days_count: 15,
      rental_rate: 0,
      pickup_fee: 0,
      dropoff_fee: 0,
      discount: 0,
      pickup_datetime: '2026-09-25T00:00:00+08:00',
      dropoff_datetime: '2026-10-10T00:00:00+08:00',
    }],
    orders: [{ id: 'o1', status: 'completed' }],
    orderAddons: [{ order_id: 'o1', addon_type: 'per_day', total_amount: 150, added_at: '2026-09-25T00:00:00+08:00' }],
  });
  const result = await getFleetUtilization('2026-10-01', '2026-10-11', undefined, false);
  // 150 total across 15 booked days = 10/day; 9 days fall in this period = 90.
  expect(result.vehicles[0].revenue).toBeCloseTo(90, 2);
});

it('only attributes a one_time addon to the period it was actually added in', async () => {
  mockTables({
    orderItems: [{
      order_id: 'o1',
      vehicle_id: 'vehicle',
      rental_days_count: 5,
      rental_rate: 0,
      pickup_fee: 0,
      dropoff_fee: 0,
      discount: 0,
      pickup_datetime: '2026-10-01T00:00:00+08:00',
      dropoff_datetime: '2026-10-06T00:00:00+08:00',
    }],
    orders: [{ id: 'o1', status: 'completed' }],
    orderAddons: [
      { order_id: 'o1', addon_type: 'one_time', total_amount: 75, added_at: '2026-10-02T00:00:00+08:00' },
      { order_id: 'o1', addon_type: 'one_time', total_amount: 999, added_at: '2026-11-15T00:00:00+08:00' },
    ],
  });
  const result = await getFleetUtilization('2026-10-01', '2026-10-11', undefined, false);
  expect(result.vehicles[0].revenue).toBeCloseTo(75, 2);
});

it('splits an addon evenly across vehicles on a multi-vehicle order', async () => {
  mockTables({
    fleet: [
      { id: 'van-a', name: 'Van A', store_id: 'store', status: 'Available', rentable_start_date: null, date_sold: null },
      { id: 'van-b', name: 'Van B', store_id: 'store', status: 'Available', rentable_start_date: null, date_sold: null },
    ],
    orderItems: [
      { order_id: 'o1', vehicle_id: 'van-a', rental_days_count: 5, rental_rate: 0, pickup_fee: 0, dropoff_fee: 0, discount: 0, pickup_datetime: '2026-10-01T00:00:00+08:00', dropoff_datetime: '2026-10-06T00:00:00+08:00' },
      { order_id: 'o1', vehicle_id: 'van-b', rental_days_count: 5, rental_rate: 0, pickup_fee: 0, dropoff_fee: 0, discount: 0, pickup_datetime: '2026-10-01T00:00:00+08:00', dropoff_datetime: '2026-10-06T00:00:00+08:00' },
    ],
    orders: [{ id: 'o1', status: 'completed' }],
    orderAddons: [{ order_id: 'o1', addon_type: 'one_time', total_amount: 100, added_at: '2026-10-02T00:00:00+08:00' }],
  });
  const result = await getFleetUtilization('2026-10-01', '2026-10-11', undefined, false);
  const vanA = result.vehicles.find((v) => v.vehicleId === 'van-a')!;
  const vanB = result.vehicles.find((v) => v.vehicleId === 'van-b')!;
  expect(vanA.revenue).toBeCloseTo(50, 2);
  expect(vanB.revenue).toBeCloseTo(50, 2);
});

it('counts ongoing maintenance (no downtime_end yet) through the end of the period', async () => {
  mockTables({
    maintenance: [{
      asset_id: 'vehicle',
      downtime_start: '2026-10-05T00:00:00Z',
      downtime_end: null,
      total_downtime_days: null,
    }],
  });
  const result = await getFleetUtilization('2026-10-01', '2026-10-11', undefined, false);
  // Downtime from Oct 5 through period end Oct 11 = 6 days.
  expect(result.vehicles[0].downtimeDays).toBe(6);
  expect(result.fleetKpis.totalDowntimeDays).toBe(6);
});
