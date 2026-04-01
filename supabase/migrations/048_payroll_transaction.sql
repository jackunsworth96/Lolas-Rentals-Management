CREATE OR REPLACE FUNCTION run_payroll_atomic(
  p_transactions  jsonb,
  p_timesheet_ids text[],
  p_status        text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tx jsonb;
  leg jsonb;
BEGIN
  -- Insert all journal entries for all store allocations
  FOR tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    FOR leg IN SELECT * FROM jsonb_array_elements(tx->'legs')
    LOOP
      INSERT INTO journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id, created_by
      ) VALUES (
        leg->>'id',
        tx->>'transactionId',
        tx->>'period',
        (tx->>'date')::date,
        tx->>'storeId',
        leg->>'account_id',
        (leg->>'debit')::numeric(12,2),
        (leg->>'credit')::numeric(12,2),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id',
        NULL
      );
    END LOOP;
  END LOOP;

  -- Bulk update timesheet status
  IF array_length(p_timesheet_ids, 1) > 0 THEN
    UPDATE timesheets
    SET payroll_status = p_status
    WHERE id = ANY(p_timesheet_ids);
  END IF;

END;
$$;
