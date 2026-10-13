import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));

const { previewAssignPartnerToOrder } = await import('../src/use-cases/orders/assign-partner-to-order.js');

type TableData = Record<string, unknown>;

/** Chainable query stub: every `.eq/.in/.or/.order` call returns itself; the
 * terminal `.single()`/`.maybeSingle()` resolve the configured row, and
 * awaiting the builder directly (no terminal call) resolves the configured
 * list — mirrors how apps/api/__tests__/partner-commission.test.ts stubs
 * the Supabase client. */
function queryResult(data: unknown) {
  const result = { data, error: null };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function buildClient(tables: TableData) {
  const from = vi.fn((table: string) => {
    if (!(table in tables)) throw new Error(`Unexpected table ${table}`);
    return queryResult(tables[table]);
  });
  return { from };
}

const basePartner = {
  id: 'partner-1',
  slug: 'bravo-beach-resort',
  name: 'Bravo Beach Resort',
  store_id: 'store-lolas',
  deal_type: 'discount_delivery' as const,
  discount_type: 'percentage' as const,
  discount_value: 10,
  free_delivery: true,
  free_delivery_location_ids: null,
  advance_discount_days: null,
  early_bird_days: null,
  early_bird_discount_value: null,
  status: 'active',
  active: true,
};

const baseOrder = {
  id: 'order-1',
  store_id: 'store-lolas',
  status: 'active',
  partner_ref: null,
  final_total: 11300,
  booking_token: 'LR-0720-2C2D',
  created_at: '2026-07-01T00:00:00+08:00',
};

const baseItem = {
  id: 'item-1',
  vehicle_id: 'veh-1',
  vehicle_model_id: 'honda-beat',
  rental_rate: 500,
  daily_rate: null,
  rental_days_count: 20,
  rental_days: null,
  pickup_fee: 300,
  dropoff_fee: 300,
  discount: 0,
  pickup_location: 'Bravo Beach Resort',
  dropoff_location: 'Bravo Beach Resort',
  pickup_location_id: 2,
  dropoff_location_id: 2,
  pickup_datetime: '2026-07-20T11:15:00+08:00',
};

describe('previewAssignPartnerToOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes the rental + delivery discount the partner would have granted at booking time', async () => {
    mocks.getSupabaseClient.mockReturnValue(buildClient({
      orders: baseOrder,
      orders_raw: null,
      order_items: [baseItem],
      accommodation_partners: basePartner,
      partner_vehicle_terms: [],
      payments: [{ amount: 11300, payment_type: 'rental', settlement_status: null, payment_method_id: 'cash' }],
    }));

    const preview = await previewAssignPartnerToOrder({ orderId: 'order-1', partnerSlug: 'bravo-beach-resort' });

    // Rental subtotal 500 * 20 = 10,000 → 10% off = 1,000.
    expect(preview.rentalDiscount).toBe(1000);
    // Free delivery at an allowed (unrestricted) location waives both fees: 300 + 300.
    expect(preview.deliveryDiscount).toBe(600);
    expect(preview.totalDiscount).toBe(1600);
    expect(preview.currentFinalTotal).toBe(11300);
    expect(preview.newFinalTotal).toBe(9700);
    // Already paid the full original 11,300 → new total is lower than what was collected.
    expect(preview.totalPaid).toBe(11300);
    expect(preview.overpaidAmount).toBe(1600);
  });

  it('does not waive delivery fees outside the partner\'s free-delivery location allowlist', async () => {
    mocks.getSupabaseClient.mockReturnValue(buildClient({
      orders: baseOrder,
      orders_raw: null,
      order_items: [{ ...baseItem, pickup_location_id: 9, dropoff_location_id: 9 }],
      accommodation_partners: { ...basePartner, free_delivery_location_ids: [2] },
      partner_vehicle_terms: [],
      payments: [],
    }));

    const preview = await previewAssignPartnerToOrder({ orderId: 'order-1', partnerSlug: 'bravo-beach-resort' });

    expect(preview.deliveryDiscount).toBe(0);
    expect(preview.rentalDiscount).toBe(1000);
    expect(preview.overpaidAmount).toBe(0);
  });

  it('refuses to compute a preview when the order already has a partner', async () => {
    mocks.getSupabaseClient.mockReturnValue(buildClient({
      orders: { ...baseOrder, partner_ref: 'some-other-partner' },
      orders_raw: null,
      order_items: [baseItem],
      accommodation_partners: basePartner,
      partner_vehicle_terms: [],
      payments: [],
    }));

    await expect(
      previewAssignPartnerToOrder({ orderId: 'order-1', partnerSlug: 'bravo-beach-resort' }),
    ).rejects.toThrow(/already has a partner/i);
  });

  it('refuses a partner from a different store', async () => {
    mocks.getSupabaseClient.mockReturnValue(buildClient({
      orders: baseOrder,
      orders_raw: null,
      order_items: [baseItem],
      accommodation_partners: { ...basePartner, store_id: 'store-other' },
      partner_vehicle_terms: [],
      payments: [],
    }));

    await expect(
      previewAssignPartnerToOrder({ orderId: 'order-1', partnerSlug: 'bravo-beach-resort' }),
    ).rejects.toThrow(/active partner in this store/i);
  });

  it('refuses to assign a partner to a cancelled order', async () => {
    mocks.getSupabaseClient.mockReturnValue(buildClient({
      orders: { ...baseOrder, status: 'cancelled' },
      orders_raw: null,
      order_items: [baseItem],
      accommodation_partners: basePartner,
      partner_vehicle_terms: [],
      payments: [],
    }));

    await expect(
      previewAssignPartnerToOrder({ orderId: 'order-1', partnerSlug: 'bravo-beach-resort' }),
    ).rejects.toThrow(/cancelled/i);
  });
});
