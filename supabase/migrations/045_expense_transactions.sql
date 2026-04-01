CREATE OR REPLACE FUNCTION create_expense_with_journal(
  p_expense_id          text,
  p_store_id            text,
  p_date                date,
  p_category            text,
  p_description         text,
  p_amount              numeric(12,2),
  p_paid_from           text,
  p_vehicle_id          text,
  p_employee_id         text,
  p_account_id          text,
  p_transaction_id      text,
  p_period              text,
  p_journal_date        date,
  p_journal_store_id    text,
  p_created_by          text,
  p_legs                jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO expenses (
    id, store_id, date, category, description,
    amount, paid_from, vehicle_id, employee_id, account_id
  ) VALUES (
    p_expense_id, p_store_id, p_date, p_category, p_description,
    p_amount, p_paid_from, p_vehicle_id, p_employee_id, p_account_id
  )
  ON CONFLICT (id) DO UPDATE SET
    store_id    = EXCLUDED.store_id,
    date        = EXCLUDED.date,
    category    = EXCLUDED.category,
    description = EXCLUDED.description,
    amount      = EXCLUDED.amount,
    paid_from   = EXCLUDED.paid_from,
    vehicle_id  = EXCLUDED.vehicle_id,
    employee_id = EXCLUDED.employee_id,
    account_id  = EXCLUDED.account_id;

  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description,
    reference_type, reference_id, created_by
  )
  SELECT
    leg->>'id',
    p_transaction_id,
    p_period,
    p_journal_date,
    p_journal_store_id,
    leg->>'account_id',
    (leg->>'debit')::numeric(12,2),
    (leg->>'credit')::numeric(12,2),
    leg->>'description',
    leg->>'reference_type',
    leg->>'reference_id',
    p_created_by
  FROM jsonb_array_elements(p_legs) AS leg;
END;
$$;

CREATE OR REPLACE FUNCTION delete_expense_with_journal(
  p_expense_id      text,
  p_reference_type  text,
  p_reference_id    text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM journal_entries
  WHERE reference_type = p_reference_type
    AND reference_id = p_reference_id;

  DELETE FROM expenses
  WHERE id = p_expense_id;
END;
$$;
