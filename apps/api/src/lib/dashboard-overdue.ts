import { calculateBalanceDue } from '@lolas/shared';
import type { EnrichedOrderRow } from './dashboard-today-movements.js';

export interface OverdueReturn {
  orderId: string;
  storeId: string;
  reference: string | null;
  customerName: string;
  mobile: string | null;
  /** When the earliest overdue vehicle was due back. */
  dueAt: string;
  vehicles: string[];
  balanceDue: number;
  deposit: number;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

/**
 * Active orders with a vehicle past its drop-off time, most overdue first.
 * Uses the same rule as the dashboard's "Overdue returns" count so the list
 * always matches the number on the card.
 */
export function buildOverdueReturns(orders: EnrichedOrderRow[], nowMs: number): OverdueReturn[] {
  const result: OverdueReturn[] = [];
  for (const o of orders) {
    if (o.status !== 'active') continue;
    const overdueItems = (o.items ?? []).filter((i) => ms(i.dropoff_datetime) < nowMs);
    if (overdueItems.length === 0) continue;
    const first = overdueItems.reduce((a, b) => (ms(a.dropoff_datetime) <= ms(b.dropoff_datetime) ? a : b));
    result.push({
      orderId: o.id,
      storeId: o.store_id,
      reference: o.booking_token ?? o.woo_order_id ?? null,
      customerName: o.booking_customer_name?.trim() || o.customer_name?.trim() || '—',
      mobile: o.customer_mobile,
      dueAt: first.dropoff_datetime!,
      vehicles: overdueItems.map((i) => i.vehicle_name ?? 'Vehicle'),
      balanceDue: calculateBalanceDue(num(o.final_total), num(o.total_paid)),
      deposit: num(o.security_deposit),
    });
  }
  return result.sort((a, b) => ms(a.dueAt) - ms(b.dueAt));
}
