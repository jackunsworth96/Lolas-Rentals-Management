CREATE OR REPLACE FUNCTION match_card_settlement(
  p_transaction_id    text,
  p_period            text,
  p_date              date,
  p_store_id          text,
  p_legs              jsonb,
  p_settlement_ids    integer[],
  p_is_paid           boolean,
  p_date_settled      date,
  p_settlement_ref    text,
  p_net_amount        numeric(12,2),
  p_fee_expense       numeric(12,2),
  p_account_id        text,
  p_payment_ids       text[],
  p_settlement_status text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description,
    reference_type, reference_id, created_by
  )
  SELECT
    leg->>'id',
    p_transaction_id,
    p_period,
    p_date,
    p_store_id,
    leg->>'account_id',
    (leg->>'debit')::numeric(12,2),
    (leg->>'credit')::numeric(12,2),
    leg->>'description',
    leg->>'reference_type',
    leg->>'reference_id',
    NULL
  FROM jsonb_array_elements(p_legs) AS leg;

  UPDATE card_settlements
  SET
    is_paid        = p_is_paid,
    date_settled   = p_date_settled,
    settlement_ref = p_settlement_ref,
    net_amount     = p_net_amount,
    fee_expense    = p_fee_expense,
    account_id     = p_account_id
  WHERE id = ANY(p_settlement_ids);

  IF array_length(p_payment_ids, 1) > 0 THEN
    UPDATE payments
    SET settlement_status = p_settlement_status
    WHERE id = ANY(p_payment_ids);
  END IF;

END;
$$;
