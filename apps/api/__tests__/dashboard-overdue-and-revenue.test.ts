import { describe, expect, it } from 'vitest';
import { buildOverdueReturns } from '../src/lib/dashboard-overdue.js';
import { buildRevenueTransactions } from '../src/lib/dashboard-revenue-transactions.js';
import type { EnrichedItem, EnrichedOrderRow } from '../src/lib/dashboard-today-movements.js';

const nowMs = Date.parse('2026-11-14T12:00:00+08:00');

function item(overrides: Partial<EnrichedItem>): EnrichedItem {
  return {
    id: 'i1', vehicle_name: 'Beat 07', pickup_datetime: '2026-11-10T09:00:00+08:00', dropoff_datetime: '2026-11-14T10:00:00+08:00',
    pickup_location_id: 1, dropoff_location_id: 1, pickup_location: 'Store', dropoff_location: 'Store', pickup_fee: 0, dropoff_fee: 0,
    ...overrides,
  };
}

function order(overrides: Partial<EnrichedOrderRow>): EnrichedOrderRow {
  return {
    id: 'o1', store_id: 'store-lolas', status: 'active', booking_customer_name: 'Ana', customer_name: null, customer_mobile: '+63917',
    booking_token: 'LR-9', woo_order_id: null, partner_ref: null, web_notes: null, final_total: 3000, total_paid: 2500,
    security_deposit: 1000, has_nine_pm_addon: false, waiver_status: 'signed', items: [item({})], ...overrides,
  };
}

describe('buildOverdueReturns', () => {
  it('lists active orders past drop-off, most overdue first, with the balance to collect', () => {
    const overdue = buildOverdueReturns(
      [
        order({ id: 'recent', items: [item({ dropoff_datetime: '2026-11-14T11:00:00+08:00' })] }),
        order({ id: 'oldest', items: [item({ dropoff_datetime: '2026-11-12T09:00:00+08:00' }), item({ id: 'i2', vehicle_name: 'Beat 08', dropoff_datetime: '2026-11-13T09:00:00+08:00' })] }),
      ],
      nowMs,
    );
    expect(overdue.map((o) => o.orderId)).toEqual(['oldest', 'recent']);
    expect(overdue[0]).toMatchObject({ vehicles: ['Beat 07', 'Beat 08'], balanceDue: 500, deposit: 1000, customerName: 'Ana' });
  });

  it('ignores orders that are not active or not yet due', () => {
    const overdue = buildOverdueReturns(
      [
        order({ id: 'confirmed', status: 'confirmed' }),
        order({ id: 'later', items: [item({ dropoff_datetime: '2026-11-14T15:00:00+08:00' })] }),
      ],
      nowMs,
    );
    expect(overdue).toEqual([]);
  });
});

describe('buildRevenueTransactions', () => {
  it("lists today's payments and misc sales newest first, adding up to the card total", () => {
    const { transactions, total } = buildRevenueTransactions({
      payments: [
        {
          id: 'p1', amount: '2500', store_id: 'store-lolas', payment_type: 'rental_payment', payment_method_id: 'gcash', order_id: 'o1',
          created_at: '2026-11-14T09:00:00+08:00',
          orders: { booking_token: 'LR-9', woo_order_id: null, booking_customer_name: null, customers: { name: 'Ben' } },
        },
      ],
      miscSales: [
        { id: 'm1', amount: 300, store_id: 'store-lolas', created_at: '2026-11-14T10:30:00+08:00', description: null, category: 'Surf wax' },
      ],
      methodNames: new Map([['gcash', 'GCash']]),
    });
    expect(total).toBe(2800);
    expect(transactions.map((t) => t.key)).toEqual(['misc-m1', 'payment-p1']);
    expect(transactions[0]).toMatchObject({ kind: 'misc_sale', label: 'Surf wax' });
    expect(transactions[1]).toMatchObject({ label: 'Rental payment', method: 'GCash', customerName: 'Ben', reference: 'LR-9', orderId: 'o1' });
  });
});
