-- ============================================================
-- 128: Return charges note
--
-- Problem: when staff add a return charge at settlement (e.g.
-- fuel shortage, damage) there is no field to record what the
-- charge is for. Only the numeric amount was stored.
--
-- Fix: add orders.return_charges_note text column and update
-- settle_order_atomic to accept an optional note that is written
-- in the same atomic UPDATE that stamps the return_charges delta.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_charges_note text;

-- ============================================================
-- Updated settle_order_atomic — adds optional p_return_charges_note
-- parameter. All prior parameters and behaviour are preserved;
-- callers that omit the note will pass NULL and the column will
-- remain NULL (or retain its previous value if ever re-settled,
-- though that path is not currently reachable).
-- ============================================================
DO $migration$
BEGIN
  EXECUTE $fn$
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
  p_absorbed_extension_payment_ids      jsonb          DEFAULT '[]'::jsonb,
  p_card_fee_surcharge_delta            numeric(12,2)  DEFAULT 0,
  p_return_charges_delta                numeric(12,2)  DEFAULT 0,
  p_return_charges_note                 text           DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leg     jsonb;
  vehicle jsonb;
  ext_id  jsonb;
BEGIN
  PERFORM public.assert_balanced_legs(p_journal_legs);

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

  IF p_fleet_releases IS NOT NULL AND jsonb_array_length(p_fleet_releases) > 0 THEN
    FOR vehicle IN SELECT * FROM jsonb_array_elements(p_fleet_releases)
    LOOP
      UPDATE public.fleet
      SET status     = 'Available',
          updated_at = now()
      WHERE id = vehicle->>'vehicle_id';
    END LOOP;
  END IF;

  IF p_absorbed_extension_payment_ids IS NOT NULL
     AND jsonb_array_length(p_absorbed_extension_payment_ids) > 0 THEN
    FOR ext_id IN SELECT * FROM jsonb_array_elements(p_absorbed_extension_payment_ids)
    LOOP
      UPDATE public.payments
      SET settlement_status = 'absorbed',
          settlement_ref    = COALESCE(settlement_ref, 'Absorbed into settlement')
      WHERE id = (ext_id #>> '{}')
        AND order_id = p_order_id
        AND payment_type = 'extension'
        AND settlement_status = 'pending';
    END LOOP;
  END IF;

  -- Stamp the order as completed.
  -- • card_fee_surcharge_delta: bumps final_total + card_fee_surcharge
  --   when the settlement payment was collected by card.
  -- • return_charges_delta: bumps final_total + return_charges when
  --   condition/fuel charges are assessed at return time.
  -- • return_charges_note: free-text label for the return charge
  --   (e.g. "Fuel shortage", "Damage"). Written only when non-NULL.
  -- All default to 0/NULL so older callers are unaffected.
  UPDATE public.orders
  SET status               = 'completed',
      balance_due          = p_final_balance_due,
      final_total          = COALESCE(final_total, 0)
                             + COALESCE(p_card_fee_surcharge_delta, 0)
                             + COALESCE(p_return_charges_delta, 0),
      card_fee_surcharge   = COALESCE(card_fee_surcharge, 0)
                             + COALESCE(p_card_fee_surcharge_delta, 0),
      return_charges       = COALESCE(return_charges, 0)
                             + COALESCE(p_return_charges_delta, 0),
      return_charges_note  = COALESCE(p_return_charges_note, return_charges_note),
      settled_at           = p_settled_at,
      updated_at           = p_settled_at
  WHERE id = p_order_id;
END;
$$;
$fn$;
END
$migration$;

-- Re-apply EXECUTE permissions for the new 15-argument signature.
-- Prior overloads (12-, 13-, and 14-argument) remain available so
-- any in-flight requests are not broken.
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.settle_order_atomic(
    text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
    text, text, date, jsonb, jsonb, numeric, numeric, text
  ) FROM authenticated';

  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.settle_order_atomic(
    text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
    text, text, date, jsonb, jsonb, numeric, numeric, text
  ) FROM anon';

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_order_atomic(
    text, text, timestamptz, numeric, jsonb, jsonb, jsonb,
    text, text, date, jsonb, jsonb, numeric, numeric, text
  ) TO service_role';
END $$;
