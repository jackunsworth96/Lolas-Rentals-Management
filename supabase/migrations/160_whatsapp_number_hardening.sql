-- ============================================================
-- 160: WhatsApp number hardening
--
-- 1. customers.mobile_needs_review — set by the API when an
--    automation could not message the stored number; cleared when
--    staff correct it.
-- 2. whatsapp_send_failures — one row per booking / automation /
--    number that was skipped because the number was invalid. Used to
--    alert staff once instead of on every job run. Kept separate from
--    the *_reminder_log tables so a failure never blocks the retry
--    after the number is fixed.
-- 3. cascade_customer_contact_update — the mobile cascade previously
--    only reached orders_raw / transfers through the customer's email.
--    It now also follows the customer's own orders (orders.booking_token
--    = orders_raw.order_reference / transfers.booking_token), so a fix
--    on a customer without an email still reaches the reminder jobs.
--
-- No CHECK constraint on phone columns: legacy rows would violate it.
-- Validation is enforced by the API (libphonenumber-js).
-- ============================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS mobile_needs_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.mobile_needs_review IS
  'True when an automated WhatsApp message could not be sent because the stored mobile is invalid.';

CREATE INDEX IF NOT EXISTS customers_mobile_needs_review_idx
  ON public.customers (store_id)
  WHERE mobile_needs_review;

CREATE TABLE IF NOT EXISTS public.whatsapp_send_failures (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text        NOT NULL DEFAULT '',
  automation        text        NOT NULL,
  raw_phone         text        NOT NULL,
  reason            text        NOT NULL DEFAULT 'invalid_phone',
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  UNIQUE (booking_reference, automation, raw_phone)
);

CREATE INDEX IF NOT EXISTS whatsapp_send_failures_reference_idx
  ON public.whatsapp_send_failures (booking_reference);

ALTER TABLE public.whatsapp_send_failures ENABLE ROW LEVEL SECURITY;
-- All writes go through the API server (service role key, bypasses RLS).

CREATE OR REPLACE FUNCTION public.cascade_customer_contact_update(
  p_customer_id     text,
  p_new_name        text,
  p_new_email       text,
  p_new_mobile      text,
  p_new_notes       text,
  p_new_blacklisted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_old_email  text;
  v_old_mobile      text;
  v_old_name        text;
  v_norm_new_email  text;
  v_email_changed   boolean;
  v_mobile_changed  boolean;
  v_name_changed    boolean;
  v_email_key       text;
  v_booking_refs    text[];
  v_orders_raw_upd  int := 0;
  v_paw_card_upd    int := 0;
  v_transfers_upd   int := 0;
  v_tmp_count       int;
  v_conflict_id     text;
BEGIN
  SELECT
    lower(trim(coalesce(email, ''))),
    mobile,
    name
  INTO v_norm_old_email, v_old_mobile, v_old_name
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id;
  END IF;

  v_norm_new_email := CASE
    WHEN p_new_email IS NULL THEN NULL
    ELSE lower(trim(p_new_email))
  END;

  v_email_changed  := coalesce(v_norm_new_email, '') <> v_norm_old_email;
  v_mobile_changed := coalesce(trim(p_new_mobile), '') <> coalesce(trim(v_old_mobile), '');
  v_name_changed   := coalesce(p_new_name, '') <> coalesce(v_old_name, '');

  IF v_email_changed AND v_norm_new_email IS NOT NULL THEN
    SELECT id INTO v_conflict_id
    FROM public.customers
    WHERE lower(trim(email)) = v_norm_new_email
      AND id <> p_customer_id
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'EMAIL_CONFLICT:%', v_norm_new_email;
    END IF;
  END IF;

  UPDATE public.customers SET
    name        = p_new_name,
    email       = v_norm_new_email,
    mobile      = p_new_mobile,
    notes       = p_new_notes,
    blacklisted = p_new_blacklisted,
    mobile_needs_review = CASE WHEN v_mobile_changed THEN false ELSE mobile_needs_review END,
    updated_at  = now()
  WHERE id = p_customer_id;

  v_email_key := coalesce(v_norm_new_email, NULLIF(v_norm_old_email, ''));

  SELECT coalesce(array_agg(booking_token), ARRAY[]::text[])
  INTO v_booking_refs
  FROM public.orders
  WHERE customer_id = p_customer_id
    AND booking_token IS NOT NULL;

  IF v_email_changed AND v_norm_old_email <> '' THEN
    UPDATE public.orders_raw
    SET customer_email = v_norm_new_email
    WHERE lower(trim(customer_email)) = v_norm_old_email;
    GET DIAGNOSTICS v_orders_raw_upd = ROW_COUNT;
  END IF;

  IF v_email_changed AND v_norm_old_email <> '' THEN
    UPDATE public.paw_card_entries
    SET email = v_norm_new_email
    WHERE lower(trim(email)) = v_norm_old_email;
    GET DIAGNOSTICS v_paw_card_upd = ROW_COUNT;
  END IF;

  IF v_email_changed AND v_norm_old_email <> '' THEN
    UPDATE public.transfers
    SET customer_email = v_norm_new_email
    WHERE lower(trim(customer_email)) = v_norm_old_email;
    GET DIAGNOSTICS v_transfers_upd = ROW_COUNT;
  END IF;

  -- Mobile: scoped to this customer's email OR this customer's own bookings.
  IF v_mobile_changed THEN
    UPDATE public.orders_raw
    SET customer_mobile = p_new_mobile
    WHERE (v_email_key IS NOT NULL AND lower(trim(customer_email)) = v_email_key)
       OR order_reference = ANY (v_booking_refs);

    GET DIAGNOSTICS v_tmp_count = ROW_COUNT;
    IF NOT v_email_changed THEN
      v_orders_raw_upd := v_orders_raw_upd + v_tmp_count;
    END IF;

    UPDATE public.transfers
    SET contact_number = p_new_mobile
    WHERE (v_email_key IS NOT NULL AND lower(trim(customer_email)) = v_email_key)
       OR booking_token = ANY (v_booking_refs);

    GET DIAGNOSTICS v_tmp_count = ROW_COUNT;
    IF NOT v_email_changed THEN
      v_transfers_upd := v_transfers_upd + v_tmp_count;
    END IF;

    IF v_old_mobile IS NOT NULL THEN
      UPDATE public.whatsapp_send_failures
      SET resolved_at = now()
      WHERE raw_phone = v_old_mobile
        AND resolved_at IS NULL;
    END IF;
  END IF;

  IF v_name_changed AND v_email_key IS NOT NULL THEN
    UPDATE public.orders_raw
    SET customer_name = p_new_name
    WHERE lower(trim(customer_email)) = v_email_key;

    UPDATE public.transfers
    SET customer_name = p_new_name
    WHERE lower(trim(customer_email)) = v_email_key;
  END IF;

  RETURN jsonb_build_object(
    'emailChanged',     v_email_changed,
    'mobileChanged',    v_mobile_changed,
    'nameChanged',      v_name_changed,
    'ordersRawUpdated', v_orders_raw_upd,
    'pawCardUpdated',   v_paw_card_upd,
    'transfersUpdated', v_transfers_upd
  );
END;
$$;

COMMENT ON FUNCTION public.cascade_customer_contact_update IS
  'Atomically updates a customer profile and propagates contact-field changes '
  'to orders_raw, paw_card_entries and transfers (mobile also via the customer''s '
  'own bookings) so WhatsApp/email automations use the corrected details.';
