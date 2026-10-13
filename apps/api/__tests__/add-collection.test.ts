import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Order, OrderStatus, Money } from '@lolas/domain';
import type { OrderItem } from '@lolas/domain';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));

const { addCollection } = await import('../src/use-cases/orders/add-collection.js');

type TableData = Record<string, unknown>;

/** Chainable query stub mirroring apps/api/__tests__/assign-partner-to-order.test.ts,
 * extended with `.update()` so order_items/orders_raw writes resolve cleanly. */
function queryResult(data: unknown) {
  const result = { data, error: null };
  const query = {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
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

function buildOrder(overrides: Partial<{ bookingToken: string | null }> = {}) {
  return Order.create({
    id: 'order-1',
    storeId: 'store-lolas',
    wooOrderId: null,
    customerId: 'cust-1',
    employeeId: null,
    orderDate: '2026-07-01',
    status: OrderStatus.Active,
    webNotes: null,
    quantity: 1,
    webQuoteRaw: null,
    securityDeposit: Money.zero(),
    depositStatus: null,
    cardFeeSurcharge: Money.zero(),
    returnCharges: Money.zero(),
    finalTotal: Money.php(10000),
    balanceDue: Money.php(0),
    paymentMethodId: null,
    depositMethodId: null,
    bookingToken: overrides.bookingToken ?? 'LR-0720-2C2D',
    tips: Money.zero(),
    charityDonation: Money.zero(),
    addons: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

const baseItem: OrderItem = {
  id: 'item-1',
  storeId: 'store-lolas',
  orderId: 'order-1',
  vehicleId: 'veh-1',
  vehicleName: 'Toffee',
  pickupDatetime: '2026-07-20T11:15:00+08:00',
  dropoffDatetime: '2026-07-22T11:15:00+08:00',
  rentalDaysCount: 2,
  pickupLocation: 'General Luna',
  dropoffLocation: 'General Luna',
  pickupFee: 0,
  dropoffFee: 0,
  rentalRate: 500,
  helmetNumbers: null,
  discount: 0,
  opsNotes: null,
  returnCondition: null,
};

const collectionLocation = {
  id: 5,
  name: 'Bravo Beach Resort',
  deliveryCost: 300,
  collectionCost: 300,
  locationType: null,
  storeId: 'store-lolas',
  isActive: true,
};

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

function buildDeps(opts: {
  order: Order;
  item: OrderItem;
  locations: Array<Record<string, unknown>>;
  partnerRef?: string | null;
  partnerRow?: Record<string, unknown> | null;
}) {
  const orderRepo = {
    findById: vi.fn(async () => opts.order),
    save: vi.fn(async () => {}),
  };
  const orderItemRepo = {
    findByOrderId: vi.fn(async () => [opts.item]),
  };
  const fleetRepo = {
    findById: vi.fn(async () => ({ id: opts.item.vehicleId, modelId: 'honda-beat' })),
  };
  const configRepo = {
    getLocations: vi.fn(async () => opts.locations),
  };
  const paymentRepo = {
    save: vi.fn(async () => {}),
    findByOrderId: vi.fn(async () => []),
  };
  const accountingPort = {
    createTransaction: vi.fn(async () => {}),
  };
  const cardSettlementRepo = {
    save: vi.fn(async () => {}),
  };

  mocks.getSupabaseClient.mockReturnValue(buildClient({
    orders: { partner_ref: opts.partnerRef ?? null },
    order_items: null,
    orders_raw: null,
    accommodation_partners: opts.partnerRow ?? null,
    partner_vehicle_terms: [],
  }));

  return {
    deps: { orderRepo, orderItemRepo, fleetRepo, paymentRepo, accountingPort, cardSettlementRepo, configRepo } as never,
    orderRepo, orderItemRepo, paymentRepo, accountingPort,
  };
}

describe('addCollection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('charges the configured collection fee as a pending balance when no payment method is given', async () => {
    const order = buildOrder();
    const { deps, orderRepo, paymentRepo } = buildDeps({
      order, item: baseItem, locations: [collectionLocation],
    });

    const result = await addCollection(deps, {
      orderId: 'order-1', orderItemId: 'item-1', locationId: 5,
    });

    expect(result.isFree).toBe(false);
    expect(result.fee).toBe(300);
    expect(result.delta).toBe(300);
    expect(result.locationName).toBe('Bravo Beach Resort');
    // final_total/balance_due both increase by the fee (pending charge).
    expect(result.finalTotal).toBe(10300);
    expect(result.balanceDue).toBe(300);
    expect(orderRepo.save).toHaveBeenCalledTimes(1);

    const payment = paymentRepo.save.mock.calls[0][0];
    expect(payment.amount).toBe(300);
    expect(payment.paymentMethodId).toBe('pending');
    expect(payment.settlementStatus).toBe('pending');
    expect(payment.settlementRef).toContain('Bravo Beach Resort');
  });

  it('waives the fee when the order\'s partner benefit grants free collection at that location', async () => {
    const order = buildOrder();
    const { deps, paymentRepo } = buildDeps({
      order, item: baseItem, locations: [collectionLocation],
      partnerRef: 'bravo-beach-resort', partnerRow: basePartner,
    });

    const result = await addCollection(deps, {
      orderId: 'order-1', orderItemId: 'item-1', locationId: 5,
    });

    expect(result.isFree).toBe(true);
    expect(result.fee).toBe(0);
    expect(result.delta).toBe(0);
    expect(result.freeReason).toMatch(/Bravo Beach Resort/);
    expect(result.finalTotal).toBe(10000);
    // No charge should be recorded when the fee is fully waived.
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('does not waive the fee when the partner\'s free-delivery allowlist excludes the location', async () => {
    const order = buildOrder();
    const { deps } = buildDeps({
      order, item: baseItem, locations: [collectionLocation],
      partnerRef: 'bravo-beach-resort',
      partnerRow: { ...basePartner, free_delivery_location_ids: [999] },
    });

    const result = await addCollection(deps, {
      orderId: 'order-1', orderItemId: 'item-1', locationId: 5,
    });

    expect(result.isFree).toBe(false);
    expect(result.fee).toBe(300);
  });

  it('records an immediate payment when a payment method is provided', async () => {
    const order = buildOrder();
    const { deps, paymentRepo, accountingPort } = buildDeps({
      order, item: baseItem, locations: [collectionLocation],
    });

    const result = await addCollection(deps, {
      orderId: 'order-1', orderItemId: 'item-1', locationId: 5,
      paymentMethodId: 'cash', accountId: 'acct-cash', receivableAccountId: 'acct-receivable',
    });

    expect(result.fee).toBe(300);
    const payment = paymentRepo.save.mock.calls[0][0];
    expect(payment.paymentMethodId).toBe('cash');
    expect(payment.settlementStatus).toBeNull();
    expect(accountingPort.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws when the chosen location is not found or inactive', async () => {
    const order = buildOrder();
    const { deps } = buildDeps({
      order, item: baseItem, locations: [{ ...collectionLocation, isActive: false }],
    });

    await expect(
      addCollection(deps, { orderId: 'order-1', orderItemId: 'item-1', locationId: 5 }),
    ).rejects.toThrow(/not found or is no longer active/i);
  });

  it('throws when the order item does not belong to the order', async () => {
    const order = buildOrder();
    const { deps } = buildDeps({
      order, item: baseItem, locations: [collectionLocation],
    });

    await expect(
      addCollection(deps, { orderId: 'order-1', orderItemId: 'missing-item', locationId: 5 }),
    ).rejects.toThrow(/not found on this order/i);
  });
});
