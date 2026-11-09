-- LR-1026-6932 (Allan Thomas): staff recorded a ₱5,115 "pre-activation" cash
-- payment at 08:12 on 26 Oct 2026, then activated the order at 08:55 and a
-- second ₱5,115 "rental" cash payment was recorded for the same amount.
-- Only the second payment was ever journaled (CASH-LOLA was debited once,
-- not twice, and the pre-activation row has zero journal_entries rows), so
-- the books themselves are correct -- the customer really paid ₱5,115 once.
--
-- But every screen that recomputes "total paid" straight from the payments
-- table (the Active Orders list via get_enriched_orders, and the Order
-- Detail Summary tab) summed BOTH rows, overstating total_paid by the
-- duplicated ₱5,115 and showing a ₱0.00 balance. The order's real
-- outstanding balance is ₱1,645 (a ₱250 unpaid add-on + a ₱1,395 unpaid
-- extension IOU), which matches the authoritative orders.balance_due value
-- that was never wrong -- only the payments-table-driven displays were.
--
-- Zero out the duplicate, un-journaled pre-activation row rather than
-- deleting it, so the audit trail (who/when) is preserved but it no longer
-- contributes to any "amount paid" total anywhere in the app.
UPDATE public.payments
SET amount = 0,
    notes = 'Corrected 2026-11-09: zeroed out -- duplicate of rental payment aae4b9c5-e966-437a-8a1b-d93ff41fa262 for the same ₱5,115; this pre-activation row was never journaled and was double-counting total_paid on the Active Orders list and order summary, masking a real ₱1,645 balance due.'
WHERE id = '95f965c9-f419-473a-97c5-de76238cadaf'
  AND payment_type = 'pre-activation'
  AND amount = 5115.00
  AND notes IS NULL;
