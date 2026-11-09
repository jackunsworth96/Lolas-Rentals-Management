export function calculateBalanceDue(finalTotal: number, totalPaid: number): number {
  return Math.max(0, finalTotal - totalPaid);
}

/**
 * The security deposit is held against damages and refunded at the end of
 * the rental — it is never applied toward the rental balance, so it must be
 * excluded from any "amount paid toward final_total" calculation.
 *
 * Two labels exist in `payments.payment_type` for historical reasons:
 *  - 'deposit' — written by the raw/web order activation path
 *    (process-raw-order.ts).
 *  - 'security_deposit' — written by the walk-in activate_order_atomic RPC.
 * Both represent the same thing and must be treated identically everywhere
 * a balance/total-paid figure is derived from the payments list.
 */
export function isDepositPayment(paymentType: string | null | undefined): boolean {
  return paymentType === 'deposit' || paymentType === 'security_deposit';
}
