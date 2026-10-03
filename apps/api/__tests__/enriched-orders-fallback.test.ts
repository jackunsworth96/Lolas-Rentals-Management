import { describe, expect, it, vi } from 'vitest';
import { loadEnrichedOrdersFallback } from '../src/lib/enriched-orders-fallback.js';

function table(rows: Array<Record<string, unknown>>) {
  let selected = rows;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      selected = selected.filter((row) => row[key] === value);
      return query;
    }),
    in: vi.fn((key: string, values: unknown[]) => {
      selected = selected.filter((row) => values.includes(row[key]));
      return query;
    }),
    order: vi.fn(() => query),
    range: vi.fn((start: number, end: number) => {
      selected = selected.slice(start, end + 1);
      return query;
    }),
    then: (resolve: (value: { data: typeof selected; error: null }) => unknown) =>
      Promise.resolve({ data: selected, error: null }).then(resolve),
  };
  return query;
}

describe('enriched orders fallback', () => {
  it('loads active orders and computes payment fields without the RPC', async () => {
    const rows: Record<string, Array<Record<string, unknown>>> = {
      orders: [{ id: 'o1', store_id: 'store', status: 'active', booking_token: 'LR-1', customers: { name: 'Guest', mobile: null, email: null } }],
      order_items: [{ id: 'i1', order_id: 'o1', vehicle_name: 'Scooter', created_at: '2026-10-01' }],
      payments: [
        { order_id: 'o1', payment_type: 'rental', amount: 1000 },
        { order_id: 'o1', payment_type: 'refund', amount: 200 },
        { order_id: 'o1', payment_type: 'extension', settlement_status: 'pending', amount: 300 },
      ],
      order_addons: [], inspections: [], waivers: [],
    };
    const sb = { from: vi.fn((name: string) => table(rows[name])) };

    const result = await loadEnrichedOrdersFallback(sb as never, 'store', ['active']);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      customer_name: 'Guest', total_paid: 800, pending_extensions_total: 300,
      has_extension: true, items: [{ id: 'i1' }],
    });
  });
});
