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
  payments?: Array<{ order_id: string; amount: number; settlement_status: string | null }>;
  rawStatus?: string;
  cancelledReason?: string | null;
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
    advance_booking_days: 0,
    commission_type: fixture.commissionType ?? 'percentage',
    commission_value: fixture.commissionValue ?? 10,
    commission_includes_extensions: fixture.includesExtensions ?? true,
  };
  const rawRows = [{
    id: 'raw-1',
    order_reference: 'LR-0720-2C2D',
    customer_name: 'Customer',
    vehicle_model_id: 'beat',
    pickup_datetime: '2026-07-20T11:15:00+08:00',
    dropoff_datetime: '2026-07-22T11:15:00+08:00',
    rental_value_raw: 10000,
    web_quote_raw: 10000,
    status: fixture.rawStatus ?? 'processed',
    cancelled_reason: fixture.cancelledReason ?? null,
    cancelled_at: fixture.rawStatus === 'cancelled' ? '2026-07-10T09:00:00+08:00' : null,
    created_at: '2026-07-01T00:00:00+08:00',
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
        return queryResult([{ id: 'order-1', booking_token: 'LR-0720-2C2D' }]);
      case 'order_items':
        return queryResult([{
          order_id: 'order-1',
          dropoff_datetime: '2026-07-28T11:15:00+08:00',
        }]);
      case 'payments':
        return queryResult(fixture.payments ?? []);
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

  it('does not load or expose extension data when extension commission is disabled', async () => {
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
    expect(client.from).not.toHaveBeenCalledWith('orders');
    expect(client.from).not.toHaveBeenCalledWith('payments');
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
