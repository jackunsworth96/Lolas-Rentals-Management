import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));

const { getPartnerCommissionStats, getPartnerCommissionsDue } = await import('../src/lib/partner-commission.js');

type Fixture = {
  commissionType?: 'fixed' | 'percentage';
  commissionValue?: number;
  includesExtensions?: boolean;
  payments?: Array<{ order_id: string; amount: number; settlement_status: string | null; payment_type?: string; refund_revenue_source?: string; refund_affects_rental_revenue?: boolean }>;
  rawStatus?: string;
  orderStatus?: string;
  cancelledReason?: string | null;
  pickupDatetime?: string;
  createdAt?: string;
  advanceBookingDays?: number;
};

function queryResult<T>(data: T) {
  const result = { data, error: null };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    single: vi.fn(async () => result),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function commissionClient(fixture: Fixture = {}) {
  const partner = {
    id: 'partner-1',
    slug: 'bravo-beach-resort',
    store_id: 'store-lolas',
    advance_booking_days: fixture.advanceBookingDays ?? 0,
    commission_type: fixture.commissionType ?? 'percentage',
    commission_value: fixture.commissionValue ?? 10,
    commission_includes_extensions: fixture.includesExtensions ?? true,
  };
  const rawRows = [{
    id: 'raw-1',
    order_reference: 'LR-0720-2C2D',
    customer_name: 'Customer',
    vehicle_model_id: 'beat',
    pickup_datetime: fixture.pickupDatetime ?? '2026-07-20T11:15:00+08:00',
    dropoff_datetime: '2026-07-22T11:15:00+08:00',
    rental_value_raw: 10000,
    web_quote_raw: 10000,
    status: fixture.rawStatus ?? 'processed',
    cancelled_reason: fixture.cancelledReason ?? null,
    cancelled_at: fixture.rawStatus === 'cancelled' ? '2026-07-10T09:00:00+08:00' : null,
    created_at: fixture.createdAt ?? '2026-07-01T00:00:00+08:00',
  }];
  const from = vi.fn((table: string) => {
    switch (table) {
      case 'accommodation_partners':
        return queryResult(partner);
      case 'partner_vehicle_terms':
        return queryResult([]);
      case 'orders_raw':
        return queryResult(rawRows);
      case 'orders':
        return queryResult([{ id: 'order-1', booking_token: 'LR-0720-2C2D', status: fixture.orderStatus ?? 'active' }]);
      case 'order_items':
        return queryResult([{
          order_id: 'order-1',
          dropoff_datetime: '2026-07-28T11:15:00+08:00',
        }]);
      case 'payments':
        return dynamicTable((fixture.payments ?? []).map((p) => ({ payment_type: 'extension', ...p })))();
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  });
  return { from };
}

describe('partner extension commissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds collected extensions to confirmed percentage commission and reports pending commission separately', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      payments: [
        { order_id: 'order-1', amount: 1000, settlement_status: null },
        { order_id: 'order-1', amount: 500, settlement_status: 'pending' },
      ],
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');

    expect(stats.totalCommission).toBe(1100);
    expect(stats.totalPendingCommission).toBe(50);
    expect(stats.bookings[0]).toMatchObject({
      commissionBase: 11000,
      commissionAmount: 1100,
      isExtended: true,
      extendedDropoffDatetime: '2026-07-28T11:15:00+08:00',
      pendingCommissionAmount: 50,
    });
  });

  it('does not accrue extra pending commission for a fixed commission deal', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      commissionType: 'fixed',
      commissionValue: 750,
      payments: [
        { order_id: 'order-1', amount: 1000, settlement_status: null },
        { order_id: 'order-1', amount: 500, settlement_status: 'pending' },
      ],
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');

    expect(stats.totalCommission).toBe(750);
    expect(stats.totalPendingCommission).toBe(0);
    expect(stats.bookings[0]).toMatchObject({
      commissionBase: null,
      commissionAmount: 750,
      isExtended: true,
      pendingCommissionAmount: 0,
    });
  });

  it('keeps fixed commission unchanged for a classified refund', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      commissionType: 'fixed',
      commissionValue: 750,
      payments: [{ order_id: 'order-1', amount: 1000, settlement_status: null, payment_type: 'refund', refund_revenue_source: 'original', refund_affects_rental_revenue: true }],
    }));
    expect((await getPartnerCommissionStats('partner-1', '2026-07')).totalCommission).toBe(750);
  });

  it('deducts only classified rental refunds from percentage commission', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      payments: [
        { order_id: 'order-1', amount: 5115, settlement_status: null },
        { order_id: 'order-1', amount: 3255, settlement_status: null, payment_type: 'refund', refund_revenue_source: 'extension', refund_affects_rental_revenue: true },
        { order_id: 'order-1', amount: 500, settlement_status: null, payment_type: 'refund', refund_revenue_source: 'original', refund_affects_rental_revenue: false },
      ],
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');
    expect(stats.bookings[0]).toMatchObject({
      grossRentalRevenue: 15115,
      eligibleRefundAmount: 3255,
      netRentalRevenue: 11860,
      commissionBase: 11860,
    });
    expect(stats.totalCommission).toBe(1186);
  });

  it('shows the settled order status while keeping the net rental commission', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      rawStatus: 'processed',
      orderStatus: 'completed',
      payments: [{ order_id: 'order-1', amount: 1000, settlement_status: null, payment_type: 'refund', refund_revenue_source: 'original', refund_affects_rental_revenue: true }],
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');
    expect(stats.bookings[0]).toMatchObject({
      status: 'completed',
      grossRentalRevenue: 10000,
      eligibleRefundAmount: 1000,
      netRentalRevenue: 9000,
      commissionBase: 9000,
      commissionAmount: 900,
    });
  });

  it('removes commission when the live order was cancelled after raw processing', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({ rawStatus: 'processed', orderStatus: 'cancelled' }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');
    expect(stats.bookings[0]).toMatchObject({ status: 'cancelled', commissionable: false, commissionAmount: 0 });
  });

  it('uses the current return date for utilization even when extension commission is disabled', async () => {
    const client = commissionClient({
      includesExtensions: false,
      payments: [{ order_id: 'order-1', amount: 1000, settlement_status: 'pending' }],
    });
    mocks.getSupabaseClient.mockReturnValue(client);

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');

    expect(stats.totalCommission).toBe(1000);
    expect(stats.totalPendingCommission).toBe(0);
    expect(stats.bookings[0]).toMatchObject({
      commissionBase: 10000,
      isExtended: false,
      extendedDropoffDatetime: null,
      pendingCommissionAmount: 0,
    });
    expect(stats.averageVehiclesPerDay).toBeCloseTo(8 / 31, 2);
    expect(client.from).toHaveBeenCalledWith('order_items');
    expect(client.from).toHaveBeenCalledWith('payments');
  });

  it('keeps cancelled affiliate bookings visible with their reason and removes all commission', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      rawStatus: 'cancelled',
      cancelledReason: 'Customer changed travel plans',
      payments: [
        { order_id: 'order-1', amount: 1000, settlement_status: null },
        { order_id: 'order-1', amount: 500, settlement_status: 'pending' },
      ],
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');

    expect(stats.totalBookings).toBe(1);
    expect(stats.commissionableBookings).toBe(0);
    expect(stats.totalCommission).toBe(0);
    expect(stats.totalPendingCommission).toBe(0);
    expect(stats.bookings[0]).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'Customer changed travel plans',
      cancelledAt: '2026-07-10T09:00:00+08:00',
      commissionable: false,
      commissionAmount: 0,
      pendingCommissionAmount: 0,
    });
  });
});

describe('partner commission advance-days eligibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is still commissionable when the booking is logged a few minutes after pickup on the same calendar day', async () => {
    // Pickup at 06:45 Manila time; orders_raw row created ~5 minutes later at
    // 06:50 the same day (e.g. an on-site/delivery hand-off logged just after
    // the rental started). Raw millisecond diff would be slightly negative,
    // but same-day should count as 0 days' advance and remain commissionable
    // against a 0-day threshold.
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      pickupDatetime: '2026-07-20T06:45:00+08:00',
      createdAt: '2026-07-20T06:50:35+08:00',
      advanceBookingDays: 0,
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');

    expect(stats.bookings[0]).toMatchObject({
      advanceDays: 0,
      commissionable: true,
    });
    expect(stats.commissionableBookings).toBe(1);
  });

  it('is not commissionable when the booking is logged a calendar day after pickup', async () => {
    mocks.getSupabaseClient.mockReturnValue(commissionClient({
      pickupDatetime: '2026-07-20T23:55:00+08:00',
      createdAt: '2026-07-21T00:05:00+08:00',
      advanceBookingDays: 0,
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');

    expect(stats.bookings[0]).toMatchObject({
      advanceDays: -1,
      commissionable: false,
    });
    expect(stats.commissionableBookings).toBe(0);
  });
});

// ── A filter-aware mock for the month-rollover tests below ──
// Unlike `queryResult` (which ignores its filter args and always returns the
// same canned rows), this mock actually applies eq/in/gte/lt against a fixed
// set of fixture rows per table, so the new carryover-detection queries
// (which rely on real created_at/dropoff_datetime filtering to distinguish
// "this month" from "an earlier month that spills into this month") behave
// like the real database would.
type FilterOp = 'eq' | 'in' | 'gte' | 'lt';
type RecordedFilter = [FilterOp, string, unknown];

function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: RecordedFilter[]): T[] {
  return rows.filter((row) => filters.every(([op, col, val]) => {
    const rowVal = row[col];
    if (op === 'eq') return rowVal === val;
    if (op === 'in') return Array.isArray(val) && (val as unknown[]).includes(rowVal);
    if (op === 'gte') return rowVal != null && new Date(rowVal as string).getTime() >= new Date(val as string).getTime();
    if (op === 'lt') return rowVal != null && new Date(rowVal as string).getTime() < new Date(val as string).getTime();
    return true;
  }));
}

function dynamicTable<T extends Record<string, unknown>>(rows: T[]) {
  return () => {
    const filters: RecordedFilter[] = [];
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      eq: vi.fn((col: string, val: unknown) => { filters.push(['eq', col, val]); return query; }),
      in: vi.fn((col: string, val: unknown) => { filters.push(['in', col, val]); return query; }),
      gte: vi.fn((col: string, val: unknown) => { filters.push(['gte', col, val]); return query; }),
      lt: vi.fn((col: string, val: unknown) => { filters.push(['lt', col, val]); return query; }),
      single: vi.fn(async () => ({ data: applyFilters(rows, filters)[0] ?? null, error: null })),
      then: (
        resolve: (value: { data: T[]; error: null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: applyFilters(rows, filters), error: null }).then(resolve, reject),
    };
    return query;
  };
}

function rolloverClient(opts: {
  partner: Record<string, unknown>;
  vehicleTerms?: Array<Record<string, unknown>>;
  ordersRaw: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  orderItems?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
}) {
  const partnerTable = dynamicTable([opts.partner]);
  const vehicleTermsTable = dynamicTable(opts.vehicleTerms ?? []);
  const ordersRawTable = dynamicTable(opts.ordersRaw);
  const ordersTable = dynamicTable(opts.orders ?? []);
  const orderItemsTable = dynamicTable(opts.orderItems ?? []);
  const paymentsTable = dynamicTable(opts.payments ?? []);
  const from = vi.fn((table: string) => {
    switch (table) {
      case 'accommodation_partners': return partnerTable();
      case 'partner_vehicle_terms': return vehicleTermsTable();
      case 'orders_raw': return ordersRawTable();
      case 'orders': return ordersTable();
      case 'order_items': return orderItemsTable();
      case 'payments': return paymentsTable();
      default: throw new Error(`Unexpected table ${table}`);
    }
  });
  return { from };
}

describe('partner commission month-rollover (proration + carryover)', () => {
  beforeEach(() => vi.clearAllMocks());

  // A booking made Jul 1, picked up Jul 25 for an original 3-night stay
  // (Jul 25 → Jul 28, rental_value_raw 1500 = 500/night), then extended by
  // 8 more nights to Aug 5 for a further 4000 (also 500/night) — so the
  // whole 11-night stay is a clean 500/night blend, split 7 nights in July
  // / 4 nights in August.
  const partner = {
    id: 'partner-1',
    slug: 'bravo-beach-resort',
    store_id: 'store-lolas',
    advance_booking_days: 0,
    commission_type: 'percentage',
    commission_value: 10,
    commission_includes_extensions: true,
  };
  const ordersRawRows = [{
    id: 'raw-ext-1',
    order_reference: 'LR-0725-TEST',
    customer_name: 'Rollover Customer',
    vehicle_model_id: 'beat',
    pickup_datetime: '2026-07-25T00:00:00.000Z',
    dropoff_datetime: '2026-07-28T00:00:00.000Z', // original, unextended
    rental_value_raw: 1500,
    web_quote_raw: 1500,
    status: 'processed',
    cancelled_reason: null,
    cancelled_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    store_id: 'store-lolas',
    partner_ref: 'bravo-beach-resort',
  }];
  const ordersRows = [{ id: 'order-ext-1', booking_token: 'LR-0725-TEST', store_id: 'store-lolas', partner_ref: 'bravo-beach-resort' }];
  const orderItemsRows = [{ order_id: 'order-ext-1', dropoff_datetime: '2026-08-05T00:00:00.000Z' }];
  const paymentsRows = [{ order_id: 'order-ext-1', amount: 4000, settlement_status: null, payment_type: 'extension' }];

  it('prorates commission by nights when an extension spans into the next month', async () => {
    mocks.getSupabaseClient.mockReturnValue(rolloverClient({
      partner, ordersRaw: ordersRawRows, orders: ordersRows, orderItems: orderItemsRows, payments: paymentsRows,
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-07');

    expect(stats.totalBookings).toBe(1);
    expect(stats.commissionableBookings).toBe(1);
    expect(stats.bookings).toHaveLength(1);
    expect(stats.bookings[0]).toMatchObject({
      isCarryover: false,
      isExtended: true,
      commissionBase: 3500,   // 5500 total * 7/11 nights in July
      commissionAmount: 350,  // 10% of 3500
    });
    expect(stats.bookings[0].periodNote).toMatch(/Jul 25.*Aug 1 of 11 total nights; remainder continues into August/);
    expect(stats.totalCommission).toBe(350);
  });

  it('picks up the remaining nights/commission as a carryover row in the following month, without double-counting bookings', async () => {
    mocks.getSupabaseClient.mockReturnValue(rolloverClient({
      partner, ordersRaw: ordersRawRows, orders: ordersRows, orderItems: orderItemsRows, payments: paymentsRows,
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-08');

    // The booking was made (and counted) in July — August must not recount it.
    expect(stats.totalBookings).toBe(0);
    expect(stats.commissionableBookings).toBe(0);
    expect(stats.bookings).toHaveLength(1);
    expect(stats.bookings[0]).toMatchObject({
      isCarryover: true,
      commissionBase: 2000,   // 5500 total * 4/11 nights in August
      commissionAmount: 200,  // 10% of 2000
    });
    expect(stats.bookings[0].periodNote).toMatch(/Continued from Jul 25 booking.*of 11 total nights/);
    expect(stats.totalCommission).toBe(200);
    // 4 of August's nights (Aug 1–5) came from this carried-over booking.
    // (averageVehiclesPerDay is rounded to 2dp by the implementation.)
    expect(stats.averageVehiclesPerDay).toBeCloseTo(4 / 31, 2);

    // 350 (July) + 200 (August) = 550 = 10% of the full 5500 stay — no
    // commission is lost or double-paid across the boundary.
  });

  it('prorates net revenue and shortened vehicle-days across the month boundary', async () => {
    const client = rolloverClient({
      partner,
      ordersRaw: ordersRawRows,
      orders: ordersRows,
      orderItems: [{ order_id: 'order-ext-1', dropoff_datetime: '2026-08-02T00:00:00.000Z' }],
      payments: [
        ...paymentsRows,
        { order_id: 'order-ext-1', amount: 1500, payment_type: 'refund', refund_revenue_source: 'extension', refund_affects_rental_revenue: true },
      ],
    });
    mocks.getSupabaseClient.mockReturnValue(client);

    const july = await getPartnerCommissionStats('partner-1', '2026-07');
    const august = await getPartnerCommissionStats('partner-1', '2026-08');
    expect(july.bookings[0]).toMatchObject({ grossRentalRevenue: 5500, eligibleRefundAmount: 1500, netRentalRevenue: 4000 });
    expect(august.bookings[0]).toMatchObject({ grossRentalRevenue: 5500, eligibleRefundAmount: 1500, netRentalRevenue: 4000 });
    expect(july.totalCommission).toBe(350);
    expect(august.totalCommission).toBe(50);
    expect(august.averageVehiclesPerDay).toBeCloseTo(1 / 31, 2);
  });

  it('rolls a long original (non-extended) booking into the next month too', async () => {
    // No extension involved at all — just a 19-night booking that happens to
    // straddle the boundary. commission_includes_extensions is irrelevant
    // here since there's no `orders`/`order_items`/`payments` data at all.
    const longStayPartner = { ...partner, commission_includes_extensions: false };
    const longStayRaw = [{
      id: 'raw-long-1',
      order_reference: 'LR-0913-LONG',
      customer_name: 'Long Stay Customer',
      vehicle_model_id: 'beat',
      pickup_datetime: '2026-09-13T00:00:00.000Z',
      dropoff_datetime: '2026-10-03T00:00:00.000Z', // 20 nights, no extension
      rental_value_raw: 10000, // 500/night * 20
      web_quote_raw: 10000,
      status: 'processed',
      cancelled_reason: null,
      cancelled_at: null,
      created_at: '2026-09-13T00:00:00.000Z',
      store_id: 'store-lolas',
      partner_ref: 'bravo-beach-resort',
    }];

    mocks.getSupabaseClient.mockReturnValue(rolloverClient({
      partner: longStayPartner, ordersRaw: longStayRaw,
    }));

    const octStats = await getPartnerCommissionStats('partner-1', '2026-10');

    expect(octStats.totalBookings).toBe(0); // made in September, not October
    expect(octStats.bookings).toHaveLength(1);
    expect(octStats.bookings[0]).toMatchObject({
      isCarryover: true,
      commissionBase: 1000, // 10000 * 2/20 nights (Oct 1–3) in October
      commissionAmount: 100,
    });
  });

  it('carries vehicle-days into the next month when extension commission is disabled', async () => {
    mocks.getSupabaseClient.mockReturnValue(rolloverClient({
      partner: { ...partner, commission_includes_extensions: false },
      ordersRaw: ordersRawRows,
      orders: ordersRows,
      orderItems: orderItemsRows,
      payments: paymentsRows,
    }));

    const stats = await getPartnerCommissionStats('partner-1', '2026-08');

    expect(stats.bookings).toHaveLength(1);
    expect(stats.bookings[0].isCarryover).toBe(true);
    expect(stats.totalCommission).toBe(0);
    expect(stats.averageVehiclesPerDay).toBeCloseTo(4 / 31, 2);
  });

  it('uses an early return before the original end for month proration', async () => {
    const raw = [{ ...ordersRawRows[0], dropoff_datetime: '2026-08-05T00:00:00.000Z', rental_value_raw: 5500 }];
    mocks.getSupabaseClient.mockReturnValue(rolloverClient({
      partner: { ...partner, commission_includes_extensions: false },
      ordersRaw: raw,
      orders: ordersRows,
      orderItems: [{ order_id: 'order-ext-1', dropoff_datetime: '2026-07-29T00:00:00.000Z' }],
      payments: [{ order_id: 'order-ext-1', amount: 3500, payment_type: 'refund', refund_revenue_source: 'original', refund_affects_rental_revenue: true }],
    }));

    const july = await getPartnerCommissionStats('partner-1', '2026-07');
    expect(july.bookings[0].dropoffDatetime).toBe('2026-07-29T00:00:00.000Z');
    const august = await getPartnerCommissionStats('partner-1', '2026-08');
    expect(august.bookings).toHaveLength(0);
    expect(august.totalCommission).toBe(0);
    expect(august.averageVehiclesPerDay).toBe(0);
  });
});

describe('consolidated partner commissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a single payout ledger with confirmed and pending totals', async () => {
    let partnerQueryCount = 0;
    const baseClient = commissionClient({
      payments: [
        { order_id: 'order-1', amount: 1000, settlement_status: null },
        { order_id: 'order-1', amount: 500, settlement_status: 'pending' },
      ],
    });
    const from = vi.fn((table: string) => {
      if (table === 'accommodation_partners') {
        partnerQueryCount += 1;
        if (partnerQueryCount === 1) {
          return queryResult([{
            id: 'partner-1',
            name: 'Bravo Beach Resort',
            contact_name: 'Carla',
            contact_email: 'carla@example.com',
          }]);
        }
      }
      return baseClient.from(table);
    });
    mocks.getSupabaseClient.mockReturnValue({ from });

    const result = await getPartnerCommissionsDue('store-lolas', '2026-07');

    expect(result).toMatchObject({
      month: '2026-07',
      totalDue: 1100,
      totalPending: 50,
      partnersDue: 1,
      partners: [{
        partnerId: 'partner-1',
        partnerName: 'Bravo Beach Resort',
        commissionableBookings: 1,
        amountDue: 1100,
        pendingAmount: 50,
      }],
    });
  });
});
