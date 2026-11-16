-- Move Claire's November history onto DUE-TO-CLAIRE (itemised statements start Nov 2026;
-- her personal costs before that stay as company costs).
--   1. November "Claire Personal" expenses: debit leg OWNER-DRAWINGS-CLAIRE -> DUE-TO-CLAIRE.
--   2. 13 Nov: a customer paid 7,000 into Wise for a private rental of Claire's and she was handed
--      7,000 from the safe. Re-recorded as collected for her, then paid to her (nets to zero).
-- Cash, bank and safe balances and trial-balance totals must not move.

ALTER TABLE vehicle_owner_settlements ADD COLUMN IF NOT EXISTS note text;

DO $$
DECLARE
  v_before jsonb;
  v_after  jsonb;
  v_moved  int;
  v_tx     text := '54826d9e-e1f1-4bc5-ad84-861fe2019c41';
  v_payout_tx text := gen_random_uuid()::text;
  v_memo_in  text := 'Collected for Claire: private rental customer paid 7,000 into Wise';
  v_memo_out text := 'Paid to Claire: 7,000 cash from the safe for her private rental';
BEGIN
  SELECT jsonb_build_object(
    'dr', sum(debit), 'cr', sum(credit),
    'safe', sum(CASE WHEN account_id = 'SAFE-store-lolas' THEN debit - credit END),
    'cash', sum(CASE WHEN account_id = 'CASH-LOLA' THEN debit - credit END),
    'gcash', sum(CASE WHEN account_id = 'GCASH-store-lolas' THEN debit - credit END),
    'wise', sum(CASE WHEN account_id = 'Wise' THEN debit - credit END))
  INTO v_before FROM journal_entries;

  -- 1. November personal costs
  UPDATE journal_entries j
  SET account_id = 'DUE-TO-CLAIRE'
  FROM expenses e
  WHERE j.reference_type = 'expense' AND j.reference_id = e.id
    AND j.debit > 0 AND j.account_id = 'OWNER-DRAWINGS-CLAIRE'
    AND e.account_id = 'OWNER-DRAWINGS-CLAIRE' AND e.date >= '2026-11-01';
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE expenses SET account_id = 'DUE-TO-CLAIRE'
  WHERE account_id = 'OWNER-DRAWINGS-CLAIRE' AND date >= '2026-11-01';

  IF v_moved <> 4 THEN RAISE EXCEPTION 'Expected 4 November legs to move, moved %', v_moved; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE account_id = 'OWNER-DRAWINGS-CLAIRE')
     OR EXISTS (SELECT 1 FROM expenses WHERE account_id = 'OWNER-DRAWINGS-CLAIRE') THEN
    RAISE EXCEPTION 'OWNER-DRAWINGS-CLAIRE still has activity';
  END IF;
  UPDATE chart_of_accounts SET is_active = false WHERE id = 'OWNER-DRAWINGS-CLAIRE';

  -- 2. 13 Nov pass-through
  IF (SELECT count(*) FROM journal_entries WHERE transaction_id = v_tx AND reference_type = 'fund_transfer') <> 2 THEN
    RAISE EXCEPTION '13 Nov fund transfer not found or already changed';
  END IF;

  UPDATE journal_entries SET reference_type = 'owner_collection', reference_id = 'claire', description = v_memo_in
  WHERE transaction_id = v_tx AND account_id = 'Wise';

  UPDATE journal_entries SET transaction_id = v_payout_tx, reference_type = 'owner_payout', reference_id = 'claire', description = v_memo_out
  WHERE transaction_id = v_tx AND account_id = 'SAFE-store-lolas';

  INSERT INTO journal_entries
    (id, transaction_id, period, date, store_id, account_id, description, debit, credit, reference_type, reference_id, created_by)
  SELECT gen_random_uuid()::text, v_tx, '2026-11', DATE '2026-11-13', 'company', 'DUE-TO-CLAIRE', v_memo_in, 0, 7000, 'owner_collection', 'claire', created_by
  FROM journal_entries WHERE transaction_id = v_tx AND account_id = 'Wise'
  UNION ALL
  SELECT gen_random_uuid()::text, v_payout_tx, '2026-11', DATE '2026-11-13', 'company', 'DUE-TO-CLAIRE', v_memo_out, 7000, 0, 'owner_payout', 'claire', created_by
  FROM journal_entries WHERE transaction_id = v_payout_tx AND account_id = 'SAFE-store-lolas';

  SELECT jsonb_build_object(
    'dr', sum(debit) - 7000, 'cr', sum(credit) - 7000,
    'safe', sum(CASE WHEN account_id = 'SAFE-store-lolas' THEN debit - credit END),
    'cash', sum(CASE WHEN account_id = 'CASH-LOLA' THEN debit - credit END),
    'gcash', sum(CASE WHEN account_id = 'GCASH-store-lolas' THEN debit - credit END),
    'wise', sum(CASE WHEN account_id = 'Wise' THEN debit - credit END))
  INTO v_after FROM journal_entries;
  IF v_before <> v_after THEN RAISE EXCEPTION 'Totals moved: before % after %', v_before, v_after; END IF;

  IF EXISTS (SELECT transaction_id FROM journal_entries WHERE transaction_id IN (v_tx, v_payout_tx)
             GROUP BY transaction_id HAVING sum(debit) <> sum(credit)) THEN
    RAISE EXCEPTION '13 Nov transactions do not balance';
  END IF;
END $$;
