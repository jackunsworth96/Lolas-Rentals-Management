CREATE OR REPLACE FUNCTION reconcile_cash_atomic(
  p_id                text,
  p_store_id          text,
  p_date              date,
  p_opening_balance   numeric(12,2),
  p_expected_cash     numeric(12,2),
  p_actual_counted    numeric(12,2),
  p_variance          numeric(12,2),
  p_variance_type     text,
  p_submitted_by      text,
  p_submitted_at      timestamptz,
  p_is_locked         boolean,
  p_overridden_by     text,
  p_overridden_at     timestamptz,
  p_override_reason   text,
  p_till_counted      numeric(12,2),
  p_deposits_counted  numeric(12,2),
  p_till_denoms       jsonb,
  p_deposit_denoms    jsonb,
  p_till_expected     numeric(12,2),
  p_deposits_expected numeric(12,2),
  p_till_variance     numeric(12,2),
  p_deposit_variance  numeric(12,2),
  p_closing_balance   numeric(12,2)
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO cash_reconciliation (
    id, store_id, date, opening_balance, expected_cash,
    actual_counted, variance, variance_type, submitted_by,
    submitted_at, is_locked, overridden_by, overridden_at,
    override_reason, till_counted, deposits_counted,
    till_denoms, deposit_denoms, till_expected, deposits_expected,
    till_variance, deposit_variance, closing_balance
  ) VALUES (
    p_id, p_store_id, p_date, p_opening_balance, p_expected_cash,
    p_actual_counted, p_variance, p_variance_type, p_submitted_by,
    p_submitted_at, p_is_locked, p_overridden_by, p_overridden_at,
    p_override_reason, p_till_counted, p_deposits_counted,
    p_till_denoms, p_deposit_denoms, p_till_expected, p_deposits_expected,
    p_till_variance, p_deposit_variance, p_closing_balance
  )
  ON CONFLICT (id) DO UPDATE SET
    store_id          = EXCLUDED.store_id,
    date              = EXCLUDED.date,
    opening_balance   = EXCLUDED.opening_balance,
    expected_cash     = EXCLUDED.expected_cash,
    actual_counted    = EXCLUDED.actual_counted,
    variance          = EXCLUDED.variance,
    variance_type     = EXCLUDED.variance_type,
    submitted_by      = EXCLUDED.submitted_by,
    submitted_at      = EXCLUDED.submitted_at,
    is_locked         = EXCLUDED.is_locked,
    overridden_by     = EXCLUDED.overridden_by,
    overridden_at     = EXCLUDED.overridden_at,
    override_reason   = EXCLUDED.override_reason,
    till_counted      = EXCLUDED.till_counted,
    deposits_counted  = EXCLUDED.deposits_counted,
    till_denoms       = EXCLUDED.till_denoms,
    deposit_denoms    = EXCLUDED.deposit_denoms,
    till_expected     = EXCLUDED.till_expected,
    deposits_expected = EXCLUDED.deposits_expected,
    till_variance     = EXCLUDED.till_variance,
    deposit_variance  = EXCLUDED.deposit_variance,
    closing_balance   = EXCLUDED.closing_balance;

  UPDATE cash_reconciliation
  SET is_locked = true
  WHERE id = p_id;

END;
$$;
