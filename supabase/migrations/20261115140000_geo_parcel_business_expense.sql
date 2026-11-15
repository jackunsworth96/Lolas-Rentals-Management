-- The ₱485 "Geo Parcel" (1 Nov) is a business development cost, not a personal advance to Geo.
-- Undo the advance from 20261115130000: drop its repayment schedule and book it to Marketing & Printing.

DO $$
DECLARE
  v_id text := 'f186048b-7284-4e5e-9c52-db281eabf9ef';
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM cash_advance_schedules WHERE expense_id = v_id AND remaining_balance < total_amount) THEN
    RAISE EXCEPTION 'Geo parcel advance has already been partly deducted in payroll';
  END IF;

  SELECT jsonb_build_object('dr', sum(debit), 'cr', sum(credit),
    'cash', sum(CASE WHEN account_id = 'CASH-LOLA' THEN debit - credit END))
  INTO v_before FROM journal_entries;

  DELETE FROM cash_advance_schedules WHERE expense_id = v_id;

  UPDATE journal_entries
  SET account_id = 'EXP-MARKETING-store-lolas'
  WHERE reference_type = 'expense' AND reference_id = v_id AND debit > 0 AND account_id = 'Employee-Advance';

  UPDATE expenses e
  SET category_id = c.id,
      category = c.name,
      account_id = 'EXP-MARKETING-store-lolas',
      employee_id = NULL,
      description = replace(e.description, ' (personal, deducted from salary)', '')
  FROM expense_categories c
  WHERE e.id = v_id AND c.id = 61;

  IF (SELECT count(*) FROM journal_entries
      WHERE reference_type = 'expense' AND reference_id = v_id AND debit > 0
        AND account_id = 'EXP-MARKETING-store-lolas') <> 1 THEN
    RAISE EXCEPTION 'Geo parcel debit leg not moved';
  END IF;

  SELECT jsonb_build_object('dr', sum(debit), 'cr', sum(credit),
    'cash', sum(CASE WHEN account_id = 'CASH-LOLA' THEN debit - credit END))
  INTO v_after FROM journal_entries;
  IF v_before <> v_after THEN RAISE EXCEPTION 'Totals moved: before % after %', v_before, v_after; END IF;
END $$;
