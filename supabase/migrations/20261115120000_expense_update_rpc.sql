-- update_expense_with_journal(p jsonb)
--   { expenseId, storeId, date, category, categoryId, description, amount,
--     paidFrom, vehicleId, employeeId, accountId, transactionId, period,
--     createdBy, legs: [{ id, account_id, debit, credit, description }] }
-- Edits an expense and swaps its journal legs in one transaction, so the
-- books never show the old and new amounts at the same time (or neither).
-- Pass legs = [] for an unpaid expense.
CREATE OR REPLACE FUNCTION public.update_expense_with_journal(p jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id   text := p->>'expenseId';
  v_date date := (p->>'date')::date;
BEGIN
  PERFORM 1 FROM expenses WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense % not found', v_id;
  END IF;

  UPDATE expenses SET
    date        = v_date,
    category    = p->>'category',
    category_id = (p->>'categoryId')::integer,
    description = p->>'description',
    amount      = (p->>'amount')::numeric(12,2),
    paid_from   = p->>'paidFrom',
    vehicle_id  = p->>'vehicleId',
    employee_id = p->>'employeeId',
    account_id  = p->>'accountId'
  WHERE id = v_id;

  DELETE FROM journal_entries WHERE reference_type = 'expense' AND reference_id = v_id;

  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id,
                               debit, credit, description, reference_type, reference_id, created_by)
  SELECT leg->>'id', p->>'transactionId', p->>'period', v_date, p->>'storeId', leg->>'account_id',
         (leg->>'debit')::numeric(12,2), (leg->>'credit')::numeric(12,2), leg->>'description',
         'expense', v_id, p->>'createdBy'
  FROM jsonb_array_elements(coalesce(p->'legs', '[]'::jsonb)) AS leg;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_expense_with_journal(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_expense_with_journal(jsonb) TO service_role;
