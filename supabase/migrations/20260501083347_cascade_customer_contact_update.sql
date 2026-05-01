-- ============================================================
-- cascade_customer_contact_update
--
-- Updates a customer's contact details (email, mobile, name,
-- notes, blacklisted) and propagates email/mobile/name changes
-- to every table that stores a denormalised copy:
--   • orders_raw  (customer_email, customer_mobile, customer_name)
--   • paw_card_entries (email)
--   • transfers   (customer_email, contact_number, customer_name)
--
-- All changes happen inside a single transaction.
-- Returns a JSONB summary of what was updated.
--
-- Error codes raised:
--   'EMAIL_CONFLICT:<email>' — another customer already owns that email.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cascade_customer_contact_update(
  p_customer_id     text,
  p_new_name        text,        -- required; customer name cannot be null
  p_new_email       text,        -- nullable: NULL clears the email field
  p_new_mobile      text,        -- nullable: NULL clears the mobile field
  p_new_notes       text,        -- nullable: NULL clears notes
  p_new_blacklisted boolean      -- required
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
  v_email_key       text;   -- email to scope linked-table updates
  v_orders_raw_upd  int := 0;
  v_paw_card_upd    int := 0;
  v_transfers_upd   int := 0;
  v_tmp_count       int;
  v_conflict_id     text;
BEGIN
  -- ── Load current values ────────────────────────────────────────────────────
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

  -- Normalise new email (lowercase, trimmed); NULL stays NULL.
  v_norm_new_email := CASE
    WHEN p_new_email IS NULL THEN NULL
    ELSE lower(trim(p_new_email))
  END;

  v_email_changed  := coalesce(v_norm_new_email, '') <> v_norm_old_email;
  v_mobile_changed := coalesce(trim(p_new_mobile), '') <> coalesce(trim(v_old_mobile), '');
  v_name_changed   := coalesce(p_new_name, '') <> coalesce(v_old_name, '');

  -- ── Conflict check ─────────────────────────────────────────────────────────
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

  -- ── 1. Update customers ────────────────────────────────────────────────────
  UPDATE public.customers SET
    name        = p_new_name,
    email       = v_norm_new_email,
    mobile      = p_new_mobile,
    notes       = p_new_notes,
    blacklisted = p_new_blacklisted,
    updated_at  = now()
  WHERE id = p_customer_id;

  -- Determine the email key that scopes all linked-table updates.
  -- Use the new email (if we just set one) or fall back to the old email.
  v_email_key := coalesce(v_norm_new_email, NULLIF(v_norm_old_email, ''));

  -- ── 2. Cascade email → orders_raw ─────────────────────────────────────────
  IF v_email_changed AND v_norm_old_email <> '' THEN
    UPDATE public.orders_raw
    SET customer_email = v_norm_new_email
    WHERE lower(trim(customer_email)) = v_norm_old_email;
    GET DIAGNOSTICS v_orders_raw_upd = ROW_COUNT;
  END IF;

  -- ── 3. Cascade email → paw_card_entries ───────────────────────────────────
  IF v_email_changed AND v_norm_old_email <> '' THEN
    UPDATE public.paw_card_entries
    SET email = v_norm_new_email
    WHERE lower(trim(email)) = v_norm_old_email;
    GET DIAGNOSTICS v_paw_card_upd = ROW_COUNT;
  END IF;

  -- ── 4. Cascade email → transfers ──────────────────────────────────────────
  IF v_email_changed AND v_norm_old_email <> '' THEN
    UPDATE public.transfers
    SET customer_email = v_norm_new_email
    WHERE lower(trim(customer_email)) = v_norm_old_email;
    GET DIAGNOSTICS v_transfers_upd = ROW_COUNT;
  END IF;

  -- ── 5. Cascade mobile (scoped to this customer's email) ───────────────────
  IF v_mobile_changed AND v_email_key IS NOT NULL THEN
    UPDATE public.orders_raw
    SET customer_mobile = p_new_mobile
    WHERE lower(trim(customer_email)) = v_email_key;

    GET DIAGNOSTICS v_tmp_count = ROW_COUNT;
    IF NOT v_email_changed THEN
      v_orders_raw_upd := v_orders_raw_upd + v_tmp_count;
    END IF;

    UPDATE public.transfers
    SET contact_number = p_new_mobile
    WHERE lower(trim(customer_email)) = v_email_key;

    GET DIAGNOSTICS v_tmp_count = ROW_COUNT;
    IF NOT v_email_changed THEN
      v_transfers_upd := v_transfers_upd + v_tmp_count;
    END IF;
  END IF;

  -- ── 6. Cascade name (scoped to this customer's email) ─────────────────────
  IF v_name_changed AND v_email_key IS NOT NULL THEN
    UPDATE public.orders_raw
    SET customer_name = p_new_name
    WHERE lower(trim(customer_email)) = v_email_key;

    UPDATE public.transfers
    SET customer_name = p_new_name
    WHERE lower(trim(customer_email)) = v_email_key;
  END IF;

  -- ── Return summary ─────────────────────────────────────────────────────────
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
  'to orders_raw, paw_card_entries and transfers so email automations and '
  'Paw Card login continue to work with the corrected details.';
