-- Record return-time charges (fuel, damage, etc.) as their own payment during
-- settlement. This keeps the selected Cash/GCash tender visible in payment
-- history and Cash-Up without reducing the customer's deposit refund.

CREATE OR REPLACE FUNCTION public.settle_order_atomic(
  p_order_id                            text,
  p_store_id                            text,
  p_settled_at                          timestamptz,
  p_final_balance_due                   numeric(12,2),
  p_final_payment                       jsonb,
  p_card_settlement                     jsonb,
  p_fleet_releases                      jsonb,
  p_journal_transaction_id              text,
  p_journal_period                      text,
  p_journal_date                        date,
  p_journal_legs                        jsonb,
  p_absorbed_extension_payment_ids      jsonb,
  p_card_fee_surcharge_delta            numeric(12,2),
  p_return_charges_delta                numeric(12,2),
  p_return_charges_note                 text,
  p_deposit_refund_payment              jsonb,
  p_return_charge_payment               jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate the existing settlement work to the prior 16-argument overload.
  -- Both calls run in this transaction, so a failed payment insert rolls back
  -- the order completion, journal entries, and fleet releases as well.
  PERFORM public.settle_order_atomic(
    p_order_id,
    p_store_id,
    p_settled_at,
    p_final_balance_due,
    p_final_payment,
    p_card_settlement,
    p_fleet_releases,
    p_journal_transaction_id,
    p_journal_period,
    p_journal_date,
    p_journal_legs,
    p_absorbed_extension_payment_ids,
    p_card_fee_surcharge_delta,
    p_return_charges_delta,
    p_return_charges_note,
    p_deposit_refund_payment
  );

  IF p_return_charge_payment IS NOT NULL
     AND p_return_charge_payment <> 'null'::jsonb THEN
    INSERT INTO public.payments (
      id, order_id, store_id, amount, payment_type,
      payment_method_id, transaction_date,
      settlement_status, settlement_ref,
      customer_id, account_id
    ) VALUES (
      p_return_charge_payment->>'id',
      p_order_id,
      p_store_id,
      (p_return_charge_payment->>'amount')::numeric(12,2),
      COALESCE(p_return_charge_payment->>'payment_type', 'return_charge'),
      p_return_charge_payment->>'payment_method_id',
      (p_return_charge_payment->>'transaction_date')::date,
      NULL,
      p_return_charge_payment->>'settlement_ref',
      p_return_charge_payment->>'customer_id',
      p_return_charge_payment->>'account_id'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_order_atomic(
  text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
  text, text, date, jsonb, jsonb, numeric, numeric, text, jsonb, jsonb
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.settle_order_atomic(
  text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
  text, text, date, jsonb, jsonb, numeric, numeric, text, jsonb, jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.settle_order_atomic(
  text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
  text, text, date, jsonb, jsonb, numeric, numeric, text, jsonb, jsonb
) TO service_role;
