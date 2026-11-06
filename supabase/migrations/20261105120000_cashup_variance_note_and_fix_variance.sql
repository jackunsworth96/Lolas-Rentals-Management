-- Cash-up: store the staff explanation for a variance, and correct the
-- stored total variance.
--
-- Until now `expected_cash` was computed by the API without the deposit
-- envelope's opening balance, while `actual_counted` included the whole
-- envelope. The stored `variance` therefore showed a fake ~+₱25,000 "over"
-- every day. The till and envelope variances were correct, so the total is
-- rebuilt from them.

ALTER TABLE cash_reconciliation
  ADD COLUMN IF NOT EXISTS variance_note text NULL;

UPDATE cash_reconciliation
SET
  expected_cash = till_expected + deposits_expected,
  variance      = till_variance + deposit_variance,
  variance_type = CASE
    WHEN till_variance + deposit_variance = 0 THEN 'exact'
    WHEN till_variance + deposit_variance > 0 THEN 'over'
    ELSE 'short'
  END
WHERE till_variance IS NOT NULL
  AND deposit_variance IS NOT NULL
  AND till_expected IS NOT NULL
  AND deposits_expected IS NOT NULL
  -- Archived stores are read-only (reject_archived_store_write trigger).
  AND store_id IN (SELECT id FROM stores WHERE is_active);

-- Drop the previous signatures (migrations 047 and 20260520120000) so
-- PostgREST does not have to choose between overloads.
DROP FUNCTION IF EXISTS reconcile_cash_atomic(
  text, text, date, numeric, numeric, numeric, numeric, text, text,
  timestamptz, boolean, text, timestamptz, text, numeric, numeric,
  jsonb, jsonb, numeric, numeric, numeric, numeric, numeric
);
DROP FUNCTION IF EXISTS reconcile_cash_atomic(
  text, text, date, numeric, numeric, numeric, numeric, text, text,
  timestamptz, boolean, text, timestamptz, text, numeric, numeric,
  jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric
);

CREATE OR REPLACE FUNCTION reconcile_cash_atomic(
  p_id                        text,
  p_store_id                  text,
  p_date                      date,
  p_opening_balance           numeric(12,2),
  p_expected_cash             numeric(12,2),
  p_actual_counted            numeric(12,2),
  p_variance                  numeric(12,2),
  p_variance_type             text,
  p_submitted_by              text,
  p_submitted_at              timestamptz,
  p_is_locked                 boolean,
  p_overridden_by             text,
  p_overridden_at             timestamptz,
  p_override_reason           text,
  p_till_counted              numeric(12,2),
  p_deposits_counted          numeric(12,2),
  p_till_denoms               jsonb,
  p_deposit_denoms            jsonb,
  p_till_expected             numeric(12,2),
  p_deposits_expected         numeric(12,2),
  p_till_variance             numeric(12,2),
  p_deposit_variance          numeric(12,2),
  p_closing_balance           numeric(12,2),
  p_deposits_closing_balance  numeric(12,2),
  p_variance_note             text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO cash_reconciliation (
    id, store_id, date, opening_balance, expected_cash,
    actual_counted, variance, variance_type, submitted_by,
    submitted_at, is_locked, overridden_by, overridden_at,
    override_reason, till_counted, deposits_counted,
    till_denoms, deposit_denoms, till_expected, deposits_expected,
    till_variance, deposit_variance, closing_balance,
    deposits_closing_balance, variance_note
  ) VALUES (
    p_id, p_store_id, p_date, p_opening_balance, p_expected_cash,
    p_actual_counted, p_variance, p_variance_type, p_submitted_by,
    p_submitted_at, p_is_locked, p_overridden_by, p_overridden_at,
    p_override_reason, p_till_counted, p_deposits_counted,
    p_till_denoms, p_deposit_denoms, p_till_expected, p_deposits_expected,
    p_till_variance, p_deposit_variance, p_closing_balance,
    p_deposits_closing_balance, p_variance_note
  )
  ON CONFLICT (id) DO UPDATE SET
    store_id                  = EXCLUDED.store_id,
    date                      = EXCLUDED.date,
    opening_balance           = EXCLUDED.opening_balance,
    expected_cash             = EXCLUDED.expected_cash,
    actual_counted            = EXCLUDED.actual_counted,
    variance                  = EXCLUDED.variance,
    variance_type             = EXCLUDED.variance_type,
    submitted_by              = EXCLUDED.submitted_by,
    submitted_at              = EXCLUDED.submitted_at,
    is_locked                 = EXCLUDED.is_locked,
    overridden_by             = EXCLUDED.overridden_by,
    overridden_at             = EXCLUDED.overridden_at,
    override_reason           = EXCLUDED.override_reason,
    till_counted              = EXCLUDED.till_counted,
    deposits_counted          = EXCLUDED.deposits_counted,
    till_denoms               = EXCLUDED.till_denoms,
    deposit_denoms            = EXCLUDED.deposit_denoms,
    till_expected             = EXCLUDED.till_expected,
    deposits_expected         = EXCLUDED.deposits_expected,
    till_variance             = EXCLUDED.till_variance,
    deposit_variance          = EXCLUDED.deposit_variance,
    closing_balance           = EXCLUDED.closing_balance,
    deposits_closing_balance  = EXCLUDED.deposits_closing_balance,
    variance_note             = EXCLUDED.variance_note;

  UPDATE cash_reconciliation
  SET is_locked = true
  WHERE id = p_id;
END;
$$;
