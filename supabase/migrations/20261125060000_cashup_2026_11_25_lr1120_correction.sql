-- The 25 Nov cash-up was locked ₱1,000 short because the LR-1120-4A7D
-- settlement wrongly moved its deposit into the till (corrected in
-- 20261125050000). The counts were right; restate the expected till and the
-- variance against the corrected ledger.
UPDATE public.cash_reconciliation
SET till_expected   = till_expected - 1000,
    expected_cash   = expected_cash - 1000,
    till_variance   = 0,
    variance        = deposit_variance,
    variance_type   = CASE WHEN deposit_variance = 0 THEN 'exact' WHEN deposit_variance > 0 THEN 'over' ELSE 'short' END,
    override_reason = 'Expected till corrected: LR-1120-4A7D deposit was refunded in cash, not moved to the till',
    overridden_at   = now()
WHERE store_id = 'store-lolas'
  AND date = '2026-11-25'
  AND till_expected = 14379
  AND till_counted = 13379
  AND till_variance = -1000;
