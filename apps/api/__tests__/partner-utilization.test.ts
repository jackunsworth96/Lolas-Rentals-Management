import { afterEach, expect, it, vi } from 'vitest';
import { getPartnerUtilization } from '../src/use-cases/partners/get-partner-utilization.js';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => ({ from }),
}));

afterEach(() => vi.restoreAllMocks());

/** Builds a from() mock with explicit per-table fixtures. */
function mockTables(options: {
  partners?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  orderItems?: Array<Record<string, unknown>>;
  orderAddons?: Array<Record<string, unknown>>;
  allocationSettings?: Array<Record<string, unknown>>;
  allocations?: Array<Record<string, unknown>>;
  allocationOverrides?: Array<Record<string, unknown>>;
  capacityReservations?: Array<Record<string, unknown>>;
}) {
  const partners = options.partners ?? [{ id: 'p1', name: 'Hotel A', slug: 'hotel-a', store_id: 'store' }];
  const orders = options.orders ?? [];
  const orderItems = options.orderItems ?? [];
  const orderAddons = options.orderAddons ?? [];
  const allocationSettings = options.allocationSettings ?? [];
  const allocations = options.allocations ?? [];
  const allocationOverrides = options.allocationOverrides ?? [];
  const capacityReservations = options.capacityReservations ?? [];

  from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      is: () => query,
      not: () => query,
      lt: () => query,
      gt: () => query,
      lte: () => query,
      gte: () => query,
      order: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'accommodation_partners') return Promise.resolve(resolve({ data: partners, error: null }));
        if (table === 'orders') return Promise.resolve(resolve({ data: orders, error: null }));
        if (table === 'order_items') return Promise.resolve(resolve({ data: orderItems, error: null }));
        if (table === 'order_addons') return Promise.resolve(resolve({ data: orderAddons, error: null }));
        if (table === 'partner_allocation_settings') return Promise.resolve(resolve({ data: allocationSettings, error: null }));
        if (table === 'partner_allocations') return Promise.resolve(resolve({ data: allocations, error: null }));
        if (table === 'partner_allocation_overrides') return Promise.resolve(resolve({ data: allocationOverrides, error: null }));
        if (table === 'capacity_reservations') return Promise.resolve(resolve({ data: capacityReservations, error: null }));
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };
    return query;
  });
}

it('returns no partners when none match the store filter', async () => {
  mockTables({ partners: [] });
  const result = await getPartnerUtilization('2026-10-01', '2026-10-11');
  expect(result.partners).toEqual([]);
});

it('sums rental days and revenue for a partner from their referred, in-period bookings', async () => {
  mockTables({
    orders: [{ id: 'o1', partner_ref: 'hotel-a' }],
    orderItems: [{
      id: 'oi1',
      order_id: 'o1',
      rental_days_count: 5,
      rental_rate: 100,
      pickup_fee: 0,
      dropoff_fee: 0,
      discount: 0,
      pickup_datetime: '2026-10-01T00:00:00+08:00',
      dropoff_datetime: '2026-10-06T00:00:00+08:00',
    }],
  });
  const result = await getPartnerUtilization('2026-10-01', '2026-10-11');
  expect(result.partners).toHaveLength(1);
  expect(result.partners[0].partnerName).toBe('Hotel A');
  expect(result.partners[0].bookingsCount).toBe(1);
  expect(result.partners[0].rentalDays).toBe(5);
  expect(result.partners[0].revenue).toBeCloseTo(500, 2);
});

it('prorates a booking spanning the period boundary, same as fleet utilization', async () => {
  mockTables({
    orders: [{ id: 'o1', partner_ref: 'hotel-a' }],
    orderItems: [{
      id: 'oi1',
      order_id: 'o1',
      rental_days_count: 15,
      rental_rate: 100,
      pickup_fee: 0,
      dropoff_fee: 0,
      discount: 0,
      pickup_datetime: '2026-09-25T00:00:00+08:00',
      dropoff_datetime: '2026-10-10T00:00:00+08:00',
    }],
  });
  const result = await getPartnerUtilization('2026-10-01', '2026-10-11');
  expect(result.partners[0].rentalDays).toBe(9);
  expect(result.partners[0].revenue).toBeCloseTo(900, 2);
});

it('includes add-on revenue attributed to the partner', async () => {
  mockTables({
    orders: [{ id: 'o1', partner_ref: 'hotel-a' }],
    orderItems: [{
      id: 'oi1',
      order_id: 'o1',
      rental_days_count: 5,
      rental_rate: 0,
      pickup_fee: 0,
      dropoff_fee: 0,
      discount: 0,
      pickup_datetime: '2026-10-01T00:00:00+08:00',
      dropoff_datetime: '2026-10-06T00:00:00+08:00',
    }],
    orderAddons: [{ order_id: 'o1', addon_type: 'one_time', total_amount: 80, added_at: '2026-10-02T00:00:00+08:00' }],
  });
  const result = await getPartnerUtilization('2026-10-01', '2026-10-11');
  expect(result.partners[0].revenue).toBeCloseTo(80, 2);
});

it('counts bookings from multiple partners separately and ignores bookings from other partners', async () => {
  mockTables({
    partners: [
      { id: 'p1', name: 'Hotel A', slug: 'hotel-a', store_id: 'store' },
      { id: 'p2', name: 'Hotel B', slug: 'hotel-b', store_id: 'store' },
    ],
    orders: [
      { id: 'o1', partner_ref: 'hotel-a' },
      { id: 'o2', partner_ref: 'hotel-b' },
    ],
    orderItems: [
      { id: 'oi1', order_id: 'o1', rental_days_count: 2, rental_rate: 50, pickup_fee: 0, dropoff_fee: 0, discount: 0, pickup_datetime: '2026-10-02T00:00:00+08:00', dropoff_datetime: '2026-10-04T00:00:00+08:00' },
      { id: 'oi2', order_id: 'o2', rental_days_count: 4, rental_rate: 50, pickup_fee: 0, dropoff_fee: 0, discount: 0, pickup_datetime: '2026-10-02T00:00:00+08:00', dropoff_datetime: '2026-10-06T00:00:00+08:00' },
    ],
  });
  const result = await getPartnerUtilization('2026-10-01', '2026-10-11');
  const a = result.partners.find((p) => p.partnerId === 'p1')!;
  const b = result.partners.find((p) => p.partnerId === 'p2')!;
  expect(a.rentalDays).toBe(2);
  expect(b.rentalDays).toBe(4);
});

it('attaches guaranteed-quota usage only for partners whose store has allocations enabled', async () => {
  mockTables({
    partners: [{ id: 'p1', name: 'Hotel A', slug: 'hotel-a', store_id: 'store' }],
    allocationSettings: [{ store_id: 'store', enabled: true }],
    allocations: [{ partner_id: 'p1', vehicle_type: 'bike', effective_month: '2026-10-01', scheduled_qty: 2 }],
    allocationOverrides: [],
    capacityReservations: [],
  });
  const result = await getPartnerUtilization('2026-10-01', '2026-10-02');
  expect(result.partners[0].quota).toHaveLength(1);
  expect(result.partners[0].quota[0].vehicleType).toBe('bike');
  expect(result.partners[0].quota[0].allocatedHours).toBeGreaterThan(0);
  expect(result.partners[0].quota[0].guaranteedHours).toBe(0);
});

it('omits quota entirely when the store has not enabled Protected allocations', async () => {
  mockTables({
    partners: [{ id: 'p1', name: 'Hotel A', slug: 'hotel-a', store_id: 'store' }],
    allocationSettings: [{ store_id: 'store', enabled: false }],
    allocations: [{ partner_id: 'p1', vehicle_type: 'bike', effective_month: '2026-10-01', scheduled_qty: 2 }],
  });
  const result = await getPartnerUtilization('2026-10-01', '2026-10-02');
  expect(result.partners[0].quota).toEqual([]);
});
