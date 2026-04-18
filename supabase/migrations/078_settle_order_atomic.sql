-- ============================================================
-- 078: settle_order_atomic RPC
-- Folds final-payment insert, card-settlement insert, every
-- journal leg (payment + deposit-applied + refund), fleet
-- releases, and the order-level completion UPDATE into a
-- single PL/pgSQL transaction. Fixes AC-04 (settle-order was
-- doing 7+ non-atomic writes: a failure after the first one
-- would leave a payment row with no matching journal entry,
-- or a journal entry with no fleet release, forever.)
-- ============================================================

-- Ensure the settlement timestamp column exists before the RPC
-- references it. Safe to re-run.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

CREATE OR REPLACE FUNCTION public.settle_order_atomic(
  p_order_id               text,
  p_store_id               text,
  p_settled_at             timestamptz,
  p_final_balance_due      numeric(12,2),
  p_final_payment          jsonb,
  p_card_settlement        jsonb,
  p_fleet_releases         jsonb,
  p_journal_transaction_id text,
  p_journal_period         text,
  p_journal_date           date,
  p_journal_legs           jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leg     jsonb;
  vehicle jsonb;
BEGIN
  -- 1. Validate journal balance before any writes.
  PERFORM public.assert_balanced_legs(p_journal_legs);

  -- 2. Final payment row (optional — only present if there was
  -- a remaining balance after deposit that was actually collected).
  IF p_final_payment IS NOT NULL AND p_final_payment <> 'null'::jsonb THEN
    INSERT INTO public.payments (
      id, order_id, store_id, amount, payment_type,
      payment_method_id, transaction_date,
      settlement_status, settlement_ref,
      customer_id, account_id
    ) VALUES (
      p_final_payment->>'id',
      p_order_id,
      p_store_id,
      (p_final_payment->>'amount')::numeric(12,2),
      COALESCE(p_final_payment->>'payment_type', 'settlement'),
      p_final_payment->>'payment_method_id',
      (p_final_payment->>'transaction_date')::date,
      p_final_payment->>'settlement_status',
      p_final_payment->>'settlement_ref',
      p_final_payment->>'customer_id',
      p_final_payment->>'account_id'
    );
  END IF;

  -- 3. Card settlement row (optional — only present for card
  -- payments so the settlements-matching pipeline can later
  -- reconcile the fee/net amount).
  IF p_card_settlement IS NOT NULL AND p_card_settlement <> 'null'::jsonb THEN
    INSERT INTO public.card_settlements (
      store_id, order_id, customer_id, name, amount, ref_number,
      raw_date, forecasted_date, is_paid, date_settled,
      settlement_ref, net_amount, fee_expense, account_id, batch_no
    ) VALUES (
      COALESCE(p_card_settlement->>'store_id', p_store_id),
      p_order_id,
      p_card_settlement->>'customer_id',
      p_card_settlement->>'name',
      (p_card_settlement->>'amount')::numeric(12,2),
      p_card_settlement->>'ref_number',
      p_card_settlement->>'raw_date',
      NULLIF(p_card_settlement->>'forecasted_date', '')::date,
      COALESCE((p_card_settlement->>'is_paid')::boolean, false),
      NULLIF(p_card_settlement->>'date_settled', '')::date,
      p_card_settlement->>'settlement_ref',
      NULLIF(p_card_settlement->>'net_amount', '')::numeric(12,2),
      NULLIF(p_card_settlement->>'fee_expense', '')::numeric(12,2),
      p_card_settlement->>'account_id',
      p_card_settlement->>'batch_no'
    );
  END IF;

  -- 4. All journal legs share a single transaction_id; the
  -- per-leg reference_type / reference_id pair preserves the
  -- original posting grouping (payment / deposit / refund).
  IF p_journal_legs IS NOT NULL AND jsonb_array_length(p_journal_legs) > 0 THEN
    FOR leg IN SELECT * FROM jsonb_array_elements(p_journal_legs)
    LOOP
      INSERT INTO public.journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id, created_by
      ) VALUES (
        leg->>'id',
        p_journal_transaction_id,
        p_journal_period,
        p_journal_date,
        p_store_id,
        leg->>'account_id',
        COALESCE((leg->>'debit')::numeric(12,2), 0),
        COALESCE((leg->>'credit')::numeric(12,2), 0),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id',
        NULL
      );
    END LOOP;
  END IF;

  -- 5. Release every settled vehicle back to Available.
  IF p_fleet_releases IS NOT NULL AND jsonb_array_length(p_fleet_releases) > 0 THEN
    FOR vehicle IN SELECT * FROM jsonb_array_elements(p_fleet_releases)
    LOOP
      UPDATE public.fleet
      SET status     = 'Available',
          updated_at = now()
      WHERE id = vehicle->>'vehicle_id';
    END LOOP;
  END IF;

  -- 6. Transition the order to completed + stamp the final
  -- balance and settlement timestamp.
  UPDATE public.orders
  SET status      = 'completed',
      balance_due = p_final_balance_due,
      settled_at  = p_settled_at,
      updated_at  = p_settled_at
  WHERE id = p_order_id;
END;
$$;


-- ============================================================
-- Lock down execution — only the API service role may invoke.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.settle_order_atomic(
  text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
  text, text, date, jsonb
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.settle_order_atomic(
  text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
  text, text, date, jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.settle_order_atomic(
  text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
  text, text, date, jsonb
) TO service_role;
