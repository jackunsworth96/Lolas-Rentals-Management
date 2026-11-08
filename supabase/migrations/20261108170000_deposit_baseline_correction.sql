-- The 8 Nov baseline put 1,000 too much in the deposit envelope and left out
-- the two deposits received into Wise. Open orders hold 25,000 cash, 4,000
-- GCash and 2,000 in Wise, matching the cash-up envelope chain from the
-- 7 Nov count.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE transaction_id = 'tx-fix-deposit-baseline-20261108') THEN
    RETURN;
  END IF;
  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id)
  VALUES
    (gen_random_uuid()::text, 'tx-fix-deposit-baseline-20261108', '2026-11', '2026-11-08', 'store-lolas', 'RECON-ADJ-EQUITY', 2000, 0,
     'Correction to 8 Nov baseline: deposit envelope and deposits held', 'reconciliation_adjustment', 'tx-recon-baseline-20261108'),
    (gen_random_uuid()::text, 'tx-fix-deposit-baseline-20261108', '2026-11', '2026-11-08', 'store-lolas', 'CASH-DEPOSIT-ENVELOPE', 0, 1000,
     'Correction to 8 Nov baseline: envelope matches the cash deposits on open orders', 'reconciliation_adjustment', 'tx-recon-baseline-20261108'),
    (gen_random_uuid()::text, 'tx-fix-deposit-baseline-20261108', '2026-11', '2026-11-08', 'store-lolas', 'DEPOSITS-HELD-LOLAS', 0, 1000,
     'Correction to 8 Nov baseline: deposits held include the two deposits received into Wise', 'reconciliation_adjustment', 'tx-recon-baseline-20261108');
END $$;
