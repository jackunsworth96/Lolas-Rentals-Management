-- ============================================================
-- Cash Drawer Lola's ledger vs the locked cash-up — 14 Nov 2026
--
-- On 14 Nov the Accounts page showed Cash Drawer Lola's at 10,069.00 while the
-- locked cash-up counted 9,764.00 (expected 9,764.00). Two historic entries
-- explain the 305.00 difference:
--
--   1. LR-1112-B40B paid 695.00 rental in CASH on 12 Nov, but the booking
--      screen kept a stale "payment account" and journaled it to GCash.
--      CASH-LOLA was 695.00 too low and GCASH-store-lolas 695.00 too high.
--   2. The 8 Nov cash-up envelope sync (transaction
--      cbe228ad-e715-4b82-86ff-93a1a055fffb) credited the envelope and debited
--      CASH-LOLA by 1,000.00 as if envelope cash had moved to the till. No cash
--      moved: the till counted exactly its expected figure that day. The
--      envelope ledger now equals the envelope count, so only the till side is
--      reversed, against Reconciliation Adjustments.
--
-- After this migration CASH-LOLA = 9,764.00 (the 14 Nov till count) and the
-- count is recorded in account_reconciliations like any Accounts-page count.
-- Idempotent: each transaction is skipped if it already exists.
-- ============================================================

DO $$
DECLARE
  v_fix695  constant text := 'tx-fix-cash-vs-gcash-20261114-lr1112b40b';
  v_fix1000 constant text := 'tx-fix-envelope-sync-till-20261114';
  v_ledger  numeric;
BEGIN
  -- 1. 695.00 cash payment journaled to GCash.
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE transaction_id = v_fix695) THEN
    INSERT INTO public.journal_entries
      (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id)
    VALUES
      (gen_random_uuid()::text, v_fix695, '2026-11', DATE '2026-11-12', 'store-lolas', 'CASH-LOLA', 695, 0,
       'Correction: LR-1112-B40B rental was paid in cash, not GCash', 'adjustment', 'c5b71e75-4b06-4ede-8d83-4acb6ab9b296'),
      (gen_random_uuid()::text, v_fix695, '2026-11', DATE '2026-11-12', 'store-lolas', 'GCASH-store-lolas', 0, 695,
       'Correction: LR-1112-B40B rental was paid in cash, not GCash', 'adjustment', 'c5b71e75-4b06-4ede-8d83-4acb6ab9b296');
  END IF;

  -- 2. 1,000.00 envelope-to-till plug from the 8 Nov envelope sync, then record
  --    the 14 Nov till count (9,764.00) so the ledger matches it.
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE transaction_id = v_fix1000) THEN
    SELECT coalesce(sum(debit - credit), 0) INTO v_ledger
    FROM public.journal_entries WHERE account_id = 'CASH-LOLA';

    INSERT INTO public.journal_entries
      (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id)
    VALUES
      (gen_random_uuid()::text, v_fix1000, '2026-11', DATE '2026-11-14', 'store-lolas', 'CASH-LOLA', 0, 1000,
       'Reconciliation 2026-11-14: reverse 8 Nov envelope-sync debit; no cash moved into the till (till count 9,764.00)',
       'reconciliation_adjustment', NULL),
      (gen_random_uuid()::text, v_fix1000, '2026-11', DATE '2026-11-14', 'store-lolas', 'RECON-ADJ-EQUITY', 1000, 0,
       'Reconciliation 2026-11-14: reverse 8 Nov envelope-sync debit; no cash moved into the till (till count 9,764.00)',
       'reconciliation_adjustment', NULL);

    -- Ledger balance before this adjustment is v_ledger (already includes fix 1).
    INSERT INTO public.account_reconciliations
      (account_id, as_of_date, ledger_balance, counted_balance, variance, adjustment_tx_id, notes)
    VALUES
      ('CASH-LOLA', DATE '2026-11-14', v_ledger, 9764.00, 9764.00 - v_ledger, v_fix1000,
       'Matched to the locked 14 Nov cash-up till count. Difference was the 8 Nov envelope sync debiting the till by 1,000.00 (695.00 GCash/cash mix-up on LR-1112-B40B corrected separately).');
  END IF;
END $$;
