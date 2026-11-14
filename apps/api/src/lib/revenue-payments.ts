/**
 * What counts as revenue in the `payments` table.
 *
 * Not revenue:
 *  - security deposits and their refunds: the money is the customer's, held by us
 *  - rows still `pending`: an unpaid extension or add-on that hasn't been received
 *  - rows `absorbed`: an unpaid extension later folded into the final settlement
 *    payment, which already counts it (counting both would double it)
 *
 * Refunds of rental money (`refund`) are revenue given back, so they count as negative.
 */
export const NON_REVENUE_PAYMENT_TYPES = ['deposit', 'security_deposit', 'deposit_refund'] as const;
export const UNRECEIVED_SETTLEMENT_STATUSES = ['pending', 'absorbed'] as const;

type RevenueFilterable = {
  not: (column: string, operator: string, value: string) => unknown;
  or: (filters: string) => unknown;
};

/** Narrows a `payments` query to the rows that can count as revenue. */
export function revenuePaymentsOnly<Q>(query: Q): Q {
  const q = query as unknown as RevenueFilterable;
  const typed = q.not('payment_type', 'in', `(${NON_REVENUE_PAYMENT_TYPES.join(',')})`) as RevenueFilterable;
  return typed.or(
    `settlement_status.is.null,settlement_status.not.in.(${UNRECEIVED_SETTLEMENT_STATUSES.join(',')})`,
  ) as Q;
}

/** A payment's effect on revenue: refunds of rental money subtract. */
export function revenueAmount(row: { amount: number | string | null; payment_type?: string | null }): number {
  const amount = Math.abs(Number(row.amount ?? 0)) || 0;
  return row.payment_type === 'refund' ? -amount : Number(row.amount ?? 0) || 0;
}
