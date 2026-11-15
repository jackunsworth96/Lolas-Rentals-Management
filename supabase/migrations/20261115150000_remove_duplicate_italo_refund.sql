-- "Refund Deposit to Italo in Cash" ₱2,000 (2 Nov) duplicates the two ₱1,000 cash deposit refunds
-- already posted by order settlement that day; the 2 Nov cash-up counted exactly ₱2,000 over.

DO $$
DECLARE
  v_id text := '55ee7d31-af91-40e9-a5b0-40bbf39995d6';
  v_legs int;
BEGIN
  SELECT count(*) INTO v_legs FROM journal_entries WHERE reference_type = 'expense' AND reference_id = v_id;
  IF v_legs <> 2 THEN RAISE EXCEPTION 'Expected 2 journal legs for the Italo refund expense, found %', v_legs; END IF;

  DELETE FROM journal_entries WHERE reference_type = 'expense' AND reference_id = v_id;
  DELETE FROM expenses WHERE id = v_id;

  IF (SELECT sum(debit) - sum(credit) FROM journal_entries) <> 0 THEN
    RAISE EXCEPTION 'Trial balance out of balance after removing the duplicate refund';
  END IF;
END $$;
