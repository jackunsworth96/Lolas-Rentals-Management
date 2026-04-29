-- ============================================================
-- 122: fix balance_due corruption from collect-payment deposit bug
--
-- Root cause: collectPayment (use-cases/orders/collect-payment.ts)
-- fetched all payment rows after recording a new payment and summed
-- every amount unconditionally. This incorrectly included:
--   • deposit payments (tracked against security_deposit, not final_total)
--   • pending/absorbed extension IOUs (amounts owed, not cash received)
--
-- The result was a spurious negative balance_due on active orders.
--
-- Known affected order: LR-0426-FE50 (Ruth Hand)
--   payments: rental ₱1,380 + deposit ₱999 + extension IOU ₱595 + rental ₱690
--   wrong totalPaid: 3,664 → balance_due = 2,070 − 3,664 = −1,594
--   correct totalPaid: 2,070 → balance_due = 0
--
-- Fix: recompute balance_due for all active orders using the correct
-- formula (matching settle-order and the active-orders API route):
--   correct_balance_due = final_total
--                       − SUM(non-deposit, non-extension-IOU payments)
--                       + SUM(refunds)
-- ============================================================

WITH correct AS (
  SELECT
    o.id,
    o.final_total - COALESCE(
      SUM(
        CASE
          -- Deposits are held against security_deposit, not final_total.
          WHEN p.payment_type = 'deposit'
            THEN 0
          -- Extension IOUs (pending or absorbed) represent amounts owed,
          -- not cash received; the absorbed cash is captured in a separate
          -- payment row at settlement.
          WHEN p.payment_type = 'extension'
               AND p.settlement_status IN ('pending', 'absorbed')
            THEN 0
          -- Refunds are money returned to the customer — they increase the
          -- outstanding balance, so subtract from the collected total.
          WHEN p.payment_type = 'refund'
            THEN -p.amount
          ELSE p.amount
        END
      ), 0
    ) AS correct_balance_due
  FROM orders o
  LEFT JOIN payments p ON p.order_id = o.id
  WHERE o.status = 'active'
  GROUP BY o.id, o.final_total
)
UPDATE orders o
SET    balance_due = c.correct_balance_due
FROM   correct c
WHERE  o.id = c.id
  AND  o.balance_due IS DISTINCT FROM c.correct_balance_due;
