-- Add status and paid_at columns to expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Add check constraint
ALTER TABLE expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('paid', 'unpaid'));

-- Update the existing create_expense_with_journal RPC to handle
-- unpaid expenses (skip journal entries when status = 'unpaid')
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
  p_status              text DEFAULT 'paid',
  p_transaction_id      text DEFAULT NULL,
  p_period              text DEFAULT NULL,
  p_journal_date        date DEFAULT NULL,
  p_journal_store_id    text DEFAULT NULL,
  p_created_by          text DEFAULT NULL,
  p_legs                jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO expenses (
    id, store_id, date, category, description,
    amount, paid_from, vehicle_id, employee_id,
    account_id, status
  ) VALUES (
    p_expense_id, p_store_id, p_date, p_category, p_description,
    p_amount, p_paid_from, p_vehicle_id, p_employee_id,
    p_account_id, p_status
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
    account_id  = EXCLUDED.account_id,
    status      = EXCLUDED.status;

  -- Only insert journal entries if status is 'paid' and legs provided
  IF p_status = 'paid' AND jsonb_array_length(p_legs) > 0 THEN
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
  END IF;
END;
$$;

-- New RPC: pay multiple unpaid expenses atomically
CREATE OR REPLACE FUNCTION pay_expenses_atomic(
  p_expense_ids       text[],
  p_paid_at           timestamptz,
  p_paid_from         text,
  p_legs              jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  leg jsonb;
BEGIN
  -- Mark expenses as paid
  UPDATE expenses
  SET
    status   = 'paid',
    paid_at  = p_paid_at,
    paid_from = p_paid_from
  WHERE id = ANY(p_expense_ids);

  -- Insert journal entry legs
  FOR leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    INSERT INTO journal_entries (
      id, transaction_id, period, date, store_id,
      account_id, debit, credit, description,
      reference_type, reference_id, created_by
    ) VALUES (
      leg->>'id',
      leg->>'transaction_id',
      leg->>'period',
      (leg->>'date')::date,
      leg->>'store_id',
      leg->>'account_id',
      (leg->>'debit')::numeric(12,2),
      (leg->>'credit')::numeric(12,2),
      leg->>'description',
      leg->>'reference_type',
      leg->>'reference_id',
      NULL
    );
  END LOOP;
END;
$$;
