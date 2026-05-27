-- ============================================================
-- 120: collect_payment_atomic — absorb pending extension IOUs
--
-- Problem: when staff use "Record Payment" to collect a mid-rental
-- extension payment, the pending extension IOU row (payment_type =
-- 'extension', settlement_status = 'pending') was never marked as
-- absorbed. The balance formula:
--
--   balance = MAX(final_total − totalPaid, pendingExtensionsTotal)
--
-- uses pendingExtensionsTotal as a fallback floor. Even after the
-- cash is collected and final_total − totalPaid = 0, a lingering
-- pending IOU keeps balance_due at the IOU amount (e.g. ₱595).
-- The cash-up page similarly shows those IOUs as uncollected.
--
-- Fix: add an optional p_absorbed_extension_iou_ids jsonb parameter.
-- When provided, mark those payment rows settlement_status = 'absorbed'
-- in the same transaction, exactly like settle_order_atomic does.
--
-- The old 14-parameter signature is dropped first to avoid an
-- ambiguous overload; all existing callers use named parameters so
-- they pick up the new function via the DEFAULT NULL for the new arg.
-- ============================================================

-- Drop the old signature so the new one cleanly replaces it.
DO $migration$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.collect_payment_atomic(
    text, text, text, numeric, text, text, date,
    text, text, text, text, date, jsonb, text
  )';

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.collect_payment_atomic(
  p_payment_id                   text,
  p_order_id                     text,
  p_store_id                     text,
  p_amount                       numeric(12,2),
  p_payment_method_id            text,
  p_account_id                   text,
  p_transaction_date             date,
  p_customer_id                  text,
  p_payment_type                 text,
  p_journal_transaction_id       text,
  p_journal_period               text,
  p_journal_date                 date,
  p_journal_legs                 jsonb,
  p_notes                        text    DEFAULT NULL,
  p_absorbed_extension_iou_ids   jsonb   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leg jsonb;
BEGIN
  -- 1. Validate that the legs are balanced (debit sum = credit sum).
  PERFORM public.assert_balanced_legs(p_journal_legs);

  -- 2. Insert the payment row.
  INSERT INTO public.payments (
    id, order_id, store_id, amount, payment_method_id, account_id,
    transaction_date, customer_id, payment_type, notes
  ) VALUES (
    p_payment_id,
    p_order_id,
    p_store_id,
    p_amount,
    p_payment_method_id,
    p_account_id,
    p_transaction_date,
    p_customer_id,
    p_payment_type,
    p_notes
  );

  -- 3. Insert one journal_entries row per leg.
  IF p_journal_legs IS NOT NULL AND jsonb_array_length(p_journal_legs) > 0 THEN
    FOR leg IN SELECT * FROM jsonb_array_elements(p_journal_legs) LOOP
      INSERT INTO public.journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id
      ) VALUES (
        leg->>'id',
        p_journal_transaction_id,
        p_journal_period,
        p_journal_date,
        p_store_id,
        leg->>'account_id',
        COALESCE((leg->>'debit')::numeric(12,2),  0),
        COALESCE((leg->>'credit')::numeric(12,2), 0),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id'
      );
    END LOOP;
  END IF;

  -- 4. Absorb pending extension IOUs whose cash has now been collected.
  --    Only rows that belong to this order, are extension type, and are
  --    still pending are touched — a safety guard against stale IDs.
  IF p_absorbed_extension_iou_ids IS NOT NULL
     AND jsonb_array_length(p_absorbed_extension_iou_ids) > 0 THEN
    UPDATE public.payments
    SET settlement_status = 'absorbed'
    WHERE id IN (
            SELECT jsonb_array_elements_text(p_absorbed_extension_iou_ids)
          )
      AND order_id        = p_order_id
      AND payment_type    = 'extension'
      AND settlement_status = 'pending';
  END IF;
END;
$$;
$fn$;

-- ============================================================
-- Backfill: absorb any existing pending IOUs that have already
-- been paid (i.e. net rental cash received >= final_total).
-- This corrects bookings like Ruth Hand's where ₱690 was collected
-- via "Record Payment" but the ₱595 IOU was never marked absorbed.
-- ============================================================

UPDATE public.payments iou
SET settlement_status = 'absorbed'
WHERE iou.payment_type    = 'extension'
  AND iou.settlement_status = 'pending'
  AND iou.order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = iou.order_id
      AND (
        -- Net rental cash received (mirrors the display formula)
        SELECT COALESCE(SUM(
          CASE
            WHEN p2.payment_type = 'refund' THEN -p2.amount
            ELSE p2.amount
          END
        ), 0)
        FROM public.payments p2
        WHERE p2.order_id = o.id
          AND p2.payment_type <> 'deposit'
          AND NOT (
            p2.payment_type = 'extension'
            AND p2.settlement_status IN ('pending', 'absorbed')
          )
      ) >= COALESCE(o.final_total, 0)
  );

-- ============================================================
-- Lock down execution — only the API service role may invoke.
-- ============================================================

  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.collect_payment_atomic(
    text, text, text, numeric, text, text, date,
    text, text, text, text, date, jsonb, text, jsonb
  ) FROM authenticated';

  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.collect_payment_atomic(
    text, text, text, numeric, text, text, date,
    text, text, text, text, date, jsonb, text, jsonb
  ) FROM anon';

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.collect_payment_atomic(
    text, text, text, numeric, text, text, date,
    text, text, text, text, date, jsonb, text, jsonb
  ) TO service_role';
END
$migration$;
