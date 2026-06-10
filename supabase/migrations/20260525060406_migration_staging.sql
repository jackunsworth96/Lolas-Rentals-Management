SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item jsonb;
  addon jsonb;
  vehicle jsonb;
  leg jsonb;
BEGIN
  -- 1. Upsert the order record
  INSERT INTO orders (
    id, store_id, woo_order_id, customer_id, employee_id,
    order_date, status, web_notes, quantity, web_quote_raw,
    security_deposit, deposit_status, card_fee_surcharge,
    return_charges, final_total, balance_due, payment_method_id,
    deposit_method_id, booking_token, tips, charity_donation, updated_at
  ) VALUES (
    p_order_id, p_store_id, p_woo_order_id, p_customer_id, p_employee_id,
    p_order_date, p_status, p_web_notes, p_quantity, p_web_quote_raw,
    p_security_deposit, p_deposit_status, p_card_fee_surcharge,
    p_return_charges, p_final_total, p_balance_due, p_payment_method_id,
    p_deposit_method_id, p_booking_token, p_tips, p_charity_donation,
    p_updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    store_id           = EXCLUDED.store_id,
    woo_order_id       = EXCLUDED.woo_order_id,
    customer_id        = EXCLUDED.customer_id,
    employee_id        = EXCLUDED.employee_id,
    order_date         = EXCLUDED.order_date,
    status             = EXCLUDED.status,
    web_notes          = EXCLUDED.web_notes,
    quantity           = EXCLUDED.quantity,
    web_quote_raw      = EXCLUDED.web_quote_raw,
    security_deposit   = EXCLUDED.security_deposit,
    deposit_status     = EXCLUDED.deposit_status,
    card_fee_surcharge = EXCLUDED.card_fee_surcharge,
    return_charges     = EXCLUDED.return_charges,
    final_total        = EXCLUDED.final_total,
    balance_due        = EXCLUDED.balance_due,
    payment_method_id  = EXCLUDED.payment_method_id,
    deposit_method_id  = EXCLUDED.deposit_method_id,
    booking_token      = EXCLUDED.booking_token,
    tips               = EXCLUDED.tips,
    charity_donation   = EXCLUDED.charity_donation,
    updated_at         = EXCLUDED.updated_at;

  -- 2. Upsert order items
  FOR item IN SELECT * FROM jsonb_array_elements(p_order_items)
  LOOP
    INSERT INTO order_items (
      id, store_id, order_id, vehicle_id, vehicle_name,
      pickup_datetime, dropoff_datetime, rental_days_count,
      pickup_location, dropoff_location, pickup_fee, dropoff_fee,
      rental_rate, helmet_numbers, discount, ops_notes, return_condition
    ) VALUES (
      item->>'id',
      item->>'store_id',
      item->>'order_id',
      item->>'vehicle_id',
      item->>'vehicle_name',
      (item->>'pickup_datetime')::timestamptz,
      (item->>'dropoff_datetime')::timestamptz,
      (item->>'rental_days_count')::integer,
      item->>'pickup_location',
      item->>'dropoff_location',
      (item->>'pickup_fee')::numeric(12,2),
      (item->>'dropoff_fee')::numeric(12,2),
      (item->>'rental_rate')::numeric(12,2),
      item->>'helmet_numbers',
      (item->>'discount')::numeric(12,2),
      item->>'ops_notes',
      item->>'return_condition'
    )
    ON CONFLICT (id) DO UPDATE SET
      store_id          = EXCLUDED.store_id,
      order_id          = EXCLUDED.order_id,
      vehicle_id        = EXCLUDED.vehicle_id,
      vehicle_name      = EXCLUDED.vehicle_name,
      pickup_datetime   = EXCLUDED.pickup_datetime,
      dropoff_datetime  = EXCLUDED.dropoff_datetime,
      rental_days_count = EXCLUDED.rental_days_count,
      pickup_location   = EXCLUDED.pickup_location,
      dropoff_location  = EXCLUDED.dropoff_location,
      pickup_fee        = EXCLUDED.pickup_fee,
      dropoff_fee       = EXCLUDED.dropoff_fee,
      rental_rate       = EXCLUDED.rental_rate,
      helmet_numbers    = EXCLUDED.helmet_numbers,
      discount          = EXCLUDED.discount,
      ops_notes         = EXCLUDED.ops_notes,
      return_condition  = EXCLUDED.return_condition;
  END LOOP;

  -- 3. Upsert order addons
  FOR addon IN SELECT * FROM jsonb_array_elements(p_order_addons)
  LOOP
    INSERT INTO order_addons (
      id, order_id, addon_name, addon_price,
      addon_type, quantity, total_amount, store_id
    ) VALUES (
      addon->>'id',
      addon->>'order_id',
      addon->>'addon_name',
      (addon->>'addon_price')::numeric(12,2),
      addon->>'addon_type',
      (addon->>'quantity')::integer,
      (addon->>'total_amount')::numeric(12,2),
      addon->>'store_id'
    )
    ON CONFLICT (id) DO UPDATE SET
      order_id    = EXCLUDED.order_id,
      addon_name  = EXCLUDED.addon_name,
      addon_price = EXCLUDED.addon_price,
      addon_type  = EXCLUDED.addon_type,
      quantity    = EXCLUDED.quantity,
      total_amount = EXCLUDED.total_amount,
      store_id    = EXCLUDED.store_id;
  END LOOP;

  -- 4. Update fleet vehicle statuses
  FOR vehicle IN SELECT * FROM jsonb_array_elements(p_fleet_updates)
  LOOP
    UPDATE fleet
    SET
      status     = vehicle->>'status',
      updated_at = (vehicle->>'updated_at')::timestamptz
    WHERE id = vehicle->>'id';
  END LOOP;

  -- 5. Insert journal entries (only if legs array is non-empty)
  IF jsonb_array_length(p_journal_legs) > 0 THEN
    FOR leg IN SELECT * FROM jsonb_array_elements(p_journal_legs)
    LOOP
      INSERT INTO journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id, created_by
      ) VALUES (
        leg->>'id',
        p_journal_transaction_id,
        p_journal_period,
        p_journal_date,
        p_journal_store_id,
        leg->>'account_id',
        (leg->>'debit')::numeric(12,2),
        (leg->>'credit')::numeric(12,2),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id',
        NULL
      );
    END LOOP;
  END IF;

END;
$$;
ALTER FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb", "p_rental_payment_id" "text", "p_rental_amount" numeric, "p_transaction_date" "date", "p_deposit_payment_id" "text", "p_deposit_amount" numeric, "p_deposit_collected" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item    jsonb;
  addon   jsonb;
  vehicle jsonb;
  leg     jsonb;
BEGIN
  -- 0. Guarantee journal legs are balanced before any writes (AC-05).
  PERFORM public.assert_balanced_legs(p_journal_legs);

  -- 1. Upsert the order record
  INSERT INTO public.orders (
    id, store_id, woo_order_id, customer_id, employee_id,
    order_date, status, web_notes, quantity, web_quote_raw,
    security_deposit, deposit_status, card_fee_surcharge,
    return_charges, final_total, balance_due, payment_method_id,
    deposit_method_id, booking_token, tips, charity_donation, updated_at
  ) VALUES (
    p_order_id, p_store_id, p_woo_order_id, p_customer_id, p_employee_id,
    p_order_date, p_status, p_web_notes, p_quantity, p_web_quote_raw,
    p_security_deposit, p_deposit_status, p_card_fee_surcharge,
    p_return_charges, p_final_total, p_balance_due, p_payment_method_id,
    p_deposit_method_id, p_booking_token, p_tips, p_charity_donation, p_updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    status            = EXCLUDED.status,
    web_notes         = EXCLUDED.web_notes,
    final_total       = EXCLUDED.final_total,
    balance_due       = EXCLUDED.balance_due,
    deposit_status    = EXCLUDED.deposit_status,
    charity_donation  = EXCLUDED.charity_donation,
    updated_at        = EXCLUDED.updated_at;

  -- 2. Upsert order items — includes vehicle_name so the enriched orders
  --    endpoint can display the vehicle column for walk-in bookings.
  FOR item IN SELECT * FROM jsonb_array_elements(p_order_items) LOOP
    INSERT INTO public.order_items (
      id, order_id, store_id, vehicle_model_id, vehicle_id, vehicle_name,
      daily_rate, rental_days, subtotal, pickup_datetime, dropoff_datetime,
      pickup_location_id, dropoff_location_id, order_reference
    )
    SELECT
      (item->>'id')::text,
      p_order_id,
      p_store_id,
      (item->>'vehicleModelId')::text,
      (item->>'vehicleId')::text,
      (item->>'vehicleName')::text,
      (item->>'dailyRate')::numeric,
      (item->>'rentalDays')::integer,
      (item->>'subtotal')::numeric,
      (item->>'pickupDatetime')::timestamptz,
      (item->>'dropoffDatetime')::timestamptz,
      (item->>'pickupLocationId')::text,
      (item->>'dropoffLocationId')::text,
      (item->>'orderReference')::text
    ON CONFLICT (id) DO UPDATE SET
      vehicle_id       = EXCLUDED.vehicle_id,
      vehicle_name     = EXCLUDED.vehicle_name,
      pickup_datetime  = EXCLUDED.pickup_datetime,
      dropoff_datetime = EXCLUDED.dropoff_datetime,
      subtotal         = EXCLUDED.subtotal,
      rental_days      = EXCLUDED.rental_days;
  END LOOP;

  -- 3. Upsert order addons — fixed to use columns and JSON keys that
  --    match the order_addons table schema and the TypeScript caller payload.
  FOR addon IN SELECT * FROM jsonb_array_elements(p_order_addons) LOOP
    INSERT INTO public.order_addons (
      id, order_id, store_id, addon_name, addon_price, addon_type, quantity, total_amount
    )
    SELECT
      (addon->>'id')::text,
      p_order_id,
      (addon->>'store_id')::text,
      (addon->>'addon_name')::text,
      (addon->>'addon_price')::numeric,
      (addon->>'addon_type')::text,
      (addon->>'quantity')::integer,
      (addon->>'total_amount')::numeric
    ON CONFLICT (id) DO UPDATE SET
      addon_name   = EXCLUDED.addon_name,
      addon_price  = EXCLUDED.addon_price,
      addon_type   = EXCLUDED.addon_type,
      quantity     = EXCLUDED.quantity,
      total_amount = EXCLUDED.total_amount;
  END LOOP;

  -- 4. Update fleet vehicle statuses
  FOR vehicle IN SELECT * FROM jsonb_array_elements(p_fleet_updates) LOOP
    UPDATE public.fleet
    SET
      status     = (vehicle->>'status')::text,
      updated_at = now()
    WHERE id = (vehicle->>'id')::text;
  END LOOP;

  -- 5. Insert journal entries
  IF jsonb_array_length(p_journal_legs) > 0 THEN
    FOR leg IN SELECT * FROM jsonb_array_elements(p_journal_legs) LOOP
      INSERT INTO public.journal_entries (
        id, transaction_id, account_id, store_id, period,
        date, amount, type, description
      ) VALUES (
        gen_random_uuid(),
        p_journal_transaction_id,
        (leg->>'account_id')::text,
        p_journal_store_id,
        p_journal_period,
        p_journal_date,
        (leg->>'amount')::numeric,
        (leg->>'type')::text,
        (leg->>'description')::text
      );
    END LOOP;
  END IF;

  -- 6. Insert rental payment
  INSERT INTO public.payments (
    id, order_id, store_id, amount, payment_type,
    payment_method_id, transaction_date, customer_id
  ) VALUES (
    p_rental_payment_id,
    p_order_id,
    p_store_id,
    p_rental_amount,
    'rental',
    p_payment_method_id,
    p_transaction_date,
    p_customer_id
  );

  -- 7. Insert deposit payment if collected
  IF p_deposit_collected AND p_deposit_amount > 0 THEN
    INSERT INTO public.payments (
      id, order_id, store_id, amount, payment_type,
      payment_method_id, transaction_date, customer_id
    ) VALUES (
      p_deposit_payment_id,
      p_order_id,
      p_store_id,
      p_deposit_amount,
      'security_deposit',
      p_deposit_method_id,
      p_transaction_date,
      p_customer_id
    );
  END IF;

END;
$$;
ALTER FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb", "p_rental_payment_id" "text", "p_rental_amount" numeric, "p_transaction_date" "date", "p_deposit_payment_id" "text", "p_deposit_amount" numeric, "p_deposit_collected" boolean) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."assert_balanced_legs"("p_legs" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_debit_total  numeric(14,2) := 0;
  v_credit_total numeric(14,2) := 0;
  leg            jsonb;
  v_debit        numeric(14,2);
  v_credit       numeric(14,2);
BEGIN
  IF p_legs IS NULL OR jsonb_array_length(p_legs) = 0 THEN
    RETURN;
  END IF;

  FOR leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    v_debit  := COALESCE((leg->>'debit')::numeric,  0);
    v_credit := COALESCE((leg->>'credit')::numeric, 0);

    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION
        'Invalid journal leg for account %: both debit and credit are zero',
        leg->>'account_id'
        USING ERRCODE = 'check_violation';
    END IF;

    v_debit_total  := v_debit_total  + v_debit;
    v_credit_total := v_credit_total + v_credit;
  END LOOP;

  IF round(v_debit_total, 2) <> round(v_credit_total, 2) THEN
    RAISE EXCEPTION 'Unbalanced journal legs: debit=% credit=%',
      v_debit_total, v_credit_total
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION "public"."assert_balanced_legs"("p_legs" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."cancel_order_raw_atomic"("p_order_id" "text", "p_cancelled_at" timestamp with time zone, "p_cancelled_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order_reference text;
  v_current_status  text;
BEGIN
  SELECT order_reference, status
  INTO v_order_reference, v_current_status
  FROM orders_raw
  WHERE id::text = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF v_current_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already cancelled');
  END IF;
  UPDATE orders_raw
  SET status           = 'cancelled',
      cancelled_at     = p_cancelled_at,
      cancelled_reason = p_cancelled_reason
  WHERE id::text = p_order_id;
  IF v_order_reference IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE session_token = v_order_reference;
  END IF;
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
ALTER FUNCTION "public"."cancel_order_raw_atomic"("p_order_id" "text", "p_cancelled_at" timestamp with time zone, "p_cancelled_reason" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."cascade_customer_contact_update"("p_customer_id" "text", "p_new_name" "text", "p_new_email" "text", "p_new_mobile" "text", "p_new_notes" "text", "p_new_blacklisted" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
ALTER FUNCTION "public"."cascade_customer_contact_update"("p_customer_id" "text", "p_new_name" "text", "p_new_email" "text", "p_new_mobile" "text", "p_new_notes" "text", "p_new_blacklisted" boolean) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."cascade_customer_contact_update"("p_customer_id" "text", "p_new_name" "text", "p_new_email" "text", "p_new_mobile" "text", "p_new_notes" "text", "p_new_blacklisted" boolean) IS 'Atomically updates a customer profile and propagates contact-field changes to orders_raw, paw_card_entries and transfers so email automations and Paw Card login continue to work with the corrected details.';
CREATE OR REPLACE FUNCTION "public"."cleanup_bookings_by_email_or_test"("p_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result        jsonb    := '{}';
  v_n             int;
  v_customer_ids  text[];
  v_order_ids     text[];
  v_order_refs    text[];
  v_vehicle_ids   text[];
  v_raw_order_ids uuid[];
BEGIN

  -- ── 0. Resolve matching customer IDs ──────────────────────────────
  SELECT array_agg(id)
  INTO   v_customer_ids
  FROM   public.customers
  WHERE  (p_email IS NOT NULL AND email ILIKE p_email)
     OR  name ILIKE '%TEST%';

  v_result := v_result || jsonb_build_object(
    'matched_customers', coalesce(array_length(v_customer_ids, 1), 0)
  );

  -- ── ACTIVATED ORDERS ──────────────────────────────────────────────
  IF v_customer_ids IS NOT NULL AND array_length(v_customer_ids, 1) > 0 THEN

    SELECT array_agg(o.id)
    INTO   v_order_ids
    FROM   public.orders o
    WHERE  o.customer_id = ANY(v_customer_ids);

    v_result := v_result || jsonb_build_object(
      'matched_orders', coalesce(array_length(v_order_ids, 1), 0)
    );

    IF v_order_ids IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN

      -- Collect vehicle IDs before order_items are cascade-deleted
      SELECT array_agg(DISTINCT oi.vehicle_id)
      INTO   v_vehicle_ids
      FROM   public.order_items oi
      WHERE  oi.order_id = ANY(v_order_ids)
        AND  oi.vehicle_id IS NOT NULL;

      -- Collect booking tokens (used as order_reference in waivers / orders_raw)
      SELECT array_agg(o.booking_token)
      INTO   v_order_refs
      FROM   public.orders o
      WHERE  o.id = ANY(v_order_ids)
        AND  o.booking_token IS NOT NULL;

      -- 1. Log tables
      DELETE FROM public.waiver_reminder_log
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('waiver_reminder_log', v_n);

      DELETE FROM public.post_rental_email_log
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('post_rental_email_log', v_n);

      -- 2. Inspections (inspection_results cascade-deletes)
      DELETE FROM public.inspections
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('inspections', v_n);

      -- 3. Vehicle swaps
      DELETE FROM public.vehicle_swaps
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('vehicle_swaps', v_n);

      -- 4. Maya checkouts
      DELETE FROM public.maya_checkouts
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('maya_checkouts', v_n);

      -- 5. Card settlements
      DELETE FROM public.card_settlements
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('card_settlements', v_n);

      -- 7. Payments
      DELETE FROM public.payments
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('payments', v_n);

      -- 8. Journal entries (only legs tied to these orders)
      DELETE FROM public.journal_entries
      WHERE  reference_type = 'order'
        AND  reference_id   = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('journal_entries', v_n);

      -- 9. Waivers (keyed by order_reference = booking_token)
      IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
        DELETE FROM public.waivers
        WHERE  order_reference = ANY(v_order_refs);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      ELSE
        v_n := 0;
      END IF;
      v_result := v_result || jsonb_build_object('waivers', v_n);

      -- 10. Raw orders matched by order_reference
      IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
        DELETE FROM public.orders_raw
        WHERE  order_reference = ANY(v_order_refs);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      ELSE
        v_n := 0;
      END IF;
      v_result := v_result || jsonb_build_object('orders_raw_by_ref', v_n);

      -- 11. Orders (cascades → order_items, order_addons)
      DELETE FROM public.orders
      WHERE  id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('orders', v_n);

      -- 12. Fleet status reset (only affected vehicles)
      IF v_vehicle_ids IS NOT NULL AND array_length(v_vehicle_ids, 1) > 0 THEN
        UPDATE public.fleet
        SET    status     = 'available',
               updated_at = now()
        WHERE  id = ANY(v_vehicle_ids)
          AND  status NOT IN ('sold', 'service_vehicle');
        GET DIAGNOSTICS v_n = ROW_COUNT;
      ELSE
        v_n := 0;
      END IF;
      v_result := v_result || jsonb_build_object('fleet_reset', v_n);

    END IF; -- end v_order_ids block

    -- 13. Delete the test customers themselves (orders are gone now)
    DELETE FROM public.customers
    WHERE  id = ANY(v_customer_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('customers_deleted', v_n);

  END IF; -- end v_customer_ids block

  -- ── ORPHANED RAW ORDERS ───────────────────────────────────────────
  -- Handle orders_raw rows that were never activated (no matching order),
  -- matched by customer_email or customer_name.

  SELECT array_agg(r.id)
  INTO   v_raw_order_ids
  FROM   public.orders_raw r
  WHERE  (p_email IS NOT NULL AND r.customer_email ILIKE p_email)
     OR  r.customer_name ILIKE '%TEST%';

  IF v_raw_order_ids IS NOT NULL AND array_length(v_raw_order_ids, 1) > 0 THEN

    -- Waivers for orphaned raw orders (via order_reference)
    DELETE FROM public.waivers w
    WHERE EXISTS (
      SELECT 1
      FROM   public.orders_raw r
      WHERE  r.id = ANY(v_raw_order_ids)
        AND  r.order_reference IS NOT NULL
        AND  r.order_reference = w.order_reference
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('waivers_raw', v_n);

    -- The orphaned raw orders themselves
    DELETE FROM public.orders_raw
    WHERE  id = ANY(v_raw_order_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('orders_raw_orphaned', v_n);

  ELSE
    v_result := v_result || jsonb_build_object('orders_raw_orphaned', 0);
  END IF;

  RETURN v_result;

END;
$$;
ALTER FUNCTION "public"."cleanup_bookings_by_email_or_test"("p_email" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."cleanup_test_customer_orders"("p_customer_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result     jsonb := '{}';
  v_n          int;
  v_order_ids  text[];
  v_vehicle_ids text[];
  v_order_refs  text[];
BEGIN

  -- ── 0. Resolve order IDs for the target customer name ────────
  SELECT array_agg(o.id)
  INTO   v_order_ids
  FROM   public.orders o
  JOIN   public.customers c ON c.id = o.customer_id
  WHERE  c.name = p_customer_name;

  -- Nothing to do — return early with a clear message.
  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'matched_orders', 0,
      'message', 'No orders found for customer: ' || p_customer_name
    );
  END IF;

  v_result := v_result || jsonb_build_object('matched_orders', array_length(v_order_ids, 1));

  -- ── 0a. Collect vehicle IDs before we delete order_items ─────
  SELECT array_agg(DISTINCT oi.vehicle_id)
  INTO   v_vehicle_ids
  FROM   public.order_items oi
  WHERE  oi.order_id = ANY(v_order_ids)
    AND  oi.vehicle_id IS NOT NULL;

  -- ── 0b. Collect booking tokens (= order_reference in waivers /
  --        orders_raw) before we delete orders ──────────────────
  SELECT array_agg(o.booking_token)
  INTO   v_order_refs
  FROM   public.orders o
  WHERE  o.id = ANY(v_order_ids)
    AND  o.booking_token IS NOT NULL;

  -- ── 1. Log tables keyed by order_id ──────────────────────────
  DELETE FROM public.waiver_reminder_log
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waiver_reminder_log', v_n);

  DELETE FROM public.post_rental_email_log
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('post_rental_email_log', v_n);

  -- ── 2. Inspections (inspection_results cascade-deletes) ──────
  DELETE FROM public.inspections
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inspections', v_n);

  -- ── 3. Vehicle swaps ──────────────────────────────────────────
  DELETE FROM public.vehicle_swaps
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('vehicle_swaps', v_n);

  -- ── 4. Maya checkouts (ON DELETE CASCADE from orders, but
  --        delete explicitly so the count is captured) ─────────
  DELETE FROM public.maya_checkouts
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('maya_checkouts', v_n);

  -- ── 5. Card settlements ───────────────────────────────────────
  DELETE FROM public.card_settlements
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('card_settlements', v_n);

  -- ── 6. Payments ───────────────────────────────────────────────
  DELETE FROM public.payments
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('payments', v_n);

  -- ── 7. Journal entries (only legs tied to these orders) ──────
  DELETE FROM public.journal_entries
  WHERE  reference_type = 'order'
    AND  reference_id   = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('journal_entries', v_n);

  -- ── 8. Waivers (keyed by order_reference = booking_token) ────
  IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
    DELETE FROM public.waivers
    WHERE  order_reference = ANY(v_order_refs);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := 0;
  END IF;
  v_result := v_result || jsonb_build_object('waivers', v_n);

  -- ── 9. Raw orders (order_reference text column) ───────────────
  IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
    DELETE FROM public.orders_raw
    WHERE  order_reference = ANY(v_order_refs);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := 0;
  END IF;
  v_result := v_result || jsonb_build_object('orders_raw', v_n);

  -- ── 10. Orders (cascades → order_items, order_addons) ────────
  DELETE FROM public.orders
  WHERE  id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_n);

  -- ── 11. Fleet status reset (only affected vehicles) ──────────
  IF v_vehicle_ids IS NOT NULL AND array_length(v_vehicle_ids, 1) > 0 THEN
    UPDATE public.fleet
    SET    status     = 'available',
           updated_at = now()
    WHERE  id = ANY(v_vehicle_ids)
      AND  status NOT IN ('sold', 'service_vehicle');
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := 0;
  END IF;
  v_result := v_result || jsonb_build_object('fleet_reset', v_n);

  RETURN v_result;

END;
$$;
ALTER FUNCTION "public"."cleanup_test_customer_orders"("p_customer_name" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."clear_cash_advance"("p_employee_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE employees
  SET current_cash_advance = 0
  WHERE id = p_employee_id;
END;
$$;
ALTER FUNCTION "public"."clear_cash_advance"("p_employee_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."collect_payment_atomic"("p_payment_id" "text", "p_order_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_account_id" "text", "p_transaction_date" "date", "p_customer_id" "text", "p_payment_type" "text", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_notes" "text" DEFAULT NULL::"text", "p_absorbed_extension_iou_ids" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
ALTER FUNCTION "public"."collect_payment_atomic"("p_payment_id" "text", "p_order_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_account_id" "text", "p_transaction_date" "date", "p_customer_id" "text", "p_payment_type" "text", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_notes" "text", "p_absorbed_extension_iou_ids" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."confirm_extend_order_atomic"("p_order_id" "text", "p_order_item_id" "text", "p_new_dropoff" timestamp with time zone, "p_new_days" integer, "p_addon_updates" "jsonb", "p_total_delta" numeric, "p_payment_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_transaction_date" "date", "p_settlement_status" "text", "p_settlement_ref" "text", "p_customer_id" "text", "p_order_item_id_fk" "text", "p_is_paid" boolean, "p_receivable_acct" "text", "p_income_acct" "text", "p_journal_tx_id" "text", "p_journal_date" "date", "p_journal_period" "text", "p_ext_description" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_addon    jsonb;
  v_cur_total numeric;
  v_cur_final numeric;
BEGIN
  -- 1. Snapshot original dropoff on first extension only, then update
  UPDATE order_items
  SET
    original_dropoff_datetime = COALESCE(original_dropoff_datetime, dropoff_datetime),
    dropoff_datetime          = p_new_dropoff,
    rental_days_count         = p_new_days
  WHERE id = p_order_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Order item not found');
  END IF;

  -- 2. Update per-day add-on totals
  FOR v_addon IN SELECT * FROM jsonb_array_elements(p_addon_updates)
  LOOP
    UPDATE order_addons
    SET total_amount = (v_addon->>'new_total')::numeric
    WHERE id = (v_addon->>'id')::text;
  END LOOP;

  -- 3. Adjust order final_total and balance_due
  IF p_total_delta <> 0 THEN
    UPDATE orders
    SET
      final_total = COALESCE(final_total, 0) + p_total_delta,
      balance_due = COALESCE(balance_due, 0) + p_total_delta
    WHERE id = p_order_id;
  END IF;

  -- 4. Insert payment
  IF p_amount > 0 THEN
    INSERT INTO payments (
      id, store_id, order_id, raw_order_id, order_item_id,
      order_addon_id, payment_type, amount, payment_method_id,
      transaction_date, settlement_status, settlement_ref,
      customer_id, account_id
    ) VALUES (
      p_payment_id, p_store_id, p_order_id, null, p_order_item_id_fk,
      null, 'extension', p_amount, p_payment_method_id,
      p_transaction_date, p_settlement_status, p_settlement_ref,
      p_customer_id,
      CASE WHEN p_is_paid THEN p_receivable_acct ELSE null END
    );

    -- 5. Journal entries (only when the payment is settled/paid)
    IF p_is_paid AND p_receivable_acct IS NOT NULL
       AND p_income_acct IS NOT NULL THEN
      INSERT INTO journal_entries (
        id, transaction_id, account_id, debit, credit,
        description, reference_type, reference_id,
        store_id, date, period
      ) VALUES
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_receivable_acct, p_amount, 0,
        p_ext_description, 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      ),
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_income_acct, 0, p_amount,
        p_ext_description || ' (income)', 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
ALTER FUNCTION "public"."confirm_extend_order_atomic"("p_order_id" "text", "p_order_item_id" "text", "p_new_dropoff" timestamp with time zone, "p_new_days" integer, "p_addon_updates" "jsonb", "p_total_delta" numeric, "p_payment_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_transaction_date" "date", "p_settlement_status" "text", "p_settlement_ref" "text", "p_customer_id" "text", "p_order_item_id_fk" "text", "p_is_paid" boolean, "p_receivable_acct" "text", "p_income_acct" "text", "p_journal_tx_id" "text", "p_journal_date" "date", "p_journal_period" "text", "p_ext_description" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."confirm_extend_raw_atomic"("p_order_id" "text", "p_new_dropoff" timestamp with time zone, "p_payment_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_transaction_date" "date", "p_settlement_status" "text", "p_settlement_ref" "text", "p_raw_order_id" "text", "p_is_paid" boolean, "p_receivable_acct" "text", "p_income_acct" "text", "p_journal_tx_id" "text", "p_journal_date" "date", "p_journal_period" "text", "p_ext_description" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 1. Snapshot original dropoff on first extension only, then update
  UPDATE orders_raw
  SET
    original_dropoff_datetime = COALESCE(original_dropoff_datetime, dropoff_datetime),
    dropoff_datetime          = p_new_dropoff
  WHERE id::text = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- 2. Insert payment record (only when there is a non-zero amount)
  IF p_amount > 0 THEN
    INSERT INTO payments (
      id, store_id, order_id, raw_order_id, order_item_id,
      order_addon_id, payment_type, amount, payment_method_id,
      transaction_date, settlement_status, settlement_ref,
      customer_id, account_id
    ) VALUES (
      p_payment_id, p_store_id, null, p_raw_order_id::uuid, null,
      null, 'extension', p_amount, p_payment_method_id,
      p_transaction_date, p_settlement_status, p_settlement_ref,
      null, CASE WHEN p_is_paid THEN p_receivable_acct ELSE null END
    );

    -- 3. Journal entries (only when the payment is settled/paid)
    IF p_is_paid AND p_receivable_acct IS NOT NULL
       AND p_income_acct IS NOT NULL THEN
      INSERT INTO journal_entries (
        id, transaction_id, account_id, debit, credit,
        description, reference_type, reference_id,
        store_id, date, period
      ) VALUES
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_receivable_acct, p_amount, 0,
        p_ext_description, 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      ),
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_income_acct, 0, p_amount,
        p_ext_description || ' (income)', 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
ALTER FUNCTION "public"."confirm_extend_raw_atomic"("p_order_id" "text", "p_new_dropoff" timestamp with time zone, "p_payment_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_transaction_date" "date", "p_settlement_status" "text", "p_settlement_ref" "text", "p_raw_order_id" "text", "p_is_paid" boolean, "p_receivable_acct" "text", "p_income_acct" "text", "p_journal_tx_id" "text", "p_journal_date" "date", "p_journal_period" "text", "p_ext_description" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_expense_with_journal"("p_expense_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_account_id" "text", "p_status" "text" DEFAULT 'paid'::"text", "p_transaction_id" "text" DEFAULT NULL::"text", "p_period" "text" DEFAULT NULL::"text", "p_journal_date" "date" DEFAULT NULL::"date", "p_journal_store_id" "text" DEFAULT NULL::"text", "p_created_by" "text" DEFAULT NULL::"text", "p_legs" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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
  IF p_status = 'paid' AND jsonb_array_length(p_legs) > 0 THEN
    INSERT INTO journal_entries (
      id, transaction_id, period, date, store_id,
      account_id, debit, credit, description,
      reference_type, reference_id, created_by
    )
    SELECT
      leg->>'id', p_transaction_id, p_period, p_journal_date, p_journal_store_id,
      leg->>'account_id', (leg->>'debit')::numeric(12,2), (leg->>'credit')::numeric(12,2),
      leg->>'description', leg->>'reference_type', leg->>'reference_id', p_created_by
    FROM jsonb_array_elements(p_legs) AS leg;
  END IF;
END;
$$;
ALTER FUNCTION "public"."create_expense_with_journal"("p_expense_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_account_id" "text", "p_status" "text", "p_transaction_id" "text", "p_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_created_by" "text", "p_legs" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_maintenance_expense"("p_expense_id" "text", "p_maintenance_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_period text;
BEGIN
  v_period := to_char(p_date, 'YYYY-MM');
  INSERT INTO expenses (
    id, maintenance_id, store_id, date, category,
    description, amount, paid_from, vehicle_id,
    employee_id, account_id
  ) VALUES (
    p_expense_id, p_maintenance_id, p_store_id, p_date, p_category,
    p_description, p_amount, p_cash_account_id, p_vehicle_id,
    p_employee_id, p_expense_account_id
  );
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_debit_id, p_transaction_id, v_period, p_date, p_store_id,
    p_expense_account_id, p_amount, 0, p_description, 'expense', p_expense_id
  );
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_credit_id, p_transaction_id, v_period, p_date, p_store_id,
    p_cash_account_id, 0, p_amount, p_description, 'expense', p_expense_id
  );
END;
$$;
ALTER FUNCTION "public"."create_maintenance_expense"("p_expense_id" "text", "p_maintenance_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."delete_expense_with_journal"("p_expense_id" "text", "p_reference_type" "text", "p_reference_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM journal_entries
  WHERE reference_type = p_reference_type
    AND reference_id = p_reference_id;
  DELETE FROM expenses
  WHERE id = p_expense_id;
END;
$$;
ALTER FUNCTION "public"."delete_expense_with_journal"("p_expense_id" "text", "p_reference_type" "text", "p_reference_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."delete_maintenance_expense"("p_maintenance_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_expense_id text;
BEGIN
  SELECT id INTO v_expense_id
  FROM expenses
  WHERE maintenance_id = p_maintenance_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  DELETE FROM journal_entries
  WHERE reference_type = 'expense'
    AND reference_id = v_expense_id;
  DELETE FROM expenses WHERE id = v_expense_id;
END;
$$;
ALTER FUNCTION "public"."delete_maintenance_expense"("p_maintenance_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_transfer_summary"("p_store_id" "text", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_outstanding jsonb;
  v_collected jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total', COALESCE(SUM(total_price), 0)
  ) INTO v_outstanding
  FROM public.transfers
  WHERE store_id = p_store_id
    AND collected_at IS NULL
    AND (p_date_from IS NULL OR service_date >= p_date_from)
    AND (p_date_to IS NULL OR service_date <= p_date_to);

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total', COALESCE(SUM(collected_amount), 0),
    'driverCut', COALESCE(SUM(
      CASE
        WHEN tr.pricing_type = 'per_head' THEN tr.driver_cut * t.pax_count
        ELSE tr.driver_cut
      END
    ), 0),
    'netLolas', COALESCE(SUM(collected_amount), 0) - COALESCE(SUM(
      CASE
        WHEN tr.pricing_type = 'per_head' THEN tr.driver_cut * t.pax_count
        ELSE tr.driver_cut
      END
    ), 0)
  ) INTO v_collected
  FROM public.transfers t
  LEFT JOIN public.transfer_routes tr
    ON tr.route = t.route AND tr.van_type = t.van_type AND tr.store_id = p_store_id
  WHERE t.store_id = p_store_id
    AND t.collected_at IS NOT NULL
    AND (p_date_from IS NULL OR t.service_date >= p_date_from)
    AND (p_date_to IS NULL OR t.service_date <= p_date_to);

  RETURN jsonb_build_object(
    'outstanding', v_outstanding,
    'collected', v_collected
  );
END;
$$;
ALTER FUNCTION "public"."get_transfer_summary"("p_store_id" "text", "p_date_from" "date", "p_date_to" "date") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."has_permission"("required" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'permissions') ? required,
    false
  );
$$;
ALTER FUNCTION "public"."has_permission"("required" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."increment_booking_interaction"("p_session_token" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE public.booking_sessions
  SET    interaction_count = interaction_count + 1
  WHERE  session_token = p_session_token;
$$;
ALTER FUNCTION "public"."increment_booking_interaction"("p_session_token" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."increment_cash_advance"("p_employee_id" "text", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE employees
  SET current_cash_advance = current_cash_advance + p_amount
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found', p_employee_id;
  END IF;
END;
$$;
ALTER FUNCTION "public"."increment_cash_advance"("p_employee_id" "text", "p_amount" numeric) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."match_card_settlement"("p_transaction_id" "text", "p_period" "text", "p_date" "date", "p_store_id" "text", "p_legs" "jsonb", "p_settlement_ids" "text"[], "p_is_paid" boolean, "p_date_settled" "date", "p_settlement_ref" "text", "p_net_amount" numeric, "p_fee_expense" numeric, "p_account_id" "text", "p_payment_ids" "text"[], "p_settlement_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
ALTER FUNCTION "public"."match_card_settlement"("p_transaction_id" "text", "p_period" "text", "p_date" "date", "p_store_id" "text", "p_legs" "jsonb", "p_settlement_ids" "text"[], "p_is_paid" boolean, "p_date_settled" "date", "p_settlement_ref" "text", "p_net_amount" numeric, "p_fee_expense" numeric, "p_account_id" "text", "p_payment_ids" "text"[], "p_settlement_status" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."normalize_phone"("p" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  d text; -- input stripped of whitespace, dashes, and parentheses
BEGIN
  d := regexp_replace(p, '[\s\-().]', '', 'g');

  -- Already E.164 (starts with +) — strip formatting only
  IF d LIKE '+%' THEN
    RETURN d;
  END IF;

  -- 09XXXXXXXXX → +639XXXXXXXXX
  IF d ~ '^09[0-9]{9}$' THEN
    RETURN '+63' || substring(d FROM 2);
  END IF;

  -- 639XXXXXXXXX → +639XXXXXXXXX
  IF d ~ '^639[0-9]{9}$' THEN
    RETURN '+' || d;
  END IF;

  -- 9XXXXXXXXX → +639XXXXXXXXX
  IF d ~ '^9[0-9]{9}$' THEN
    RETURN '+63' || d;
  END IF;

  -- Unrecognised format — return original value unchanged
  RETURN p;
END;
$_$;
ALTER FUNCTION "public"."normalize_phone"("p" "text") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."normalize_phone"("p" "text") IS 'Normalises a Philippine mobile number to E.164 (+639XXXXXXXXX). Handles 09XX, 639XX, 9XX, and already-E.164 inputs. Strips whitespace and dashes. Returns the original value for non-Philippine numbers or unrecognised formats. NULL-safe.';
CREATE OR REPLACE FUNCTION "public"."paw_card_assign_paw_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  suffix text;
BEGIN
  IF NEW.paw_reference IS NULL OR length(trim(NEW.paw_reference)) = 0 THEN
    suffix := lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    NEW.paw_reference := 'PAW-' || to_char(timezone('Asia/Manila', now())::date, 'YYYYMMDD') || '-' || suffix;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."paw_card_assign_paw_reference"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."pay_expenses_atomic"("p_expense_ids" "text"[], "p_paid_at" timestamp with time zone, "p_paid_from" "text", "p_legs" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  leg jsonb;
BEGIN
  UPDATE expenses
  SET status    = 'paid',
      paid_at   = p_paid_at,
      paid_from = p_paid_from,
      date      = (p_paid_at AT TIME ZONE 'Asia/Manila')::date
  WHERE id = ANY(p_expense_ids);
  FOR leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    INSERT INTO journal_entries (
      id, transaction_id, period, date, store_id,
      account_id, debit, credit, description,
      reference_type, reference_id, created_by
    ) VALUES (
      leg->>'id', leg->>'transaction_id', leg->>'period', (leg->>'date')::date,
      leg->>'store_id', leg->>'account_id', (leg->>'debit')::numeric(12,2),
      (leg->>'credit')::numeric(12,2), leg->>'description',
      leg->>'reference_type', leg->>'reference_id', NULL
    );
  END LOOP;
END;
$$;
ALTER FUNCTION "public"."pay_expenses_atomic"("p_expense_ids" "text"[], "p_paid_at" timestamp with time zone, "p_paid_from" "text", "p_legs" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."post_batch_depreciation"("p_vehicle_records" "jsonb", "p_journal_entry_date" "date", "p_store_id" "text", "p_period" "text", "p_depreciation_expense_account_id" "text", "p_acc_depreciation_account_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_record           jsonb;
  v_vehicle_id       text;
  v_new_accum        numeric(12,2);
  v_new_book         numeric(12,2);
  v_amount           numeric(12,2);
  v_total            numeric(14,2) := 0;
  v_count            integer       := 0;
  v_updated          integer;
  v_transaction_id   text          := gen_random_uuid()::text;
  v_debit_entry_id   text          := gen_random_uuid()::text;
  v_credit_entry_id  text          := gen_random_uuid()::text;
  v_description      text;
BEGIN
  -- 0. Input validation -----------------------------------------------------
  IF p_vehicle_records IS NULL OR jsonb_array_length(p_vehicle_records) = 0 THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_vehicle_records is empty'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_period must match YYYY-MM, got %', p_period
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_depreciation_expense_account_id IS NULL
     OR p_acc_depreciation_account_id IS NULL THEN
    RAISE EXCEPTION 'post_batch_depreciation: depreciation account ids must not be null'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Per-vehicle UPDATE fleet --------------------------------------------
  FOR v_record IN SELECT * FROM jsonb_array_elements(p_vehicle_records) LOOP
    v_vehicle_id := v_record->>'vehicle_id';
    v_new_accum  := COALESCE((v_record->>'new_accumulated_depreciation')::numeric(12,2), 0);
    v_new_book   := COALESCE((v_record->>'new_book_value')::numeric(12,2), 0);
    v_amount     := COALESCE((v_record->>'depreciation_amount')::numeric(12,2), 0);

    IF v_vehicle_id IS NULL THEN
      RAISE EXCEPTION 'post_batch_depreciation: vehicle_id missing in record %', v_record
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'post_batch_depreciation: depreciation_amount must be > 0 for vehicle %, got %',
        v_vehicle_id, v_amount
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.fleet
       SET accumulated_depreciation = v_new_accum,
           book_value               = v_new_book,
           updated_at               = now()
     WHERE id = v_vehicle_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'post_batch_depreciation: vehicle % not found in fleet', v_vehicle_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_total := v_total + v_amount;
    v_count := v_count + 1;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'post_batch_depreciation: total depreciation must be > 0, got %', v_total
      USING ERRCODE = 'check_violation';
  END IF;

  v_description := format('Monthly depreciation %s (%s vehicles)', p_period, v_count);

  -- 2. INSERT journal_entries — debit + credit -----------------------------
  --    Two rows because of the debit_xor_credit CHECK constraint on
  --    journal_entries (each row must be a pure debit or pure credit).
  INSERT INTO public.journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description,
    reference_type, reference_id, created_by
  ) VALUES (
    v_debit_entry_id,
    v_transaction_id,
    p_period,
    p_journal_entry_date,
    p_store_id,
    p_depreciation_expense_account_id,
    v_total,
    0,
    v_description,
    'depreciation',
    p_period,
    NULL
  );

  INSERT INTO public.journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description,
    reference_type, reference_id, created_by
  ) VALUES (
    v_credit_entry_id,
    v_transaction_id,
    p_period,
    p_journal_entry_date,
    p_store_id,
    p_acc_depreciation_account_id,
    0,
    v_total,
    v_description,
    'depreciation',
    p_period,
    NULL
  );

  -- 3. Return summary -------------------------------------------------------
  RETURN jsonb_build_object(
    'transaction_id',     v_transaction_id,
    'debit_entry_id',     v_debit_entry_id,
    'credit_entry_id',    v_credit_entry_id,
    'vehicle_count',      v_count,
    'total_depreciation', v_total
  );

EXCEPTION
  WHEN OTHERS THEN
    -- All UPDATEs and INSERTs above are rolled back automatically by
    -- PL/pgSQL when an exception leaves the function. We re-raise with
    -- context so the API layer can surface a meaningful error.
    RAISE EXCEPTION
      'post_batch_depreciation failed (period=%, store=%, vehicles=%): %',
      p_period, p_store_id, v_count, SQLERRM
      USING ERRCODE = SQLSTATE;
END;
$_$;
ALTER FUNCTION "public"."post_batch_depreciation"("p_vehicle_records" "jsonb", "p_journal_entry_date" "date", "p_store_id" "text", "p_period" "text", "p_depreciation_expense_account_id" "text", "p_acc_depreciation_account_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."process_raw_order_atomic"("p_raw_order_id" "text", "p_order_id" "text", "p_store_id" "text", "p_customer_row" "jsonb", "p_order_row" "jsonb", "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_rental_payment" "jsonb", "p_deposit_payment" "jsonb", "p_card_settlement" "jsonb", "p_transfer_row" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_settled_at" timestamp with time zone) RETURNS TABLE("order_id" "text", "was_new" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_exists   boolean;
  item       jsonb;
  addon      jsonb;
  vehicle    jsonb;
  leg        jsonb;
  v_rowcount integer;
BEGIN
  -- 1. Idempotency guard: if the order already exists (i.e. a prior
  -- attempt succeeded), return the existing id with was_new=false so
  -- the caller can short-circuit safely.
  SELECT EXISTS(SELECT 1 FROM public.orders o WHERE o.id = p_order_id)
    INTO v_exists;

  IF v_exists THEN
    RETURN QUERY SELECT p_order_id, false;
    RETURN;
  END IF;

  -- 2. Validate journal balances before doing any writes.
  PERFORM public.assert_balanced_legs(p_journal_legs);

  -- 3. Upsert customer.
  INSERT INTO public.customers (
    id, store_id, name, email, mobile, total_spent, notes, blacklisted
  ) VALUES (
    p_customer_row->>'id',
    p_customer_row->>'store_id',
    p_customer_row->>'name',
    p_customer_row->>'email',
    p_customer_row->>'mobile',
    COALESCE((p_customer_row->>'total_spent')::numeric(12,2), 0),
    p_customer_row->>'notes',
    COALESCE((p_customer_row->>'blacklisted')::boolean, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    name       = EXCLUDED.name,
    mobile     = EXCLUDED.mobile,
    email      = EXCLUDED.email,
    updated_at = now();

  -- 4. Insert order.
  INSERT INTO public.orders (
    id, store_id, woo_order_id, customer_id, employee_id,
    order_date, status, web_notes, quantity, web_quote_raw,
    security_deposit, deposit_status, card_fee_surcharge,
    return_charges, final_total, balance_due, payment_method_id,
    deposit_method_id, booking_token, tips, charity_donation, updated_at
  ) VALUES (
    p_order_row->>'id',
    p_order_row->>'store_id',
    p_order_row->>'woo_order_id',
    p_order_row->>'customer_id',
    p_order_row->>'employee_id',
    (p_order_row->>'order_date')::date,
    p_order_row->>'status',
    p_order_row->>'web_notes',
    COALESCE((p_order_row->>'quantity')::integer, 1),
    NULLIF(p_order_row->>'web_quote_raw', '')::numeric(12,2),
    COALESCE((p_order_row->>'security_deposit')::numeric(12,2), 0),
    p_order_row->>'deposit_status',
    COALESCE((p_order_row->>'card_fee_surcharge')::numeric(12,2), 0),
    COALESCE((p_order_row->>'return_charges')::numeric(12,2), 0),
    COALESCE((p_order_row->>'final_total')::numeric(12,2), 0),
    COALESCE((p_order_row->>'balance_due')::numeric(12,2), 0),
    p_order_row->>'payment_method_id',
    p_order_row->>'deposit_method_id',
    p_order_row->>'booking_token',
    COALESCE((p_order_row->>'tips')::numeric(12,2), 0),
    COALESCE((p_order_row->>'charity_donation')::numeric(12,2), 0),
    COALESCE((p_order_row->>'updated_at')::timestamptz, now())
  );

  -- 5. Order items (snake_case keys, matching order-repo.ts serialisation).
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_order_items, '[]'::jsonb))
  LOOP
    INSERT INTO public.order_items (
      id, store_id, order_id, vehicle_id, vehicle_name,
      pickup_datetime, dropoff_datetime, rental_days_count,
      pickup_location, dropoff_location, pickup_fee, dropoff_fee,
      rental_rate, helmet_numbers, discount, ops_notes, return_condition
    ) VALUES (
      item->>'id',
      item->>'store_id',
      p_order_id,
      item->>'vehicle_id',
      item->>'vehicle_name',
      (item->>'pickup_datetime')::timestamptz,
      (item->>'dropoff_datetime')::timestamptz,
      COALESCE((item->>'rental_days_count')::integer, 0),
      item->>'pickup_location',
      item->>'dropoff_location',
      COALESCE((item->>'pickup_fee')::numeric(12,2), 0),
      COALESCE((item->>'dropoff_fee')::numeric(12,2), 0),
      COALESCE((item->>'rental_rate')::numeric(12,2), 0),
      item->>'helmet_numbers',
      COALESCE((item->>'discount')::numeric(12,2), 0),
      item->>'ops_notes',
      item->>'return_condition'
    );
  END LOOP;

  -- 6. Order addons.
  FOR addon IN SELECT * FROM jsonb_array_elements(COALESCE(p_order_addons, '[]'::jsonb))
  LOOP
    INSERT INTO public.order_addons (
      id, store_id, order_id, addon_name, addon_price,
      addon_type, quantity, total_amount
    ) VALUES (
      addon->>'id',
      COALESCE(addon->>'store_id', p_store_id),
      p_order_id,
      addon->>'addon_name',
      (addon->>'addon_price')::numeric(12,2),
      addon->>'addon_type',
      COALESCE((addon->>'quantity')::integer, 1),
      (addon->>'total_amount')::numeric(12,2)
    );
  END LOOP;

  -- 7. Fleet updates. Keyed by 'vehicle_id' per caller contract.
  FOR vehicle IN SELECT * FROM jsonb_array_elements(COALESCE(p_fleet_updates, '[]'::jsonb))
  LOOP
    UPDATE public.fleet
    SET
      status     = vehicle->>'status',
      updated_at = now()
    WHERE id = vehicle->>'vehicle_id';
  END LOOP;

  -- 8. Rental payment (optional).
  IF p_rental_payment IS NOT NULL AND p_rental_payment <> 'null'::jsonb THEN
    INSERT INTO public.payments (
      id, store_id, order_id, raw_order_id, order_item_id, order_addon_id,
      payment_type, amount, payment_method_id, transaction_date,
      settlement_status, settlement_ref, customer_id, account_id
    ) VALUES (
      p_rental_payment->>'id',
      p_rental_payment->>'store_id',
      p_order_id,
      NULLIF(p_rental_payment->>'raw_order_id', '')::uuid,
      p_rental_payment->>'order_item_id',
      p_rental_payment->>'order_addon_id',
      COALESCE(p_rental_payment->>'payment_type', 'rental'),
      (p_rental_payment->>'amount')::numeric(12,2),
      p_rental_payment->>'payment_method_id',
      (p_rental_payment->>'transaction_date')::date,
      p_rental_payment->>'settlement_status',
      p_rental_payment->>'settlement_ref',
      p_rental_payment->>'customer_id',
      p_rental_payment->>'account_id'
    );
  END IF;

  -- 9. Deposit payment (optional).
  IF p_deposit_payment IS NOT NULL AND p_deposit_payment <> 'null'::jsonb THEN
    INSERT INTO public.payments (
      id, store_id, order_id, raw_order_id, order_item_id, order_addon_id,
      payment_type, amount, payment_method_id, transaction_date,
      settlement_status, settlement_ref, customer_id, account_id
    ) VALUES (
      p_deposit_payment->>'id',
      p_deposit_payment->>'store_id',
      p_order_id,
      NULLIF(p_deposit_payment->>'raw_order_id', '')::uuid,
      p_deposit_payment->>'order_item_id',
      p_deposit_payment->>'order_addon_id',
      COALESCE(p_deposit_payment->>'payment_type', 'deposit'),
      (p_deposit_payment->>'amount')::numeric(12,2),
      p_deposit_payment->>'payment_method_id',
      (p_deposit_payment->>'transaction_date')::date,
      p_deposit_payment->>'settlement_status',
      p_deposit_payment->>'settlement_ref',
      p_deposit_payment->>'customer_id',
      p_deposit_payment->>'account_id'
    );
  END IF;

  -- 10. Card settlement (optional; id is serial, never supplied).
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

  -- 11. Transfer (optional). INSERT … ON CONFLICT updates only the
  -- linkage fields so a pre-created online-booking transfer keeps its
  -- original customer / route data.
  IF p_transfer_row IS NOT NULL AND p_transfer_row <> 'null'::jsonb THEN
    INSERT INTO public.transfers (
      id, order_id, service_date, customer_name, contact_number,
      customer_email, customer_type, route, flight_time, pax_count,
      van_type, accommodation, status, ops_notes, total_price,
      payment_method, payment_status, driver_fee, net_profit,
      driver_paid_status, booking_source, booking_token, store_id,
      created_at, updated_at
    ) VALUES (
      p_transfer_row->>'id',
      p_order_id,
      (p_transfer_row->>'service_date')::date,
      p_transfer_row->>'customer_name',
      p_transfer_row->>'contact_number',
      p_transfer_row->>'customer_email',
      p_transfer_row->>'customer_type',
      p_transfer_row->>'route',
      p_transfer_row->>'flight_time',
      COALESCE((p_transfer_row->>'pax_count')::integer, 1),
      p_transfer_row->>'van_type',
      p_transfer_row->>'accommodation',
      COALESCE(p_transfer_row->>'status', 'Pending'),
      p_transfer_row->>'ops_notes',
      COALESCE((p_transfer_row->>'total_price')::numeric(12,2), 0),
      p_transfer_row->>'payment_method',
      COALESCE(p_transfer_row->>'payment_status', 'Pending'),
      NULLIF(p_transfer_row->>'driver_fee', '')::numeric(12,2),
      NULLIF(p_transfer_row->>'net_profit', '')::numeric(12,2),
      p_transfer_row->>'driver_paid_status',
      p_transfer_row->>'booking_source',
      p_transfer_row->>'booking_token',
      COALESCE(p_transfer_row->>'store_id', p_store_id),
      COALESCE((p_transfer_row->>'created_at')::timestamptz, now()),
      COALESCE((p_transfer_row->>'updated_at')::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      order_id   = EXCLUDED.order_id,
      updated_at = EXCLUDED.updated_at;
  END IF;

  -- 12. Journal entries. All legs share a single transaction_id; the
  -- reference_type / reference_id pair on each leg preserves the
  -- original posting grouping (order / payment / order_charity).
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

  -- 13. Link any pre-activation payments (e.g. deposit collected
  -- before activation via /collect-payment) to the new order.
  UPDATE public.payments pay
  SET order_id = p_order_id
  WHERE pay.raw_order_id = p_raw_order_id::uuid
    AND pay.order_id IS NULL;

  -- 14. Mark raw order processed with concurrency guard. If another
  -- call already flipped the status, raise so the transaction aborts
  -- (the idempotency guard in step 1 will handle true retries).
  UPDATE public.orders_raw
  SET status = 'processed'
  WHERE id = p_raw_order_id::uuid
    AND status = 'unprocessed';

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'Raw order % already processed', p_raw_order_id;
  END IF;

  -- Suppress unused-parameter warning; p_settled_at is accepted for
  -- forward compatibility with settlement-stamping callers.
  PERFORM p_settled_at;

  -- 15. Success.
  RETURN QUERY SELECT p_order_id, true;
END;
$$;
ALTER FUNCTION "public"."process_raw_order_atomic"("p_raw_order_id" "text", "p_order_id" "text", "p_store_id" "text", "p_customer_row" "jsonb", "p_order_row" "jsonb", "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_rental_payment" "jsonb", "p_deposit_payment" "jsonb", "p_card_settlement" "jsonb", "p_transfer_row" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_settled_at" timestamp with time zone) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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
ALTER FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric, "p_deposits_closing_balance" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO cash_reconciliation (
    id, store_id, date, opening_balance, expected_cash,
    actual_counted, variance, variance_type, submitted_by,
    submitted_at, is_locked, overridden_by, overridden_at,
    override_reason, till_counted, deposits_counted,
    till_denoms, deposit_denoms, till_expected, deposits_expected,
    till_variance, deposit_variance, closing_balance,
    deposits_closing_balance
  ) VALUES (
    p_id, p_store_id, p_date, p_opening_balance, p_expected_cash,
    p_actual_counted, p_variance, p_variance_type, p_submitted_by,
    p_submitted_at, p_is_locked, p_overridden_by, p_overridden_at,
    p_override_reason, p_till_counted, p_deposits_counted,
    p_till_denoms, p_deposit_denoms, p_till_expected, p_deposits_expected,
    p_till_variance, p_deposit_variance, p_closing_balance,
    p_deposits_closing_balance
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
    deposits_closing_balance  = EXCLUDED.deposits_closing_balance;

  UPDATE cash_reconciliation
  SET is_locked = true
  WHERE id = p_id;

END;
$$;
ALTER FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric, "p_deposits_closing_balance" numeric) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."reset_test_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb := '{}';
  v_n      int;
BEGIN

  -- ── 1. Log tables referencing orders (no cascade) ────────
  DELETE FROM public.waiver_reminder_log   WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waiver_reminder_log', v_n);

  DELETE FROM public.post_rental_email_log WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('post_rental_email_log', v_n);

  -- ── 2. Inspections (inspection_results cascades) ─────────
  DELETE FROM public.inspections           WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inspections', v_n);

  -- ── 3. Vehicle swaps ──────────────────────────────────────
  DELETE FROM public.vehicle_swaps         WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('vehicle_swaps', v_n);

  -- ── 4. Maya checkouts ────────────────────────────────────
  DELETE FROM public.maya_checkouts        WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('maya_checkouts', v_n);

  -- ── 5. Card settlements ───────────────────────────────────
  DELETE FROM public.card_settlements      WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('card_settlements', v_n);

  -- ── 7. Payments (includes extensions stored as payment rows)
  DELETE FROM public.payments              WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('payments', v_n);

  -- ── 8. Journal entries (no FK to orders; wipe all) ───────
  DELETE FROM public.journal_entries       WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('journal_entries', v_n);

  -- ── 9. Transfers (order_id is plain text, no FK constraint)
  DELETE FROM public.transfers             WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('transfers', v_n);

  -- ── 10. Orders (cascades → order_items, order_addons) ────
  DELETE FROM public.orders                WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_n);

  -- ── 11. Raw orders (inbox) ────────────────────────────────
  DELETE FROM public.orders_raw            WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders_raw', v_n);

  -- ── 12. Waivers (text reference to order_reference) ──────
  DELETE FROM public.waivers               WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waivers', v_n);

  -- ── 13. Booking holds ─────────────────────────────────────
  DELETE FROM public.booking_holds         WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('booking_holds', v_n);

  -- ── 14. Cash reconciliation (cashup records) ──────────────
  DELETE FROM public.cash_reconciliation   WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_reconciliation', v_n);

  -- ── 15. Lost opportunity ──────────────────────────────────
  DELETE FROM public.lost_opportunity      WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('lost_opportunity', v_n);

  -- ── 16. Fleet status reset ────────────────────────────────
  UPDATE public.fleet
  SET    status     = 'available',
         updated_at = now()
  WHERE  status NOT IN ('sold', 'service_vehicle');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('fleet_reset', v_n);

  RETURN v_result;

END;
$$;
ALTER FUNCTION "public"."reset_test_data"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."run_payroll_atomic"("p_transactions" "jsonb", "p_timesheet_ids" "text"[], "p_status" "text", "p_store_id" "text", "p_period_start" "date", "p_period_end" "date", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  tx jsonb;
  leg jsonb;
BEGIN
  -- Idempotency guard: one payroll run per (store_id, period_start, period_end).
  INSERT INTO public.payroll_runs (store_id, period_start, period_end, run_by)
  VALUES (p_store_id, p_period_start, p_period_end, p_notes)
  ON CONFLICT (store_id, period_start, period_end) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll already run for store % period % to %',
      p_store_id, p_period_start, p_period_end
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Insert all journal entries for all store allocations
  FOR tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    FOR leg IN SELECT * FROM jsonb_array_elements(tx->'legs')
    LOOP
      INSERT INTO journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id, created_by
      ) VALUES (
        leg->>'id',
        tx->>'transactionId',
        tx->>'period',
        (tx->>'date')::date,
        tx->>'storeId',
        leg->>'account_id',
        (leg->>'debit')::numeric(12,2),
        (leg->>'credit')::numeric(12,2),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id',
        NULL
      );
    END LOOP;
  END LOOP;

  -- Bulk update timesheet status
  IF array_length(p_timesheet_ids, 1) > 0 THEN
    UPDATE timesheets
    SET payroll_status = p_status
    WHERE id = ANY(p_timesheet_ids);
  END IF;

END;
$$;
ALTER FUNCTION "public"."run_payroll_atomic"("p_transactions" "jsonb", "p_timesheet_ids" "text"[], "p_status" "text", "p_store_id" "text", "p_period_start" "date", "p_period_end" "date", "p_notes" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
ALTER FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Resolve pending extension IOUs — flip their settlement_status
  -- so they no longer appear in cashup 'Unpaid Extensions' and so
  -- the Payments tab/history stop showing them as outstanding.
  -- The final_payment row above is the authoritative cash record.
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

  UPDATE public.orders
  SET status      = 'completed',
      balance_due = p_final_balance_due,
      settled_at  = p_settled_at,
      updated_at  = p_settled_at
  WHERE id = p_order_id;
END;
$$;
ALTER FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb" DEFAULT '[]'::"jsonb", "p_card_fee_surcharge_delta" numeric DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Stamp the order. When a card surcharge is applied at settlement,
  -- bump final_total + card_fee_surcharge by the same delta so the
  -- inclusive payment row keeps the books balanced.
  UPDATE public.orders
  SET status             = 'completed',
      balance_due        = p_final_balance_due,
      final_total        = COALESCE(final_total, 0)
                           + COALESCE(p_card_fee_surcharge_delta, 0),
      card_fee_surcharge = COALESCE(card_fee_surcharge, 0)
                           + COALESCE(p_card_fee_surcharge_delta, 0),
      settled_at         = p_settled_at,
      updated_at         = p_settled_at
  WHERE id = p_order_id;
END;
$$;
ALTER FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb" DEFAULT '[]'::"jsonb", "p_card_fee_surcharge_delta" numeric DEFAULT 0, "p_return_charges_delta" numeric DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  -- Both default to 0 so older callers without these params are unaffected.
  UPDATE public.orders
  SET status             = 'completed',
      balance_due        = p_final_balance_due,
      final_total        = COALESCE(final_total, 0)
                           + COALESCE(p_card_fee_surcharge_delta, 0)
                           + COALESCE(p_return_charges_delta, 0),
      card_fee_surcharge = COALESCE(card_fee_surcharge, 0)
                           + COALESCE(p_card_fee_surcharge_delta, 0),
      return_charges     = COALESCE(return_charges, 0)
                           + COALESCE(p_return_charges_delta, 0),
      settled_at         = p_settled_at,
      updated_at         = p_settled_at
  WHERE id = p_order_id;
END;
$$;
ALTER FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric, "p_return_charges_delta" numeric) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb" DEFAULT '[]'::"jsonb", "p_card_fee_surcharge_delta" numeric DEFAULT 0, "p_return_charges_delta" numeric DEFAULT 0, "p_deposit_refund_payment" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Deposit refund payment row — records which method was used to
  -- return the security deposit (e.g. GCash instead of cash).
  IF p_deposit_refund_payment IS NOT NULL AND p_deposit_refund_payment <> 'null'::jsonb THEN
    INSERT INTO public.payments (
      id, order_id, store_id, amount, payment_type,
      payment_method_id, transaction_date,
      customer_id, account_id
    ) VALUES (
      p_deposit_refund_payment->>'id',
      p_order_id,
      p_store_id,
      (p_deposit_refund_payment->>'amount')::numeric(12,2),
      COALESCE(p_deposit_refund_payment->>'payment_type', 'deposit_refund'),
      p_deposit_refund_payment->>'payment_method_id',
      (p_deposit_refund_payment->>'transaction_date')::date,
      p_deposit_refund_payment->>'customer_id',
      p_deposit_refund_payment->>'account_id'
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

  UPDATE public.orders
  SET status             = 'completed',
      balance_due        = p_final_balance_due,
      final_total        = COALESCE(final_total, 0)
                           + COALESCE(p_card_fee_surcharge_delta, 0)
                           + COALESCE(p_return_charges_delta, 0),
      card_fee_surcharge = COALESCE(card_fee_surcharge, 0)
                           + COALESCE(p_card_fee_surcharge_delta, 0),
      return_charges     = COALESCE(return_charges, 0)
                           + COALESCE(p_return_charges_delta, 0),
      settled_at         = p_settled_at,
      updated_at         = p_settled_at
  WHERE id = p_order_id;
END;
$$;
ALTER FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric, "p_return_charges_delta" numeric, "p_deposit_refund_payment" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb" DEFAULT '[]'::"jsonb", "p_card_fee_surcharge_delta" numeric DEFAULT 0, "p_return_charges_delta" numeric DEFAULT 0, "p_return_charges_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
ALTER FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric, "p_return_charges_delta" numeric, "p_return_charges_note" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb" DEFAULT '[]'::"jsonb", "p_card_fee_surcharge_delta" numeric DEFAULT 0, "p_return_charges_delta" numeric DEFAULT 0, "p_return_charges_note" "text" DEFAULT NULL::"text", "p_deposit_refund_payment" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Deposit refund payment row — records which method was used to
  -- return the security deposit (e.g. GCash instead of cash).
  IF p_deposit_refund_payment IS NOT NULL AND p_deposit_refund_payment <> 'null'::jsonb THEN
    INSERT INTO public.payments (
      id, order_id, store_id, amount, payment_type,
      payment_method_id, transaction_date,
      customer_id, account_id
    ) VALUES (
      p_deposit_refund_payment->>'id',
      p_order_id,
      p_store_id,
      (p_deposit_refund_payment->>'amount')::numeric(12,2),
      COALESCE(p_deposit_refund_payment->>'payment_type', 'deposit_refund'),
      p_deposit_refund_payment->>'payment_method_id',
      (p_deposit_refund_payment->>'transaction_date')::date,
      p_deposit_refund_payment->>'customer_id',
      p_deposit_refund_payment->>'account_id'
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
ALTER FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric, "p_return_charges_delta" numeric, "p_return_charges_note" "text", "p_deposit_refund_payment" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."top_paw_card_establishments"("p_limit" integer DEFAULT 10) RETURNS TABLE("name" "text", "count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    trim(establishment)  AS name,
    count(*)             AS count
  FROM public.paw_card_entries
  WHERE establishment IS NOT NULL
    AND trim(establishment) <> ''
  GROUP BY trim(establishment)
  ORDER BY count(*) DESC, trim(establishment) ASC
  LIMIT p_limit;
$$;
ALTER FUNCTION "public"."top_paw_card_establishments"("p_limit" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_maintenance_expense"("p_expense_id" "text", "p_amount" numeric, "p_description" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_store_id text;
  v_date     date;
  v_period   text;
BEGIN
  SELECT store_id, date INTO v_store_id, v_date
  FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense % not found', p_expense_id;
  END IF;
  v_period := to_char(v_date, 'YYYY-MM');
  UPDATE expenses
  SET amount      = p_amount,
      description = p_description,
      account_id  = p_expense_account_id,
      paid_from   = p_cash_account_id
  WHERE id = p_expense_id;
  DELETE FROM journal_entries
  WHERE reference_type = 'expense'
    AND reference_id = p_expense_id;
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_debit_id, p_transaction_id, v_period, v_date, v_store_id,
    p_expense_account_id, p_amount, 0, p_description, 'expense', p_expense_id
  );
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_credit_id, p_transaction_id, v_period, v_date, v_store_id,
    p_cash_account_id, 0, p_amount, p_description, 'expense', p_expense_id
  );
END;
$$;
ALTER FUNCTION "public"."update_maintenance_expense"("p_expense_id" "text", "p_amount" numeric, "p_description" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."user_store_ids"() RETURNS "text"[]
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text((current_setting('request.jwt.claims', true)::jsonb) -> 'store_ids')),
    '{}'::text[]
  );
$$;
ALTER FUNCTION "public"."user_store_ids"() OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."accommodation_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "raw_name" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."accommodation_aliases" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."accommodation_partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_whatsapp" "text",
    "commission_type" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "commission_value" numeric(10,2) DEFAULT 0 NOT NULL,
    "advance_booking_days" integer DEFAULT 7 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "telegram_chat_id" "text",
    "commission_includes_extensions" boolean DEFAULT false NOT NULL,
    "deal_type" "text" DEFAULT 'commission'::"text" NOT NULL,
    "discount_type" "text",
    "discount_value" numeric(10,2),
    "free_delivery" boolean DEFAULT false NOT NULL,
    "advance_discount_days" integer,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "logo_url" "text",
    "early_bird_days" integer,
    "early_bird_discount_value" numeric(10,2),
    "welcome_message" "text",
    "logo_display_width" integer,
    "logo_display_height" integer,
    CONSTRAINT "accommodation_partners_commission_type_check" CHECK (("commission_type" = ANY (ARRAY['fixed'::"text", 'percentage'::"text"]))),
    CONSTRAINT "accommodation_partners_deal_type_check" CHECK (("deal_type" = ANY (ARRAY['commission'::"text", 'discount'::"text", 'free_delivery'::"text", 'combined'::"text"]))),
    CONSTRAINT "accommodation_partners_discount_type_check" CHECK ((("discount_type" IS NULL) OR ("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"])))),
    CONSTRAINT "accommodation_partners_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text", 'rejected'::"text"])))
);
ALTER TABLE "public"."accommodation_partners" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."addons" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "price_per_day" numeric(12,2) DEFAULT 0 NOT NULL,
    "price_one_time" numeric(12,2) DEFAULT 0 NOT NULL,
    "addon_type" "text" NOT NULL,
    "store_id" "text",
    "mutual_exclusivity_group" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "applicable_model_ids" "text"[],
    CONSTRAINT "addons_addon_type_check" CHECK (("addon_type" = ANY (ARRAY['per_day'::"text", 'one_time'::"text"])))
);
ALTER TABLE "public"."addons" OWNER TO "postgres";
COMMENT ON COLUMN "public"."addons"."applicable_model_ids" IS 'When NULL or empty, the add-on applies to all vehicle models. When populated, only applies to the listed model IDs.';
CREATE SEQUENCE IF NOT EXISTS "public"."addons_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."addons_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."addons_id_seq" OWNED BY "public"."addons"."id";
CREATE TABLE IF NOT EXISTS "public"."booking_holds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_model_id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "pickup_datetime" timestamp with time zone NOT NULL,
    "dropoff_datetime" timestamp with time zone NOT NULL,
    "session_token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_reference" "text",
    CONSTRAINT "booking_holds_pickup_before_dropoff" CHECK (("pickup_datetime" < "dropoff_datetime"))
);
ALTER TABLE "public"."booking_holds" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."booking_sessions" (
    "session_token" "text" NOT NULL,
    "store_id" "text",
    "pickup_datetime" timestamp with time zone,
    "dropoff_datetime" timestamp with time zone,
    "basket_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "device_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "basket_viewed_at" timestamp with time zone,
    "renter_details_started_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "renter_details" "jsonb",
    "interaction_count" integer DEFAULT 0 NOT NULL
);
ALTER TABLE "public"."booking_sessions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."budget_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "budget_period_id" "uuid" NOT NULL,
    "line_type" "text" NOT NULL,
    "category_label" "text" NOT NULL,
    "coa_account_id" "text",
    "expense_category_id" integer,
    "month" integer NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budget_lines_line_type_check" CHECK (("line_type" = ANY (ARRAY['revenue'::"text", 'expense'::"text", 'payroll'::"text", 'depreciation'::"text", 'drawings'::"text", 'transfer_revenue'::"text", 'misc_revenue'::"text"]))),
    CONSTRAINT "budget_lines_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);
ALTER TABLE "public"."budget_lines" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."budget_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "text",
    "year" integer NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."budget_periods" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."card_settlements" (
    "id" integer NOT NULL,
    "is_paid" boolean DEFAULT false NOT NULL,
    "order_id" "text",
    "customer_id" "text",
    "settlement_ref" "text",
    "date_settled" "date",
    "store_id" "text" NOT NULL,
    "net_amount" numeric(12,2),
    "fee_expense" numeric(12,2),
    "account_id" "text",
    "raw_date" "text",
    "name" "text",
    "ref_number" "text",
    "amount" numeric(12,2),
    "forecasted_date" "date",
    "batch_no" "text",
    "mid" "text",
    "merchant" "text",
    "tx_type" "text",
    "card_num" "text",
    "orig_amt" numeric(12,2),
    "exch_rate" numeric(8,4),
    "settle_amt" numeric(12,2),
    "other_fee" numeric(12,2),
    "tax" numeric(12,2),
    "net_settlement" numeric(12,2),
    "paid_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."card_settlements" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."card_settlements_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."card_settlements_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."card_settlements_id_seq" OWNED BY "public"."card_settlements"."id";
CREATE TABLE IF NOT EXISTS "public"."cash_advance_schedules" (
    "id" "text" NOT NULL,
    "employee_id" "text" NOT NULL,
    "expense_id" "text",
    "total_amount" numeric(12,2) NOT NULL,
    "granted_date" "date" NOT NULL,
    "installment_amount" numeric(12,2) NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "deducted" boolean DEFAULT false NOT NULL,
    "deducted_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deduction_per_period" numeric(12,2),
    "remaining_balance" numeric(12,2),
    "start_date" "date",
    "payday_type" "text" DEFAULT 'end_of_month'::"text" NOT NULL,
    CONSTRAINT "cash_advance_schedules_payday_type_check" CHECK (("payday_type" = ANY (ARRAY['mid_month'::"text", 'end_of_month'::"text"])))
);
ALTER TABLE "public"."cash_advance_schedules" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."cash_reconciliation" (
    "id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "store_id" "text" NOT NULL,
    "opening_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "expected_cash" numeric(12,2) DEFAULT 0 NOT NULL,
    "actual_counted" numeric(12,2) DEFAULT 0 NOT NULL,
    "variance" numeric(12,2) DEFAULT 0 NOT NULL,
    "variance_type" "text",
    "submitted_by" "text",
    "submitted_at" timestamp with time zone,
    "is_locked" boolean DEFAULT false NOT NULL,
    "overridden_by" "text",
    "overridden_at" timestamp with time zone,
    "override_reason" "text",
    "till_counted" numeric(12,2),
    "deposits_counted" numeric(12,2),
    "till_denoms" "jsonb",
    "deposit_denoms" "jsonb",
    "till_expected" numeric(12,2),
    "deposits_expected" numeric(12,2),
    "till_variance" numeric(12,2),
    "deposit_variance" numeric(12,2),
    "closing_balance" numeric(12,2),
    "deposits_closing_balance" numeric(12,2)
);
ALTER TABLE "public"."cash_reconciliation" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "account_type" "text" NOT NULL,
    "store_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chart_of_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['Asset'::"text", 'Liability'::"text", 'Income'::"text", 'Expense'::"text", 'Equity'::"text"])))
);
ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "store_id" "text" DEFAULT 'store-lolas'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "page_origin" "text",
    "message_count" integer DEFAULT 0 NOT NULL,
    "handoff_triggered" boolean DEFAULT false NOT NULL,
    "device_type" "text",
    "messages" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);
ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "text" NOT NULL,
    "store_id" "text",
    "name" "text" NOT NULL,
    "email" "text",
    "mobile" "text",
    "total_spent" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "blacklisted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_opt_out" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."customers" OWNER TO "postgres";
COMMENT ON COLUMN "public"."customers"."email_opt_out" IS 'When true, suppress automated follow-up emails (e.g. post-rental thank-you).';
CREATE TABLE IF NOT EXISTS "public"."day_types" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL
);
ALTER TABLE "public"."day_types" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."delivery_reminder_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_item_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" "text",
    "telegram_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_reminder_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['pickup'::"text", 'dropoff'::"text"])))
);
ALTER TABLE "public"."delivery_reminder_log" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."directory" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "number" "text",
    "email" "text",
    "relationship" "text",
    "gcash_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "bank_name" "text",
    "bank_account_number" "text",
    "address" "text",
    "notes" "text"
);
ALTER TABLE "public"."directory" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."directory_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."directory_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."directory_id_seq" OWNED BY "public"."directory"."id";
CREATE TABLE IF NOT EXISTS "public"."employee_stores" (
    "employee_id" "text" NOT NULL,
    "store_id" "text" NOT NULL
);
ALTER TABLE "public"."employee_stores" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "text" NOT NULL,
    "store_id" "text",
    "full_name" "text" NOT NULL,
    "role" "text",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "birthday" "date",
    "emergency_contact_name" "text",
    "emergency_contact_number" "text",
    "start_date" "date",
    "probation_end_date" "date",
    "rate_type" "text",
    "basic_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "overtime_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "nine_pm_bonus_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "commission_rate" numeric(8,4) DEFAULT 0 NOT NULL,
    "paid_as" "text",
    "monthly_bike_allowance" numeric(12,2) DEFAULT 0 NOT NULL,
    "bike_allowance_used" numeric(12,2) DEFAULT 0 NOT NULL,
    "bike_allowance_accrued" numeric(12,2) DEFAULT 0 NOT NULL,
    "available_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "thirteenth_month_accrued" numeric(12,2) DEFAULT 0 NOT NULL,
    "current_cash_advance" numeric(12,2) DEFAULT 0 NOT NULL,
    "holiday_allowance" integer DEFAULT 0 NOT NULL,
    "holiday_used" integer DEFAULT 0 NOT NULL,
    "sick_allowance" integer DEFAULT 0 NOT NULL,
    "sick_used" integer DEFAULT 0 NOT NULL,
    "sss_no" "text",
    "philhealth_no" "text",
    "pagibig_no" "text",
    "tin" "text",
    "sss_deduction_amt" numeric(12,2) DEFAULT 0 NOT NULL,
    "philhealth_deduction_amt" numeric(12,2) DEFAULT 0 NOT NULL,
    "pagibig_deduction_amt" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_payment_method" "text" DEFAULT 'cash'::"text" NOT NULL,
    "telegram_user_id" "text",
    CONSTRAINT "employees_default_payment_method_check" CHECK (("default_payment_method" = ANY (ARRAY['cash'::"text", 'gcash'::"text", 'bank_transfer'::"text"]))),
    CONSTRAINT "employees_rate_type_check" CHECK (("rate_type" = ANY (ARRAY['daily'::"text", 'monthly'::"text"])))
);
ALTER TABLE "public"."employees" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "main_category" "text",
    "account_id" "text",
    "is_active" boolean DEFAULT true NOT NULL
);
ALTER TABLE "public"."expense_categories" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."expense_categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."expense_categories_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."expense_categories_id_seq" OWNED BY "public"."expense_categories"."id";
CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "text" NOT NULL,
    "maintenance_id" "text",
    "store_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "category" "text" NOT NULL,
    "vehicle_id" "text",
    "amount" numeric(12,2) NOT NULL,
    "transfer_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_from" "text",
    "description" "text",
    "employee_id" "text",
    "account_id" "text",
    "paid_to" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "expenses_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'unpaid'::"text"])))
);
ALTER TABLE "public"."expenses" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."fleet" (
    "id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "model_id" "text",
    "plate_number" "text",
    "gps_id" "text",
    "status" "text" DEFAULT 'Available'::"text" NOT NULL,
    "current_mileage" numeric(10,1) DEFAULT 0 NOT NULL,
    "orcr_expiry_date" "date",
    "surf_rack" boolean DEFAULT false NOT NULL,
    "owner" "text",
    "rentable_start_date" "date",
    "registration_date" "date",
    "purchase_price" numeric(12,2),
    "purchase_date" "date",
    "set_up_costs" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_bike_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "useful_life_months" integer,
    "salvage_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "accumulated_depreciation" numeric(12,2) DEFAULT 0 NOT NULL,
    "book_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "date_sold" "date",
    "sold_price" numeric(12,2),
    "profit_loss" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "odometer" integer,
    "engine_number" "text",
    "chassis_number" "text"
);
ALTER TABLE "public"."fleet" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."fleet_accounting_config" (
    "store_id" "text" NOT NULL,
    "fixed_asset_account_id" "text",
    "acc_depreciation_account_id" "text",
    "depreciation_expense_account_id" "text",
    "gain_loss_account_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."fleet_accounting_config" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."fleet_statuses" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_rentable" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."fleet_statuses" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."helmet_swaps" (
    "id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "order_item_id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "old_helmet_numbers" "text" NOT NULL,
    "new_helmet_numbers" "text" NOT NULL,
    "reason" "text",
    "employee_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."helmet_swaps" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."inspection_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "text",
    "name" "text" NOT NULL,
    "item_type" "text" DEFAULT 'accepted_issue'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vehicle_type" "text" DEFAULT 'all'::"text" NOT NULL,
    CONSTRAINT "inspection_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['accepted_issue'::"text", 'accepted_issue_qty'::"text", 'accepted_issue_na'::"text", 'accepted_issue_declined'::"text"]))),
    CONSTRAINT "inspection_items_vehicle_type_check" CHECK (("vehicle_type" = ANY (ARRAY['all'::"text", 'scooter'::"text", 'tuktuk'::"text"])))
);
ALTER TABLE "public"."inspection_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."inspection_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "inspection_item_id" "uuid",
    "item_name" "text" NOT NULL,
    "result" "text" NOT NULL,
    "qty" integer,
    "notes" "text",
    "log_maintenance" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inspection_results_result_check" CHECK (("result" = ANY (ARRAY['accepted'::"text", 'issue_noted'::"text", 'na'::"text", 'declined'::"text"])))
);
ALTER TABLE "public"."inspection_results" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "text",
    "order_reference" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "vehicle_id" "text",
    "vehicle_name" "text",
    "employee_id" "text",
    "km_reading" "text",
    "damage_notes" "text",
    "helmet_numbers" "text",
    "customer_signature_url" "text",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "text",
    CONSTRAINT "inspections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text"])))
);
ALTER TABLE "public"."inspections" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "text" NOT NULL,
    "transaction_id" "text" NOT NULL,
    "period" "text" NOT NULL,
    "date" "date" NOT NULL,
    "store_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "description" "text",
    "debit" numeric(12,2) DEFAULT 0 NOT NULL,
    "credit" numeric(12,2) DEFAULT 0 NOT NULL,
    "reference_type" "text" NOT NULL,
    "reference_id" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "debit_xor_credit" CHECK (((("debit" > (0)::numeric) AND ("credit" = (0)::numeric)) OR (("debit" = (0)::numeric) AND ("credit" > (0)::numeric)))),
    CONSTRAINT "positive_amounts" CHECK ((("debit" >= (0)::numeric) AND ("credit" >= (0)::numeric)))
);
ALTER TABLE "public"."journal_entries" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."late_return_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "employee_id" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."late_return_assignments" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."leave_config" (
    "id" integer NOT NULL,
    "store_id" "text" NOT NULL,
    "reset_month" integer DEFAULT 1 NOT NULL,
    "reset_day" integer DEFAULT 1 NOT NULL,
    "default_holiday_allowance" integer DEFAULT 5 NOT NULL,
    "default_sick_allowance" integer DEFAULT 5 NOT NULL,
    CONSTRAINT "leave_config_reset_day_check" CHECK ((("reset_day" >= 1) AND ("reset_day" <= 31))),
    CONSTRAINT "leave_config_reset_month_check" CHECK ((("reset_month" >= 1) AND ("reset_month" <= 12)))
);
ALTER TABLE "public"."leave_config" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."leave_config_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."leave_config_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."leave_config_id_seq" OWNED BY "public"."leave_config"."id";
CREATE TABLE IF NOT EXISTS "public"."leave_reset_log" (
    "id" bigint NOT NULL,
    "store_id" "text" NOT NULL,
    "run_date" "date" NOT NULL,
    "employees_reset" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."leave_reset_log" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."leave_reset_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."leave_reset_log_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."leave_reset_log_id_seq" OWNED BY "public"."leave_reset_log"."id";
CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "delivery_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "collection_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "location_type" "text",
    "store_id" "text",
    "is_active" boolean DEFAULT true NOT NULL
);
ALTER TABLE "public"."locations" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."locations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."locations_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."locations_id_seq" OWNED BY "public"."locations"."id";
CREATE TABLE IF NOT EXISTS "public"."lost_opportunity" (
    "id" integer NOT NULL,
    "store_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone,
    "vehicle_requested" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "duration_days" integer,
    "est_value" numeric(12,2),
    "reason" "text",
    "outcome" "text",
    "staff_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."lost_opportunity" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."lost_opportunity_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."lost_opportunity_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."lost_opportunity_id_seq" OWNED BY "public"."lost_opportunity"."id";
CREATE TABLE IF NOT EXISTS "public"."maintenance" (
    "id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asset_id" "text" NOT NULL,
    "vehicle_name" "text",
    "status" "text" DEFAULT 'Reported'::"text" NOT NULL,
    "downtime_tracked" boolean DEFAULT false NOT NULL,
    "downtime_start" "date",
    "downtime_end" "date",
    "total_downtime_days" integer,
    "issue_description" "text",
    "work_performed" "text",
    "parts_replaced" "jsonb",
    "parts_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "labor_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_from" "text",
    "mechanic" "text",
    "odometer" numeric(10,1),
    "next_service_due" numeric(10,1),
    "employee_id" "text",
    "store_id" "text" NOT NULL,
    "ops_notes" "text",
    "next_service_due_date" "date",
    CONSTRAINT "maintenance_status_check" CHECK (("status" = ANY (ARRAY['Reported'::"text", 'In Progress'::"text", 'Completed'::"text"])))
);
ALTER TABLE "public"."maintenance" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."maintenance_work_types" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);
ALTER TABLE "public"."maintenance_work_types" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."maintenance_work_types_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."maintenance_work_types_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."maintenance_work_types_id_seq" OWNED BY "public"."maintenance_work_types"."id";
CREATE TABLE IF NOT EXISTS "public"."maya_checkouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checkout_id" "text" NOT NULL,
    "order_id" "text",
    "store_id" "text" NOT NULL,
    "amount_php" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "redirect_url" "text" NOT NULL,
    "created_by" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_order_id" "uuid",
    CONSTRAINT "maya_checkouts_exactly_one_order_link" CHECK (((("order_id" IS NOT NULL) AND ("raw_order_id" IS NULL)) OR (("order_id" IS NULL) AND ("raw_order_id" IS NOT NULL)))),
    CONSTRAINT "maya_checkouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'payment_failed'::"text", 'payment_expired'::"text"])))
);
ALTER TABLE "public"."maya_checkouts" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."merchandise" (
    "sku" "text" NOT NULL,
    "item_name" "text" NOT NULL,
    "size_variant" "text",
    "cost_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "sale_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "starting_stock" integer DEFAULT 0 NOT NULL,
    "sold_count" integer DEFAULT 0 NOT NULL,
    "current_stock" integer DEFAULT 0 NOT NULL,
    "store_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "low_stock_threshold" integer DEFAULT 5 NOT NULL
);
ALTER TABLE "public"."merchandise" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."misc_sales" (
    "id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "store_id" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "amount" numeric(12,2) NOT NULL,
    "received_into" "text",
    "income_account_id" "text",
    "employee_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."misc_sales" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."nine_pm_reminder_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_reference" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."nine_pm_reminder_log" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."order_addons" (
    "id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "order_item_id" "text",
    "customer_id" "text",
    "addon_name" "text" NOT NULL,
    "addon_price" numeric(12,2) NOT NULL,
    "addon_type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "total_amount" numeric(12,2) NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "added_date" "date",
    "employee_id" "text",
    "notes" "text",
    CONSTRAINT "order_addons_addon_type_check" CHECK (("addon_type" = ANY (ARRAY['per_day'::"text", 'one_time'::"text"])))
);
ALTER TABLE "public"."order_addons" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "vehicle_id" "text",
    "vehicle_name" "text",
    "pickup_datetime" timestamp with time zone,
    "dropoff_datetime" timestamp with time zone,
    "rental_days_count" integer DEFAULT 0 NOT NULL,
    "pickup_location" "text",
    "dropoff_location" "text",
    "pickup_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "dropoff_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "rental_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "helmet_numbers" "text",
    "discount" numeric(12,2) DEFAULT 0 NOT NULL,
    "ops_notes" "text",
    "return_condition" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vehicle_model_id" "text",
    "daily_rate" numeric(12,2),
    "rental_days" integer,
    "subtotal" numeric(12,2),
    "pickup_location_id" "text",
    "dropoff_location_id" "text",
    "order_reference" "text",
    "original_dropoff_datetime" timestamp with time zone
);
ALTER TABLE "public"."order_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "customer_id" "text",
    "employee_id" "text",
    "order_date" "date" NOT NULL,
    "status" "text" DEFAULT 'unprocessed'::"text" NOT NULL,
    "web_notes" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "web_quote_raw" numeric(12,2),
    "security_deposit" numeric(12,2) DEFAULT 0 NOT NULL,
    "deposit_status" "text",
    "card_fee_surcharge" numeric(12,2) DEFAULT 0 NOT NULL,
    "return_charges" numeric(12,2) DEFAULT 0 NOT NULL,
    "final_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "balance_due" numeric(12,2) DEFAULT 0 NOT NULL,
    "payment_method_id" "text",
    "deposit_method_id" "text",
    "booking_token" "text",
    "tips" numeric(12,2) DEFAULT 0 NOT NULL,
    "charity_donation" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_order_id" "text",
    "woo_order_id" "text",
    "settled_at" timestamp with time zone,
    "dropoff_location_note" "text",
    "return_charges_note" "text",
    "partner_ref" "text",
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['unprocessed'::"text", 'active'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."orders" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."orders_raw" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "payload" "jsonb",
    "status" "text" DEFAULT 'unprocessed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_channel" "text" DEFAULT 'woocommerce'::"text" NOT NULL,
    "customer_name" "text",
    "customer_email" "text",
    "customer_mobile" "text",
    "vehicle_model_id" "text",
    "pickup_datetime" timestamp with time zone,
    "dropoff_datetime" timestamp with time zone,
    "pickup_location_id" integer,
    "dropoff_location_id" integer,
    "store_id" "text",
    "order_reference" "text",
    "addon_ids" integer[],
    "transfer_type" "text",
    "flight_number" "text",
    "flight_arrival_time" timestamp with time zone,
    "transfer_route" "text",
    "charity_donation" numeric(12,2) DEFAULT 0 NOT NULL,
    "web_payment_method" "text",
    "cancelled_at" timestamp with time zone,
    "cancelled_reason" "text",
    "cancellation_token" "text",
    "cancellation_token_used" boolean DEFAULT false NOT NULL,
    "transfer_pax_count" integer,
    "transfer_amount" numeric(12,2),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "web_quote_raw" numeric(12,2),
    "original_dropoff_datetime" timestamp with time zone,
    "vehicle_id" "text",
    "customer_company" "text",
    "customer_extra_comments" "text",
    "device_type" "text",
    "pickup_location_address" "text",
    "dropoff_location_address" "text",
    "partner_ref" "text",
    "rental_value_raw" numeric(12,2),
    CONSTRAINT "orders_raw_booking_channel_check" CHECK (("booking_channel" = ANY (ARRAY['woocommerce'::"text", 'direct'::"text", 'walk_in'::"text"]))),
    CONSTRAINT "orders_raw_device_type_check" CHECK (("device_type" = ANY (ARRAY['mobile'::"text", 'desktop'::"text"]))),
    CONSTRAINT "orders_raw_source_check" CHECK (("source" = ANY (ARRAY['lolas'::"text", 'bass'::"text"]))),
    CONSTRAINT "orders_raw_status_check" CHECK (("status" = ANY (ARRAY['unprocessed'::"text", 'processed'::"text", 'skipped'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."orders_raw" OWNER TO "postgres";
CREATE OR REPLACE VIEW "public"."partner_booking_attribution" AS
 SELECT "or_raw"."id" AS "raw_order_id",
    "or_raw"."order_reference",
    "or_raw"."store_id",
    "or_raw"."partner_ref",
    "or_raw"."status" AS "raw_status",
    "or_raw"."created_at" AS "booked_at",
    "or_raw"."pickup_datetime",
    "or_raw"."dropoff_datetime",
    "or_raw"."customer_name",
    "or_raw"."web_quote_raw",
    "or_raw"."rental_value_raw",
    "to_char"("date_trunc"('month'::"text", ("or_raw"."created_at" AT TIME ZONE 'Asia/Manila'::"text")), 'YYYY-MM'::"text") AS "booking_month",
    "ap"."id" AS "partner_id",
    "ap"."name" AS "partner_name",
    "ap"."commission_type",
    "ap"."commission_value",
    "ap"."advance_booking_days",
    "ap"."commission_includes_extensions",
    "ap"."active" AS "partner_active",
    "ap"."telegram_chat_id",
        CASE
            WHEN ("ap"."commission_type" = 'fixed'::"text") THEN NULL::numeric
            WHEN "ap"."commission_includes_extensions" THEN COALESCE(( SELECT ("o"."final_total" - "o"."security_deposit")
               FROM "public"."orders" "o"
              WHERE (("o"."partner_ref" = "or_raw"."partner_ref") AND ("o"."store_id" = "or_raw"."store_id") AND ("or_raw"."status" = 'processed'::"text"))
              ORDER BY "o"."created_at" DESC
             LIMIT 1), "or_raw"."rental_value_raw", "or_raw"."web_quote_raw")
            ELSE COALESCE("or_raw"."rental_value_raw", "or_raw"."web_quote_raw")
        END AS "commission_base",
        CASE
            WHEN ("or_raw"."status" = 'cancelled'::"text") THEN false
            WHEN ("or_raw"."pickup_datetime" IS NULL) THEN false
            WHEN ((EXTRACT(epoch FROM ("or_raw"."pickup_datetime" - "or_raw"."created_at")) / 86400.0) >= ("ap"."advance_booking_days")::numeric) THEN true
            ELSE false
        END AS "is_commissionable",
        CASE
            WHEN ("or_raw"."status" = 'cancelled'::"text") THEN (0)::numeric
            WHEN ("or_raw"."pickup_datetime" IS NULL) THEN (0)::numeric
            WHEN ((EXTRACT(epoch FROM ("or_raw"."pickup_datetime" - "or_raw"."created_at")) / 86400.0) >= ("ap"."advance_booking_days")::numeric) THEN
            CASE "ap"."commission_type"
                WHEN 'percentage'::"text" THEN "round"(((COALESCE(
                CASE
                    WHEN "ap"."commission_includes_extensions" THEN COALESCE(( SELECT ("o"."final_total" - "o"."security_deposit")
                       FROM "public"."orders" "o"
                      WHERE (("o"."partner_ref" = "or_raw"."partner_ref") AND ("o"."store_id" = "or_raw"."store_id") AND ("or_raw"."status" = 'processed'::"text"))
                      ORDER BY "o"."created_at" DESC
                     LIMIT 1), "or_raw"."rental_value_raw", "or_raw"."web_quote_raw")
                    ELSE COALESCE("or_raw"."rental_value_raw", "or_raw"."web_quote_raw")
                END, (0)::numeric) * "ap"."commission_value") / (100)::numeric), 2)
                ELSE "ap"."commission_value"
            END
            ELSE (0)::numeric
        END AS "commission_amount"
   FROM ("public"."orders_raw" "or_raw"
     JOIN "public"."accommodation_partners" "ap" ON ((("ap"."slug" = "or_raw"."partner_ref") AND ("ap"."store_id" = "or_raw"."store_id"))))
  WHERE ("or_raw"."partner_ref" IS NOT NULL);
ALTER VIEW "public"."partner_booking_attribution" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."partner_enrollment_details" (
    "partner_id" "uuid" NOT NULL,
    "property_type" "text",
    "room_count" integer,
    "star_rating" "text",
    "guest_profile" "text",
    "avg_length_of_stay" "text",
    "monthly_occupancy_pct" integer,
    "existing_vehicle_provider" "text",
    "estimated_vehicles_per_month" integer,
    "peak_seasons" "text",
    "rental_type_preference" "text",
    "has_concierge" boolean,
    "wants_printed_materials" boolean,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "motivations" "text"
);
ALTER TABLE "public"."partner_enrollment_details" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."paw_card_entries" (
    "id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_id" "text",
    "full_name" "text" NOT NULL,
    "email" "text",
    "establishment" "text" NOT NULL,
    "date_of_visit" "date",
    "number_of_people" integer,
    "amount_saved" numeric(12,2) DEFAULT 0 NOT NULL,
    "rental_total" numeric(12,2),
    "rental_days" integer,
    "effective_per_day" numeric(12,2),
    "receipt_url" "text",
    "paw_reference" "text"
);
ALTER TABLE "public"."paw_card_entries" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."paw_card_entries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."paw_card_entries_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."paw_card_entries_id_seq" OWNED BY "public"."paw_card_entries"."id";
CREATE TABLE IF NOT EXISTS "public"."paw_card_establishments" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "category" "text" DEFAULT 'Food & Drink'::"text" NOT NULL,
    "discount_headline" "text",
    "discount_conditions" "text",
    "description" "text",
    "opening_hours" "text",
    "saving_solo" integer,
    "saving_group" integer,
    "google_rating" numeric(2,1),
    "google_maps_url" "text",
    "instagram_url" "text",
    "is_favourite" boolean DEFAULT false NOT NULL,
    "is_high_value" boolean DEFAULT false NOT NULL,
    "time_of_day" "text" DEFAULT 'all_day'::"text",
    "discount_code" "text",
    "cloudinary_public_id" "text",
    CONSTRAINT "paw_card_establishments_category_check" CHECK (("category" = ANY (ARRAY['Food & Drink'::"text", 'Activities'::"text", 'Services'::"text", 'Shopping'::"text"]))),
    CONSTRAINT "paw_card_establishments_time_of_day_check" CHECK (("time_of_day" = ANY (ARRAY['all_day'::"text", 'morning'::"text", 'afternoon'::"text", 'evening'::"text", 'late_night'::"text"])))
);
ALTER TABLE "public"."paw_card_establishments" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."paw_card_establishments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."paw_card_establishments_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."paw_card_establishments_id_seq" OWNED BY "public"."paw_card_establishments"."id";
CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_deposit_eligible" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "surcharge_percent" numeric,
    "show_on_customer_website" boolean DEFAULT true NOT NULL
);
ALTER TABLE "public"."payment_methods" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."payment_routing_rules" (
    "id" integer NOT NULL,
    "store_id" "text" NOT NULL,
    "payment_method_id" "text" NOT NULL,
    "received_into_account_id" "text",
    "card_settlement_account_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."payment_routing_rules" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."payment_routing_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."payment_routing_rules_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."payment_routing_rules_id_seq" OWNED BY "public"."payment_routing_rules"."id";
CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "order_id" "text",
    "order_item_id" "text",
    "order_addon_id" "text",
    "payment_type" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method_id" "text",
    "transaction_date" "date" NOT NULL,
    "settlement_status" "text",
    "settlement_ref" "text",
    "customer_id" "text",
    "account_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_order_id" "uuid",
    "notes" "text"
);
ALTER TABLE "public"."payments" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."payroll_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_by" "text"
);
ALTER TABLE "public"."payroll_runs" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."post_rental_email_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."post_rental_email_log" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."post_rental_review_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_reference" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."post_rental_review_log" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."recurring_bills" (
    "id" integer NOT NULL,
    "bill_name" "text" NOT NULL,
    "category" "text",
    "amount" numeric(12,2) NOT NULL,
    "day_of_month" integer NOT NULL,
    "store_id" "text",
    "account_id" "text",
    "auto_post_to_ledger" boolean DEFAULT false NOT NULL,
    "last_posted_date" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_bills_day_of_month_check" CHECK ((("day_of_month" >= 1) AND ("day_of_month" <= 31)))
);
ALTER TABLE "public"."recurring_bills" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."recurring_bills_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."recurring_bills_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."recurring_bills_id_seq" OWNED BY "public"."recurring_bills"."id";
CREATE TABLE IF NOT EXISTS "public"."repair_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_type" "text" NOT NULL,
    "item" "text" NOT NULL,
    "cost_php" numeric(12,2) NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);
ALTER TABLE "public"."repair_costs" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."return_reminder_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_reference" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."return_reminder_log" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" integer NOT NULL,
    "external_id" "text",
    "platform" "text" NOT NULL,
    "store_id" "text",
    "date" "date",
    "reviewer_name" "text",
    "star_rating" integer,
    "comment" "text",
    "replied" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "reviewer_role" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "reviews_star_rating_check" CHECK ((("star_rating" >= 1) AND ("star_rating" <= 5)))
);
ALTER TABLE "public"."reviews" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."reviews_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."reviews_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."reviews_id_seq" OWNED BY "public"."reviews"."id";
CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "text" NOT NULL,
    "permission" "text" NOT NULL
);
ALTER TABLE "public"."role_permissions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."roles" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "location" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_token" "text" NOT NULL,
    "public_booking_enabled" boolean DEFAULT false NOT NULL,
    "default_float_amount" numeric(12,2) DEFAULT 3000 NOT NULL,
    "card_fee_account_id" "text",
    "default_cash_account_id" "text"
);
ALTER TABLE "public"."stores" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."task_categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "colour" "text" DEFAULT '#6B7280'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."task_categories" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."task_categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."task_categories_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."task_categories_id_seq" OWNED BY "public"."task_categories"."id";
CREATE TABLE IF NOT EXISTS "public"."task_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_id" "text" NOT NULL,
    "actor_name" "text",
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'acknowledged'::"text", 'started'::"text", 'submitted'::"text", 'verified'::"text", 'rejected'::"text", 'escalated'::"text", 'commented'::"text", 'reassigned'::"text", 'updated'::"text"])))
);
ALTER TABLE "public"."task_events" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."task_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "text" NOT NULL,
    "recipient_id" "text" NOT NULL,
    "notification_type" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "is_dismissed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_notifications_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['assigned'::"text", 'rejected'::"text", 'escalated'::"text", 'overdue'::"text", 'comment'::"text"])))
);
ALTER TABLE "public"."task_notifications" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."timesheet_amendment_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timesheet_id" "text" NOT NULL,
    "amended_by" "uuid" NOT NULL,
    "amended_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "before_values" "jsonb" NOT NULL,
    "after_values" "jsonb" NOT NULL
);
ALTER TABLE "public"."timesheet_amendment_logs" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."timesheets" (
    "id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "employee_id" "text" NOT NULL,
    "name" "text",
    "day_type" "text" DEFAULT 'Regular'::"text" NOT NULL,
    "time_in" time without time zone,
    "time_out" time without time zone,
    "regular_hours" numeric(4,2) DEFAULT 0 NOT NULL,
    "overtime_hours" numeric(4,2) DEFAULT 0 NOT NULL,
    "nine_pm_returns_count" integer DEFAULT 0 NOT NULL,
    "daily_notes" "text",
    "payroll_status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "sil_inflation" numeric(12,2) DEFAULT 0 NOT NULL,
    "store_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "timesheets_payroll_status_check" CHECK (("payroll_status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Paid'::"text"])))
);
ALTER TABLE "public"."timesheets" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."todo_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "text" NOT NULL,
    "employee_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."todo_comments" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."todo_tasks" (
    "id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "employee_id" "text",
    "vehicle_id" "text",
    "assigned_by" "text",
    "assigned_to" "text",
    "task_description" "text" NOT NULL,
    "completion_response" "text",
    "date_created" timestamp with time zone DEFAULT "now"() NOT NULL,
    "date_completed" timestamp with time zone,
    "visibility" "text" DEFAULT 'all'::"text" NOT NULL,
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "due_date" "date",
    "task_category" "text",
    "seen_by" "text"[] DEFAULT '{}'::"text"[],
    "completed_by" "text",
    "title" "text",
    "description" "text",
    "category_id" integer,
    "acknowledged_at" timestamp with time zone,
    "escalation_count" integer DEFAULT 0 NOT NULL,
    "is_escalated" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "todo_telegram_message_id" "text",
    CONSTRAINT "todo_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['Low'::"text", 'Medium'::"text", 'High'::"text", 'Urgent'::"text"]))),
    CONSTRAINT "todo_tasks_status_check" CHECK (("status" = ANY (ARRAY['Created'::"text", 'Acknowledged'::"text", 'In Progress'::"text", 'Pending Verification'::"text", 'Closed'::"text"])))
);
ALTER TABLE "public"."todo_tasks" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."transfer_pickup_rules" (
    "id" integer NOT NULL,
    "vehicle_type" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "rule_type" "text" NOT NULL,
    "flight_hour" integer,
    "pickup_from" time without time zone,
    "pickup_to" time without time zone,
    "offset_mins" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "transfer_pickup_rules_direction_check" CHECK (("direction" = ANY (ARRAY['outbound'::"text", 'inbound'::"text"]))),
    CONSTRAINT "transfer_pickup_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['bracket'::"text", 'offset'::"text"])))
);
ALTER TABLE "public"."transfer_pickup_rules" OWNER TO "postgres";
COMMENT ON TABLE "public"."transfer_pickup_rules" IS 'Stores pickup time rules for airport transfers. Bracket rules apply to shared van outbound trips; offset rules apply to private van and tuktuk outbound trips.';
CREATE SEQUENCE IF NOT EXISTS "public"."transfer_pickup_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."transfer_pickup_rules_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."transfer_pickup_rules_id_seq" OWNED BY "public"."transfer_pickup_rules"."id";
CREATE TABLE IF NOT EXISTS "public"."transfer_routes" (
    "id" integer NOT NULL,
    "route" "text" NOT NULL,
    "van_type" "text",
    "price" numeric(12,2) NOT NULL,
    "store_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "pricing_type" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "driver_cut" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "transfer_routes_pricing_type_check" CHECK (("pricing_type" = ANY (ARRAY['fixed'::"text", 'per_head'::"text"])))
);
ALTER TABLE "public"."transfer_routes" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."transfer_routes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."transfer_routes_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."transfer_routes_id_seq" OWNED BY "public"."transfer_routes"."id";
CREATE TABLE IF NOT EXISTS "public"."transfers" (
    "id" "text" NOT NULL,
    "order_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_date" "date" NOT NULL,
    "customer_name" "text" NOT NULL,
    "contact_number" "text",
    "customer_email" "text",
    "customer_type" "text",
    "route" "text" NOT NULL,
    "flight_time" "text",
    "pax_count" integer DEFAULT 1 NOT NULL,
    "van_type" "text",
    "accommodation" "text",
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "ops_notes" "text",
    "total_price" numeric(12,2) NOT NULL,
    "payment_method" "text",
    "payment_status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "driver_fee" numeric(12,2),
    "net_profit" numeric(12,2),
    "driver_paid_status" "text",
    "booking_source" "text",
    "booking_token" "text",
    "store_id" "text" NOT NULL,
    "collected_at" timestamp with time zone,
    "collected_amount" numeric(12,2),
    "pickup_time" time without time zone,
    "pickup_time_end" time without time zone,
    "telegram_message_id" "text",
    "driver_confirmed" boolean DEFAULT false,
    "driver_confirmed_at" timestamp with time zone,
    "flight_number" "text",
    CONSTRAINT "transfers_customer_type_check" CHECK (("customer_type" = ANY (ARRAY['Walk-in'::"text", 'Online'::"text"]))),
    CONSTRAINT "transfers_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['Pending'::"text", 'Partially Paid'::"text", 'Paid'::"text"])))
);
ALTER TABLE "public"."transfers" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."ui_errors" (
    "id" "text" NOT NULL,
    "page" "text" NOT NULL,
    "error_description" "text" NOT NULL,
    "idea_and_improvements" "text",
    "employee_id" "text",
    "fixed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."ui_errors" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "pin_hash" "text" NOT NULL,
    "employee_id" "text" NOT NULL,
    "role_id" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."users" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."vehicle_model_pricing" (
    "id" integer NOT NULL,
    "model_id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "min_days" integer NOT NULL,
    "max_days" integer NOT NULL,
    "daily_rate" numeric(12,2) NOT NULL
);
ALTER TABLE "public"."vehicle_model_pricing" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."vehicle_model_pricing_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."vehicle_model_pricing_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."vehicle_model_pricing_id_seq" OWNED BY "public"."vehicle_model_pricing"."id";
CREATE TABLE IF NOT EXISTS "public"."vehicle_models" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "security_deposit" numeric(12,2) DEFAULT 0 NOT NULL,
    "type" "text",
    "cc" integer,
    "max_pax" integer,
    "peace_of_mind_per_day" numeric(12,2)
);
ALTER TABLE "public"."vehicle_models" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."vehicle_swaps" (
    "id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "order_item_id" "text" NOT NULL,
    "store_id" "text" NOT NULL,
    "old_vehicle_id" "text" NOT NULL,
    "old_vehicle_name" "text",
    "new_vehicle_id" "text" NOT NULL,
    "new_vehicle_name" "text",
    "swap_date" "date" NOT NULL,
    "swap_time" time without time zone,
    "reason" "text",
    "employee_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."vehicle_swaps" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."waiver_reminder_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."waiver_reminder_log" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."waivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_reference" "text",
    "store_id" "text" NOT NULL,
    "driver_name" "text" NOT NULL,
    "driver_email" "text",
    "driver_mobile" "text",
    "agreed_to_terms" boolean DEFAULT false NOT NULL,
    "agreed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "licence_front_url" "text",
    "licence_back_url" "text",
    "driver_signature_url" "text",
    "passenger_signatures" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "text",
    "referral_source" "text",
    "referral_detail" "text",
    CONSTRAINT "waivers_reference_or_customer" CHECK ((("order_reference" IS NOT NULL) OR ("customer_id" IS NOT NULL))),
    CONSTRAINT "waivers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'signed'::"text", 'expired'::"text"])))
);
ALTER TABLE "public"."waivers" OWNER TO "postgres";
ALTER TABLE ONLY "public"."addons" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."addons_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."card_settlements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."card_settlements_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."directory" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."directory_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."expense_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."expense_categories_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."leave_config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."leave_config_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."leave_reset_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."leave_reset_log_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."locations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."locations_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."lost_opportunity" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lost_opportunity_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."maintenance_work_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."maintenance_work_types_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."paw_card_entries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."paw_card_entries_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."paw_card_establishments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."paw_card_establishments_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."payment_routing_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_routing_rules_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."recurring_bills" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."recurring_bills_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."reviews" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reviews_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."task_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."task_categories_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."transfer_pickup_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transfer_pickup_rules_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."transfer_routes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transfer_routes_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."vehicle_model_pricing" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vehicle_model_pricing_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."accommodation_aliases"
    ADD CONSTRAINT "accommodation_aliases_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."accommodation_partners"
    ADD CONSTRAINT "accommodation_partners_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."accommodation_partners"
    ADD CONSTRAINT "accommodation_partners_store_id_slug_key" UNIQUE ("store_id", "slug");
ALTER TABLE ONLY "public"."addons"
    ADD CONSTRAINT "addons_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."booking_sessions"
    ADD CONSTRAINT "booking_sessions_pkey" PRIMARY KEY ("session_token");
ALTER TABLE ONLY "public"."budget_lines"
    ADD CONSTRAINT "budget_lines_period_type_label_month_unique" UNIQUE ("budget_period_id", "line_type", "category_label", "month");
ALTER TABLE ONLY "public"."budget_lines"
    ADD CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."budget_periods"
    ADD CONSTRAINT "budget_periods_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."budget_periods"
    ADD CONSTRAINT "budget_periods_store_year_unique" UNIQUE ("store_id", "year");
ALTER TABLE ONLY "public"."card_settlements"
    ADD CONSTRAINT "card_settlements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."cash_advance_schedules"
    ADD CONSTRAINT "cash_advance_schedules_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."cash_reconciliation"
    ADD CONSTRAINT "cash_reconciliation_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."cash_reconciliation"
    ADD CONSTRAINT "cash_reconciliation_store_id_date_key" UNIQUE ("store_id", "date");
ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_session_id_key" UNIQUE ("session_id");
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."day_types"
    ADD CONSTRAINT "day_types_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."delivery_reminder_log"
    ADD CONSTRAINT "delivery_reminder_log_order_item_id_event_type_key" UNIQUE ("order_item_id", "event_type");
ALTER TABLE ONLY "public"."delivery_reminder_log"
    ADD CONSTRAINT "delivery_reminder_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."directory"
    ADD CONSTRAINT "directory_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."employee_stores"
    ADD CONSTRAINT "employee_stores_pkey" PRIMARY KEY ("employee_id", "store_id");
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_telegram_user_id_key" UNIQUE ("telegram_user_id");
ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."fleet_accounting_config"
    ADD CONSTRAINT "fleet_accounting_config_pkey" PRIMARY KEY ("store_id");
ALTER TABLE ONLY "public"."fleet"
    ADD CONSTRAINT "fleet_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."fleet_statuses"
    ADD CONSTRAINT "fleet_statuses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."helmet_swaps"
    ADD CONSTRAINT "helmet_swaps_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."inspection_items"
    ADD CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."inspection_results"
    ADD CONSTRAINT "inspection_results_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."late_return_assignments"
    ADD CONSTRAINT "late_return_assignments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."late_return_assignments"
    ADD CONSTRAINT "late_return_assignments_store_id_date_key" UNIQUE ("store_id", "date");
ALTER TABLE ONLY "public"."leave_config"
    ADD CONSTRAINT "leave_config_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."leave_config"
    ADD CONSTRAINT "leave_config_store_id_key" UNIQUE ("store_id");
ALTER TABLE ONLY "public"."leave_reset_log"
    ADD CONSTRAINT "leave_reset_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."leave_reset_log"
    ADD CONSTRAINT "leave_reset_log_store_id_run_date_key" UNIQUE ("store_id", "run_date");
ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."lost_opportunity"
    ADD CONSTRAINT "lost_opportunity_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."maintenance"
    ADD CONSTRAINT "maintenance_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."maintenance_work_types"
    ADD CONSTRAINT "maintenance_work_types_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."maya_checkouts"
    ADD CONSTRAINT "maya_checkouts_checkout_id_key" UNIQUE ("checkout_id");
ALTER TABLE ONLY "public"."maya_checkouts"
    ADD CONSTRAINT "maya_checkouts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."merchandise"
    ADD CONSTRAINT "merchandise_pkey" PRIMARY KEY ("sku");
ALTER TABLE ONLY "public"."misc_sales"
    ADD CONSTRAINT "misc_sales_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nine_pm_reminder_log"
    ADD CONSTRAINT "nine_pm_reminder_log_booking_reference_key" UNIQUE ("booking_reference");
ALTER TABLE ONLY "public"."nine_pm_reminder_log"
    ADD CONSTRAINT "nine_pm_reminder_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."order_addons"
    ADD CONSTRAINT "order_addons_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_booking_token_key" UNIQUE ("booking_token");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."orders_raw"
    ADD CONSTRAINT "orders_raw_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."partner_enrollment_details"
    ADD CONSTRAINT "partner_enrollment_details_pkey" PRIMARY KEY ("partner_id");
ALTER TABLE ONLY "public"."paw_card_entries"
    ADD CONSTRAINT "paw_card_entries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."paw_card_establishments"
    ADD CONSTRAINT "paw_card_establishments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_routing_rules"
    ADD CONSTRAINT "payment_routing_rules_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_routing_rules"
    ADD CONSTRAINT "payment_routing_rules_store_id_payment_method_id_key" UNIQUE ("store_id", "payment_method_id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_period_store_unique" UNIQUE ("store_id", "period_start", "period_end");
ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."post_rental_email_log"
    ADD CONSTRAINT "post_rental_email_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."post_rental_review_log"
    ADD CONSTRAINT "post_rental_review_log_booking_reference_key" UNIQUE ("booking_reference");
ALTER TABLE ONLY "public"."post_rental_review_log"
    ADD CONSTRAINT "post_rental_review_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."recurring_bills"
    ADD CONSTRAINT "recurring_bills_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."repair_costs"
    ADD CONSTRAINT "repair_costs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."return_reminder_log"
    ADD CONSTRAINT "return_reminder_log_booking_reference_key" UNIQUE ("booking_reference");
ALTER TABLE ONLY "public"."return_reminder_log"
    ADD CONSTRAINT "return_reminder_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_external_id_platform_key" UNIQUE ("external_id", "platform");
ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission");
ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");
ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_booking_token_key" UNIQUE ("booking_token");
ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."task_categories"
    ADD CONSTRAINT "task_categories_name_key" UNIQUE ("name");
ALTER TABLE ONLY "public"."task_categories"
    ADD CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."task_events"
    ADD CONSTRAINT "task_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."task_notifications"
    ADD CONSTRAINT "task_notifications_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."timesheet_amendment_logs"
    ADD CONSTRAINT "timesheet_amendment_logs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."timesheets"
    ADD CONSTRAINT "timesheets_employee_id_date_key" UNIQUE ("employee_id", "date");
ALTER TABLE ONLY "public"."timesheets"
    ADD CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."todo_comments"
    ADD CONSTRAINT "todo_comments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."todo_tasks"
    ADD CONSTRAINT "todo_tasks_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."transfer_pickup_rules"
    ADD CONSTRAINT "transfer_pickup_rules_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."transfer_routes"
    ADD CONSTRAINT "transfer_routes_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."transfer_routes"
    ADD CONSTRAINT "transfer_routes_route_van_type_store_id_key" UNIQUE ("route", "van_type", "store_id");
ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_booking_token_key" UNIQUE ("booking_token");
ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."ui_errors"
    ADD CONSTRAINT "ui_errors_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."transfer_pickup_rules"
    ADD CONSTRAINT "uq_pickup_rule" UNIQUE ("vehicle_type", "direction", "rule_type", "flight_hour");
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");
ALTER TABLE ONLY "public"."vehicle_model_pricing"
    ADD CONSTRAINT "vehicle_model_pricing_model_id_store_id_min_days_key" UNIQUE ("model_id", "store_id", "min_days");
ALTER TABLE ONLY "public"."vehicle_model_pricing"
    ADD CONSTRAINT "vehicle_model_pricing_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."vehicle_models"
    ADD CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."vehicle_swaps"
    ADD CONSTRAINT "vehicle_swaps_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."waiver_reminder_log"
    ADD CONSTRAINT "waiver_reminder_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."waivers"
    ADD CONSTRAINT "waivers_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "accommodation_aliases_raw_name_idx" ON "public"."accommodation_aliases" USING "btree" ("lower"(TRIM(BOTH FROM "raw_name")));
CREATE UNIQUE INDEX "budget_periods_company_wide_year_unique" ON "public"."budget_periods" USING "btree" ("year") WHERE ("store_id" IS NULL);
CREATE INDEX "chat_sessions_topics_gin" ON "public"."chat_sessions" USING "gin" ("topics");
CREATE INDEX "delivery_reminder_log_item_idx" ON "public"."delivery_reminder_log" USING "btree" ("order_item_id");
CREATE INDEX "idx_accommodation_partners_pending" ON "public"."accommodation_partners" USING "btree" ("created_at" DESC) WHERE ("status" = 'pending'::"text");
CREATE INDEX "idx_amendment_logs_timesheet" ON "public"."timesheet_amendment_logs" USING "btree" ("timesheet_id", "amended_at" DESC);
CREATE INDEX "idx_booking_holds_store_expires" ON "public"."booking_holds" USING "btree" ("store_id", "expires_at");
CREATE INDEX "idx_booking_sessions_created_at" ON "public"."booking_sessions" USING "btree" ("created_at" DESC);
CREATE INDEX "idx_booking_sessions_store_created" ON "public"."booking_sessions" USING "btree" ("store_id", "created_at" DESC);
CREATE INDEX "idx_budget_lines_period" ON "public"."budget_lines" USING "btree" ("budget_period_id");
CREATE INDEX "idx_budget_lines_period_month" ON "public"."budget_lines" USING "btree" ("budget_period_id", "month");
CREATE INDEX "idx_card_settle_store" ON "public"."card_settlements" USING "btree" ("store_id", "is_paid");
CREATE INDEX "idx_cash_adv_employee" ON "public"."cash_advance_schedules" USING "btree" ("employee_id");
CREATE INDEX "idx_chat_sessions_created_at" ON "public"."chat_sessions" USING "btree" ("created_at" DESC);
CREATE INDEX "idx_chat_sessions_store_created" ON "public"."chat_sessions" USING "btree" ("store_id", "created_at" DESC);
CREATE INDEX "idx_customers_email_lower" ON "public"."customers" USING "btree" ("lower"("email"));
CREATE INDEX "idx_expenses_store_date" ON "public"."expenses" USING "btree" ("store_id", "date");
CREATE INDEX "idx_fleet_store_status" ON "public"."fleet" USING "btree" ("store_id", "status");
CREATE INDEX "idx_je_account_date" ON "public"."journal_entries" USING "btree" ("account_id", "date");
CREATE INDEX "idx_je_reference" ON "public"."journal_entries" USING "btree" ("reference_type", "reference_id");
CREATE INDEX "idx_je_store_date" ON "public"."journal_entries" USING "btree" ("store_id", "date");
CREATE INDEX "idx_je_transaction" ON "public"."journal_entries" USING "btree" ("transaction_id");
CREATE INDEX "idx_leave_reset_log_store" ON "public"."leave_reset_log" USING "btree" ("store_id");
CREATE INDEX "idx_maintenance_asset" ON "public"."maintenance" USING "btree" ("asset_id");
CREATE INDEX "idx_maintenance_store" ON "public"."maintenance" USING "btree" ("store_id", "status");
CREATE INDEX "idx_maya_checkouts_checkout_id" ON "public"."maya_checkouts" USING "btree" ("checkout_id");
CREATE INDEX "idx_maya_checkouts_order_id" ON "public"."maya_checkouts" USING "btree" ("order_id");
CREATE INDEX "idx_maya_checkouts_raw_order_id" ON "public"."maya_checkouts" USING "btree" ("raw_order_id") WHERE ("raw_order_id" IS NOT NULL);
CREATE INDEX "idx_order_addons_order" ON "public"."order_addons" USING "btree" ("order_id");
CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");
CREATE INDEX "idx_order_items_vehicle" ON "public"."order_items" USING "btree" ("vehicle_id");
CREATE INDEX "idx_orders_customer" ON "public"."orders" USING "btree" ("customer_id");
CREATE INDEX "idx_orders_date" ON "public"."orders" USING "btree" ("order_date");
CREATE INDEX "idx_orders_partner_ref" ON "public"."orders" USING "btree" ("partner_ref") WHERE ("partner_ref" IS NOT NULL);
CREATE INDEX "idx_orders_raw_booking_channel" ON "public"."orders_raw" USING "btree" ("booking_channel");
CREATE INDEX "idx_orders_raw_cancellation_token" ON "public"."orders_raw" USING "btree" ("cancellation_token") WHERE ("cancellation_token" IS NOT NULL);
CREATE INDEX "idx_orders_raw_created" ON "public"."orders_raw" USING "btree" ("created_at" DESC);
CREATE INDEX "idx_orders_raw_partner_ref" ON "public"."orders_raw" USING "btree" ("partner_ref") WHERE ("partner_ref" IS NOT NULL);
CREATE INDEX "idx_orders_raw_source" ON "public"."orders_raw" USING "btree" ("source");
CREATE INDEX "idx_orders_raw_source_status_created" ON "public"."orders_raw" USING "btree" ("source", "status", "created_at" DESC);
CREATE INDEX "idx_orders_raw_status" ON "public"."orders_raw" USING "btree" ("status");
CREATE INDEX "idx_orders_raw_store_status" ON "public"."orders_raw" USING "btree" ("store_id", "status");
CREATE INDEX "idx_orders_raw_vehicle_id" ON "public"."orders_raw" USING "btree" ("vehicle_id") WHERE ("vehicle_id" IS NOT NULL);
CREATE INDEX "idx_orders_store_status" ON "public"."orders" USING "btree" ("store_id", "status");
CREATE INDEX "idx_paw_card_email" ON "public"."paw_card_entries" USING "btree" ("email");
CREATE INDEX "idx_paw_card_establishments_active_name" ON "public"."paw_card_establishments" USING "btree" ("is_active", "name");
CREATE INDEX "idx_payments_date" ON "public"."payments" USING "btree" ("transaction_date");
CREATE INDEX "idx_payments_order" ON "public"."payments" USING "btree" ("order_id");
CREATE INDEX "idx_payments_raw_order" ON "public"."payments" USING "btree" ("raw_order_id") WHERE ("raw_order_id" IS NOT NULL);
CREATE INDEX "idx_repair_costs_vehicle_type" ON "public"."repair_costs" USING "btree" ("vehicle_type");
CREATE INDEX "idx_task_events_actor" ON "public"."task_events" USING "btree" ("actor_id");
CREATE INDEX "idx_task_events_task" ON "public"."task_events" USING "btree" ("task_id", "created_at");
CREATE INDEX "idx_task_notif_recipient" ON "public"."task_notifications" USING "btree" ("recipient_id", "is_read");
CREATE INDEX "idx_timesheets_emp_date" ON "public"."timesheets" USING "btree" ("employee_id", "date");
CREATE INDEX "idx_timesheets_store" ON "public"."timesheets" USING "btree" ("store_id", "payroll_status");
CREATE INDEX "idx_todo_assigned" ON "public"."todo_tasks" USING "btree" ("assigned_to", "status");
CREATE INDEX "idx_todo_comments_task" ON "public"."todo_comments" USING "btree" ("task_id");
CREATE INDEX "idx_todo_tasks_due_status" ON "public"."todo_tasks" USING "btree" ("due_date", "status") WHERE ("status" <> 'Closed'::"text");
CREATE INDEX "idx_transfers_collected_at" ON "public"."transfers" USING "btree" ("collected_at") WHERE ("collected_at" IS NOT NULL);
CREATE INDEX "idx_transfers_store_date" ON "public"."transfers" USING "btree" ("store_id", "service_date");
CREATE INDEX "idx_transfers_store_service_date" ON "public"."transfers" USING "btree" ("store_id", "service_date" DESC);
CREATE INDEX "idx_vehicle_swaps_order" ON "public"."vehicle_swaps" USING "btree" ("order_id");
CREATE INDEX "inspection_results_inspection_id_idx" ON "public"."inspection_results" USING "btree" ("inspection_id");
CREATE INDEX "inspections_customer_id_idx" ON "public"."inspections" USING "btree" ("customer_id");
CREATE INDEX "inspections_order_id_idx" ON "public"."inspections" USING "btree" ("order_id");
CREATE INDEX "inspections_order_reference_idx" ON "public"."inspections" USING "btree" ("order_reference");
CREATE INDEX "nine_pm_reminder_log_reference_idx" ON "public"."nine_pm_reminder_log" USING "btree" ("booking_reference");
CREATE INDEX "post_rental_email_log_order_id_idx" ON "public"."post_rental_email_log" USING "btree" ("order_id");
CREATE INDEX "post_rental_review_log_reference_idx" ON "public"."post_rental_review_log" USING "btree" ("booking_reference");
CREATE INDEX "return_reminder_log_reference_idx" ON "public"."return_reminder_log" USING "btree" ("booking_reference");
CREATE INDEX "waiver_reminder_log_order_id_idx" ON "public"."waiver_reminder_log" USING "btree" ("order_id");
CREATE INDEX "waiver_reminder_log_sent_at_idx" ON "public"."waiver_reminder_log" USING "btree" ("sent_at");
CREATE INDEX "waivers_customer_id_idx" ON "public"."waivers" USING "btree" ("customer_id");
CREATE INDEX "waivers_order_reference_idx" ON "public"."waivers" USING "btree" ("order_reference");
CREATE OR REPLACE TRIGGER "accommodation_aliases_updated_at" BEFORE UPDATE ON "public"."accommodation_aliases" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "inspection_items_updated_at" BEFORE UPDATE ON "public"."inspection_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "inspections_updated_at" BEFORE UPDATE ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "paw_card_entries_assign_paw_reference" BEFORE INSERT ON "public"."paw_card_entries" FOR EACH ROW EXECUTE FUNCTION "public"."paw_card_assign_paw_reference"();
CREATE OR REPLACE TRIGGER "set_maya_checkouts_updated_at" BEFORE UPDATE ON "public"."maya_checkouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."budget_lines" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."budget_periods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."fleet" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."merchandise" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."orders_raw" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."stores" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."transfers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "waivers_updated_at" BEFORE UPDATE ON "public"."waivers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
ALTER TABLE ONLY "public"."accommodation_partners"
    ADD CONSTRAINT "accommodation_partners_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."addons"
    ADD CONSTRAINT "addons_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_vehicle_model_id_fkey" FOREIGN KEY ("vehicle_model_id") REFERENCES "public"."vehicle_models"("id");
ALTER TABLE ONLY "public"."booking_sessions"
    ADD CONSTRAINT "booking_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."budget_lines"
    ADD CONSTRAINT "budget_lines_budget_period_id_fkey" FOREIGN KEY ("budget_period_id") REFERENCES "public"."budget_periods"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."budget_lines"
    ADD CONSTRAINT "budget_lines_coa_account_id_fkey" FOREIGN KEY ("coa_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."budget_lines"
    ADD CONSTRAINT "budget_lines_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_categories"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."budget_periods"
    ADD CONSTRAINT "budget_periods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."budget_periods"
    ADD CONSTRAINT "budget_periods_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."card_settlements"
    ADD CONSTRAINT "card_settlements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."card_settlements"
    ADD CONSTRAINT "card_settlements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");
ALTER TABLE ONLY "public"."card_settlements"
    ADD CONSTRAINT "card_settlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
ALTER TABLE ONLY "public"."card_settlements"
    ADD CONSTRAINT "card_settlements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."cash_advance_schedules"
    ADD CONSTRAINT "cash_advance_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."cash_reconciliation"
    ADD CONSTRAINT "cash_reconciliation_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."cash_reconciliation"
    ADD CONSTRAINT "cash_reconciliation_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."cash_reconciliation"
    ADD CONSTRAINT "cash_reconciliation_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."delivery_reminder_log"
    ADD CONSTRAINT "delivery_reminder_log_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."employee_stores"
    ADD CONSTRAINT "employee_stores_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."employee_stores"
    ADD CONSTRAINT "employee_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "public"."maintenance"("id");
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_paid_from_fkey" FOREIGN KEY ("paid_from") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."fleet_accounting_config"
    ADD CONSTRAINT "fleet_accounting_config_acc_depreciation_account_id_fkey" FOREIGN KEY ("acc_depreciation_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."fleet_accounting_config"
    ADD CONSTRAINT "fleet_accounting_config_depreciation_expense_account_id_fkey" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."fleet_accounting_config"
    ADD CONSTRAINT "fleet_accounting_config_fixed_asset_account_id_fkey" FOREIGN KEY ("fixed_asset_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."fleet_accounting_config"
    ADD CONSTRAINT "fleet_accounting_config_gain_loss_account_id_fkey" FOREIGN KEY ("gain_loss_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."fleet_accounting_config"
    ADD CONSTRAINT "fleet_accounting_config_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."fleet"
    ADD CONSTRAINT "fleet_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id");
ALTER TABLE ONLY "public"."fleet"
    ADD CONSTRAINT "fleet_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."helmet_swaps"
    ADD CONSTRAINT "helmet_swaps_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."helmet_swaps"
    ADD CONSTRAINT "helmet_swaps_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."helmet_swaps"
    ADD CONSTRAINT "helmet_swaps_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");
ALTER TABLE ONLY "public"."helmet_swaps"
    ADD CONSTRAINT "helmet_swaps_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."inspection_items"
    ADD CONSTRAINT "inspection_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."inspection_results"
    ADD CONSTRAINT "inspection_results_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."inspection_results"
    ADD CONSTRAINT "inspection_results_inspection_item_id_fkey" FOREIGN KEY ("inspection_item_id") REFERENCES "public"."inspection_items"("id");
ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");
ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."late_return_assignments"
    ADD CONSTRAINT "late_return_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."leave_config"
    ADD CONSTRAINT "leave_config_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."leave_reset_log"
    ADD CONSTRAINT "leave_reset_log_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."lost_opportunity"
    ADD CONSTRAINT "lost_opportunity_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."maintenance"
    ADD CONSTRAINT "maintenance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."maintenance"
    ADD CONSTRAINT "maintenance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."maintenance"
    ADD CONSTRAINT "maintenance_paid_from_fkey" FOREIGN KEY ("paid_from") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."maintenance"
    ADD CONSTRAINT "maintenance_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."maya_checkouts"
    ADD CONSTRAINT "maya_checkouts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."maya_checkouts"
    ADD CONSTRAINT "maya_checkouts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."maya_checkouts"
    ADD CONSTRAINT "maya_checkouts_raw_order_id_fkey" FOREIGN KEY ("raw_order_id") REFERENCES "public"."orders_raw"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."maya_checkouts"
    ADD CONSTRAINT "maya_checkouts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."merchandise"
    ADD CONSTRAINT "merchandise_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."misc_sales"
    ADD CONSTRAINT "misc_sales_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."misc_sales"
    ADD CONSTRAINT "misc_sales_income_account_id_fkey" FOREIGN KEY ("income_account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."misc_sales"
    ADD CONSTRAINT "misc_sales_received_into_fkey" FOREIGN KEY ("received_into") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."misc_sales"
    ADD CONSTRAINT "misc_sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."order_addons"
    ADD CONSTRAINT "order_addons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");
ALTER TABLE ONLY "public"."order_addons"
    ADD CONSTRAINT "order_addons_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."order_addons"
    ADD CONSTRAINT "order_addons_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."order_addons"
    ADD CONSTRAINT "order_addons_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");
ALTER TABLE ONLY "public"."order_addons"
    ADD CONSTRAINT "order_addons_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_vehicle_model_id_fkey" FOREIGN KEY ("vehicle_model_id") REFERENCES "public"."vehicle_models"("id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."orders_raw"
    ADD CONSTRAINT "orders_raw_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."partner_enrollment_details"
    ADD CONSTRAINT "partner_enrollment_details_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."accommodation_partners"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payment_routing_rules"
    ADD CONSTRAINT "payment_routing_rules_card_settlement_account_id_fkey" FOREIGN KEY ("card_settlement_account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."payment_routing_rules"
    ADD CONSTRAINT "payment_routing_rules_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id");
ALTER TABLE ONLY "public"."payment_routing_rules"
    ADD CONSTRAINT "payment_routing_rules_received_into_account_id_fkey" FOREIGN KEY ("received_into_account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."payment_routing_rules"
    ADD CONSTRAINT "payment_routing_rules_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_addon_id_fkey" FOREIGN KEY ("order_addon_id") REFERENCES "public"."order_addons"("id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_raw_order_id_fkey" FOREIGN KEY ("raw_order_id") REFERENCES "public"."orders_raw"("id");
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."post_rental_email_log"
    ADD CONSTRAINT "post_rental_email_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
ALTER TABLE ONLY "public"."recurring_bills"
    ADD CONSTRAINT "recurring_bills_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."recurring_bills"
    ADD CONSTRAINT "recurring_bills_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_card_fee_account_id_fkey" FOREIGN KEY ("card_fee_account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_default_cash_account_id_fkey" FOREIGN KEY ("default_cash_account_id") REFERENCES "public"."chart_of_accounts"("id");
ALTER TABLE ONLY "public"."task_events"
    ADD CONSTRAINT "task_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."task_events"
    ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."todo_tasks"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."task_notifications"
    ADD CONSTRAINT "task_notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."task_notifications"
    ADD CONSTRAINT "task_notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."todo_tasks"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timesheet_amendment_logs"
    ADD CONSTRAINT "timesheet_amendment_logs_amended_by_fkey" FOREIGN KEY ("amended_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."timesheet_amendment_logs"
    ADD CONSTRAINT "timesheet_amendment_logs_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timesheets"
    ADD CONSTRAINT "timesheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."timesheets"
    ADD CONSTRAINT "timesheets_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."todo_comments"
    ADD CONSTRAINT "todo_comments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."todo_comments"
    ADD CONSTRAINT "todo_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."todo_tasks"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."todo_tasks"
    ADD CONSTRAINT "todo_tasks_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."todo_tasks"
    ADD CONSTRAINT "todo_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."todo_tasks"
    ADD CONSTRAINT "todo_tasks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."task_categories"("id");
ALTER TABLE ONLY "public"."todo_tasks"
    ADD CONSTRAINT "todo_tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."todo_tasks"
    ADD CONSTRAINT "todo_tasks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."todo_tasks"
    ADD CONSTRAINT "todo_tasks_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."transfer_routes"
    ADD CONSTRAINT "transfer_routes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."ui_errors"
    ADD CONSTRAINT "ui_errors_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");
ALTER TABLE ONLY "public"."vehicle_model_pricing"
    ADD CONSTRAINT "vehicle_model_pricing_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id");
ALTER TABLE ONLY "public"."vehicle_model_pricing"
    ADD CONSTRAINT "vehicle_model_pricing_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."vehicle_swaps"
    ADD CONSTRAINT "vehicle_swaps_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");
ALTER TABLE ONLY "public"."vehicle_swaps"
    ADD CONSTRAINT "vehicle_swaps_new_vehicle_id_fkey" FOREIGN KEY ("new_vehicle_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."vehicle_swaps"
    ADD CONSTRAINT "vehicle_swaps_old_vehicle_id_fkey" FOREIGN KEY ("old_vehicle_id") REFERENCES "public"."fleet"("id");
ALTER TABLE ONLY "public"."vehicle_swaps"
    ADD CONSTRAINT "vehicle_swaps_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
ALTER TABLE ONLY "public"."vehicle_swaps"
    ADD CONSTRAINT "vehicle_swaps_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");
ALTER TABLE ONLY "public"."vehicle_swaps"
    ADD CONSTRAINT "vehicle_swaps_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
ALTER TABLE ONLY "public"."waiver_reminder_log"
    ADD CONSTRAINT "waiver_reminder_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
ALTER TABLE ONLY "public"."waivers"
    ADD CONSTRAINT "waivers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");
ALTER TABLE ONLY "public"."waivers"
    ADD CONSTRAINT "waivers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");
CREATE POLICY "Authenticated users can read fleet accounting config" ON "public"."fleet_accounting_config" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Authenticated users can upsert fleet accounting config" ON "public"."fleet_accounting_config" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON "public"."maya_checkouts" TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Staff manage employee stores" ON "public"."employee_stores" USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "Staff read own store payroll runs" ON "public"."payroll_runs" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."accommodation_aliases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accommodation_aliases_read" ON "public"."accommodation_aliases" FOR SELECT USING ("public"."has_permission"('can_view_dashboard'::"text"));
CREATE POLICY "accommodation_aliases_write" ON "public"."accommodation_aliases" USING ("public"."has_permission"('can_edit_settings'::"text"));
ALTER TABLE "public"."accommodation_partners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accommodation_partners_modify" ON "public"."accommodation_partners" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_settings'::"text")));
CREATE POLICY "accommodation_partners_public_enroll" ON "public"."accommodation_partners" FOR INSERT TO "anon" WITH CHECK (("status" = 'pending'::"text"));
CREATE POLICY "accommodation_partners_public_select" ON "public"."accommodation_partners" FOR SELECT TO "anon" USING ((("status" = 'active'::"text") AND ("active" = true)));
CREATE POLICY "accommodation_partners_select" ON "public"."accommodation_partners" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."addons" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons_select" ON "public"."addons" FOR SELECT USING (true);
CREATE POLICY "amendment_logs_insert" ON "public"."timesheet_amendment_logs" FOR INSERT WITH CHECK ("public"."has_permission"('can_edit_timesheets'::"text"));
CREATE POLICY "amendment_logs_select" ON "public"."timesheet_amendment_logs" FOR SELECT USING ("public"."has_permission"('can_view_timesheets'::"text"));
CREATE POLICY "authenticated can read pickup rules" ON "public"."transfer_pickup_rules" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "bills_modify" ON "public"."recurring_bills" USING ("public"."has_permission"('can_edit_accounts'::"text"));
CREATE POLICY "bills_select" ON "public"."recurring_bills" FOR SELECT USING (true);
ALTER TABLE "public"."booking_holds" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "booking_holds_delete" ON "public"."booking_holds" FOR DELETE USING (true);
CREATE POLICY "booking_holds_insert" ON "public"."booking_holds" FOR INSERT WITH CHECK (true);
CREATE POLICY "booking_holds_select" ON "public"."booking_holds" FOR SELECT USING ((("auth"."role"() = 'anon'::"text") OR ("store_id" = ANY ("public"."user_store_ids"()))));
ALTER TABLE "public"."booking_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "booking_sessions_select" ON "public"."booking_sessions" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."budget_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_lines_modify" ON "public"."budget_lines" USING ("public"."has_permission"('can_edit_settings'::"text"));
CREATE POLICY "budget_lines_select" ON "public"."budget_lines" FOR SELECT USING ("public"."has_permission"('can_view_accounts'::"text"));
ALTER TABLE "public"."budget_periods" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_periods_modify" ON "public"."budget_periods" USING ("public"."has_permission"('can_edit_settings'::"text"));
CREATE POLICY "budget_periods_select" ON "public"."budget_periods" FOR SELECT USING ("public"."has_permission"('can_view_accounts'::"text"));
ALTER TABLE "public"."card_settlements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cardsettl_modify" ON "public"."card_settlements" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_cardsettlements'::"text")));
CREATE POLICY "cardsettl_select" ON "public"."card_settlements" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "cas_modify" ON "public"."cash_advance_schedules" USING ("public"."has_permission"('can_approve_timesheets'::"text"));
CREATE POLICY "cas_select" ON "public"."cash_advance_schedules" FOR SELECT USING (true);
ALTER TABLE "public"."cash_advance_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cash_reconciliation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cashrecon_modify" ON "public"."cash_reconciliation" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_cashup'::"text")));
CREATE POLICY "cashrecon_select" ON "public"."cash_reconciliation" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_sessions_service_insert" ON "public"."chat_sessions" FOR INSERT TO "service_role" WITH CHECK (true);
CREATE POLICY "chat_sessions_service_update" ON "public"."chat_sessions" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "chat_sessions_staff_select" ON "public"."chat_sessions" FOR SELECT TO "authenticated" USING ("public"."has_permission"('can_view_dashboard'::"text"));
CREATE POLICY "coa_modify" ON "public"."chart_of_accounts" USING ("public"."has_permission"('can_edit_accounts'::"text"));
CREATE POLICY "coa_select" ON "public"."chart_of_accounts" FOR SELECT USING (true);
ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_modify" ON "public"."customers" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_orders'::"text")));
CREATE POLICY "customers_select" ON "public"."customers" FOR SELECT USING ((("store_id" = ANY ("public"."user_store_ids"())) OR ("store_id" IS NULL)));
CREATE POLICY "customers_select_own_email_for_paw_card" ON "public"."customers" FOR SELECT TO "authenticated" USING ((("email" IS NOT NULL) AND ("lower"(TRIM(BOTH FROM "email")) = "lower"(TRIM(BOTH FROM COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text"))))));
ALTER TABLE "public"."day_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."delivery_reminder_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dir_modify" ON "public"."directory" USING ("public"."has_permission"('can_edit_settings'::"text"));
CREATE POLICY "dir_select" ON "public"."directory" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));
ALTER TABLE "public"."directory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dt_select" ON "public"."day_types" FOR SELECT USING (true);
CREATE POLICY "ec_select" ON "public"."expense_categories" FOR SELECT USING (true);
ALTER TABLE "public"."employee_stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_modify" ON "public"."employees" USING ("public"."has_permission"('can_approve_timesheets'::"text"));
CREATE POLICY "employees_select" ON "public"."employees" FOR SELECT USING ((("store_id" = ANY ("public"."user_store_ids"())) OR ("store_id" IS NULL)));
CREATE POLICY "exp_modify" ON "public"."expenses" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_expenses'::"text")));
CREATE POLICY "exp_select" ON "public"."expenses" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fleet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fleet_accounting_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_modify" ON "public"."fleet" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_fleet'::"text")));
CREATE POLICY "fleet_select" ON "public"."fleet" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."fleet_statuses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fs_select" ON "public"."fleet_statuses" FOR SELECT USING (true);
ALTER TABLE "public"."helmet_swaps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "helmet_swaps_modify" ON "public"."helmet_swaps" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_orders'::"text")));
CREATE POLICY "helmet_swaps_select" ON "public"."helmet_swaps" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."inspection_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspection_items_read" ON "public"."inspection_items" FOR SELECT USING ((("store_id" IS NULL) OR ("store_id" = ANY ("public"."user_store_ids"()))));
CREATE POLICY "inspection_items_write" ON "public"."inspection_items" USING ("public"."has_permission"('can_edit_settings'::"text"));
ALTER TABLE "public"."inspection_results" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspection_results_read" ON "public"."inspection_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_results"."inspection_id") AND ("i"."store_id" = ANY ("public"."user_store_ids"()))))));
CREATE POLICY "inspection_results_write" ON "public"."inspection_results" USING ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_results"."inspection_id") AND ("i"."store_id" = ANY ("public"."user_store_ids"()))))));
ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspections_read" ON "public"."inspections" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "inspections_write" ON "public"."inspections" USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "je_modify" ON "public"."journal_entries" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_accounts'::"text")));
CREATE POLICY "je_select" ON "public"."journal_entries" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."late_return_assignments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "late_return_assignments_modify" ON "public"."late_return_assignments" USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "late_return_assignments_select" ON "public"."late_return_assignments" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "lc_modify" ON "public"."leave_config" USING ("public"."has_permission"('can_edit_accounts'::"text"));
CREATE POLICY "lc_select" ON "public"."leave_config" FOR SELECT USING (true);
ALTER TABLE "public"."leave_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leave_reset_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leave_reset_log_select" ON "public"."leave_reset_log" FOR SELECT USING (true);
ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_select" ON "public"."locations" FOR SELECT USING (true);
CREATE POLICY "lost_modify" ON "public"."lost_opportunity" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_lostopportunity'::"text")));
ALTER TABLE "public"."lost_opportunity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lost_select" ON "public"."lost_opportunity" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "maint_modify" ON "public"."maintenance" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_maintenance'::"text")));
CREATE POLICY "maint_select" ON "public"."maintenance" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."maintenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."maintenance_work_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."maya_checkouts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merch_modify" ON "public"."merchandise" USING ("public"."has_permission"('can_edit_settings'::"text"));
CREATE POLICY "merch_select" ON "public"."merchandise" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));
ALTER TABLE "public"."merchandise" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "misc_modify" ON "public"."misc_sales" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_miscsales'::"text")));
ALTER TABLE "public"."misc_sales" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "misc_select" ON "public"."misc_sales" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "mwt_select" ON "public"."maintenance_work_types" FOR SELECT USING (true);
ALTER TABLE "public"."nine_pm_reminder_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_addons" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_addons_modify" ON "public"."order_addons" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_orders'::"text")));
CREATE POLICY "order_addons_select" ON "public"."order_addons" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_modify" ON "public"."order_items" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_orders'::"text")));
CREATE POLICY "order_items_select" ON "public"."order_items" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_modify" ON "public"."orders" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_orders'::"text")));
ALTER TABLE "public"."orders_raw" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_raw_insert" ON "public"."orders_raw" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));
CREATE POLICY "orders_raw_select" ON "public"."orders_raw" FOR SELECT USING ("public"."has_permission"('can_view_accounts'::"text"));
CREATE POLICY "orders_select" ON "public"."orders" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "orders_select_own_customer_for_paw_card" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("customer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "orders"."customer_id") AND ("c"."email" IS NOT NULL) AND ("lower"(TRIM(BOTH FROM "c"."email")) = "lower"(TRIM(BOTH FROM COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))))))));
ALTER TABLE "public"."partner_enrollment_details" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_enrollment_details_public_insert" ON "public"."partner_enrollment_details" FOR INSERT TO "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."accommodation_partners" "ap"
  WHERE (("ap"."id" = "partner_enrollment_details"."partner_id") AND ("ap"."status" = 'pending'::"text")))));
CREATE POLICY "partner_enrollment_details_staff" ON "public"."partner_enrollment_details" USING ((EXISTS ( SELECT 1
   FROM "public"."accommodation_partners" "ap"
  WHERE (("ap"."id" = "partner_enrollment_details"."partner_id") AND ("ap"."store_id" = ANY ("public"."user_store_ids"()))))));
ALTER TABLE "public"."paw_card_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."paw_card_establishments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paw_card_establishments_select_anon" ON "public"."paw_card_establishments" FOR SELECT TO "anon" USING (("is_active" = true));
CREATE POLICY "pawcard_est_modify" ON "public"."paw_card_establishments" USING ("public"."has_permission"('can_edit_settings'::"text"));
CREATE POLICY "pawcard_est_select" ON "public"."paw_card_establishments" FOR SELECT USING (true);
CREATE POLICY "pawcard_insert" ON "public"."paw_card_entries" FOR INSERT WITH CHECK (true);
CREATE POLICY "pawcard_modify" ON "public"."paw_card_entries" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "pawcard_select" ON "public"."paw_card_entries" FOR SELECT USING (true);
ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_routing_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_routing_rules_modify" ON "public"."payment_routing_rules" USING ("public"."has_permission"('can_edit_settings'::"text"));
CREATE POLICY "payment_routing_rules_select" ON "public"."payment_routing_rules" FOR SELECT USING ("public"."has_permission"('can_edit_settings'::"text"));
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_modify" ON "public"."payments" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_orders'::"text")));
CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."payroll_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm_select" ON "public"."payment_methods" FOR SELECT USING (true);
ALTER TABLE "public"."post_rental_email_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_rental_log_all" ON "public"."post_rental_email_log" USING (("auth"."role"() = 'authenticated'::"text"));
ALTER TABLE "public"."post_rental_review_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recurring_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."repair_costs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repair_costs_modify" ON "public"."repair_costs" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "repair_costs_select" ON "public"."repair_costs" FOR SELECT USING (true);
ALTER TABLE "public"."return_reminder_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_modify" ON "public"."reviews" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "reviews_public_read" ON "public"."reviews" FOR SELECT USING (("is_active" = true));
CREATE POLICY "reviews_select" ON "public"."reviews" FOR SELECT USING (true);
ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select" ON "public"."roles" FOR SELECT USING (true);
CREATE POLICY "rp_select" ON "public"."role_permissions" FOR SELECT USING (true);
ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_modify" ON "public"."stores" USING ("public"."has_permission"('can_edit_accounts'::"text"));
CREATE POLICY "stores_select" ON "public"."stores" FOR SELECT USING (true);
ALTER TABLE "public"."task_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_categories_modify" ON "public"."task_categories" USING ("public"."has_permission"('can_edit_settings'::"text"));
CREATE POLICY "task_categories_select" ON "public"."task_categories" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));
ALTER TABLE "public"."task_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_events_select" ON "public"."task_events" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));
ALTER TABLE "public"."task_notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_notifications_select" ON "public"."task_notifications" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));
ALTER TABLE "public"."timesheet_amendment_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."timesheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."todo_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todo_modify" ON "public"."todo_tasks" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_todo'::"text")));
CREATE POLICY "todo_select" ON "public"."todo_tasks" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."todo_tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todocomm_insert" ON "public"."todo_comments" FOR INSERT WITH CHECK ("public"."has_permission"('can_view_todo'::"text"));
CREATE POLICY "todocomm_select" ON "public"."todo_comments" FOR SELECT USING (true);
CREATE POLICY "tr_select" ON "public"."transfer_routes" FOR SELECT USING (true);
ALTER TABLE "public"."transfer_pickup_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transfer_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transfers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ts_edit" ON "public"."timesheets" FOR UPDATE USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_timesheets'::"text") AND ("payroll_status" = 'Pending'::"text"))) WITH CHECK ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_timesheets'::"text") AND ("payroll_status" = 'Pending'::"text")));
CREATE POLICY "ts_modify" ON "public"."timesheets" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_submit_timesheets'::"text")));
CREATE POLICY "ts_select" ON "public"."timesheets" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER TABLE "public"."ui_errors" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uierrors_insert" ON "public"."ui_errors" FOR INSERT WITH CHECK ("public"."has_permission"('can_view_uierrors'::"text"));
CREATE POLICY "uierrors_select" ON "public"."ui_errors" FOR SELECT USING (true);
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_all" ON "public"."users" USING ("public"."has_permission"('can_edit_accounts'::"text"));
ALTER TABLE "public"."vehicle_model_pricing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicle_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicle_swaps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_swaps_modify" ON "public"."vehicle_swaps" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_edit_orders'::"text")));
CREATE POLICY "vehicle_swaps_select" ON "public"."vehicle_swaps" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "vm_select" ON "public"."vehicle_models" FOR SELECT USING (true);
CREATE POLICY "vmp_select" ON "public"."vehicle_model_pricing" FOR SELECT USING (true);
ALTER TABLE "public"."waiver_reminder_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waiver_reminder_log_all" ON "public"."waiver_reminder_log" USING (("auth"."role"() = 'authenticated'::"text"));
ALTER TABLE "public"."waivers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waivers_public_insert" ON "public"."waivers" FOR INSERT WITH CHECK (true);
CREATE POLICY "waivers_staff_read" ON "public"."waivers" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "waivers_staff_select" ON "public"."waivers" FOR SELECT USING ("public"."has_permission"('can_view_accounts'::"text"));
CREATE POLICY "waivers_staff_update" ON "public"."waivers" FOR UPDATE USING (("store_id" = ANY ("public"."user_store_ids"())));
CREATE POLICY "xfer_modify" ON "public"."transfers" USING ((("store_id" = ANY ("public"."user_store_ids"())) AND "public"."has_permission"('can_view_transfers'::"text")));
CREATE POLICY "xfer_select" ON "public"."transfers" FOR SELECT USING (("store_id" = ANY ("public"."user_store_ids"())));
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."task_categories";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."task_events";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."task_notifications";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."activate_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_woo_order_id" "text", "p_customer_id" "text", "p_employee_id" "text", "p_order_date" "date", "p_status" "text", "p_web_notes" "text", "p_quantity" integer, "p_web_quote_raw" numeric, "p_security_deposit" numeric, "p_deposit_status" "text", "p_card_fee_surcharge" numeric, "p_return_charges" numeric, "p_final_total" numeric, "p_balance_due" numeric, "p_payment_method_id" "text", "p_deposit_method_id" "text", "p_booking_token" "text", "p_tips" numeric, "p_charity_donation" numeric, "p_updated_at" timestamp with time zone, "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_journal_legs" "jsonb", "p_rental_payment_id" "text", "p_rental_amount" numeric, "p_transaction_date" "date", "p_deposit_payment_id" "text", "p_deposit_amount" numeric, "p_deposit_collected" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."assert_balanced_legs"("p_legs" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."cancel_order_raw_atomic"("p_order_id" "text", "p_cancelled_at" timestamp with time zone, "p_cancelled_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."cascade_customer_contact_update"("p_customer_id" "text", "p_new_name" "text", "p_new_email" "text", "p_new_mobile" "text", "p_new_notes" "text", "p_new_blacklisted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_customer_contact_update"("p_customer_id" "text", "p_new_name" "text", "p_new_email" "text", "p_new_mobile" "text", "p_new_notes" "text", "p_new_blacklisted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_customer_contact_update"("p_customer_id" "text", "p_new_name" "text", "p_new_email" "text", "p_new_mobile" "text", "p_new_notes" "text", "p_new_blacklisted" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_bookings_by_email_or_test"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_bookings_by_email_or_test"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_bookings_by_email_or_test"("p_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_test_customer_orders"("p_customer_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_test_customer_orders"("p_customer_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_test_customer_orders"("p_customer_name" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."clear_cash_advance"("p_employee_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_cash_advance"("p_employee_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."collect_payment_atomic"("p_payment_id" "text", "p_order_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_account_id" "text", "p_transaction_date" "date", "p_customer_id" "text", "p_payment_type" "text", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_notes" "text", "p_absorbed_extension_iou_ids" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."confirm_extend_order_atomic"("p_order_id" "text", "p_order_item_id" "text", "p_new_dropoff" timestamp with time zone, "p_new_days" integer, "p_addon_updates" "jsonb", "p_total_delta" numeric, "p_payment_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_transaction_date" "date", "p_settlement_status" "text", "p_settlement_ref" "text", "p_customer_id" "text", "p_order_item_id_fk" "text", "p_is_paid" boolean, "p_receivable_acct" "text", "p_income_acct" "text", "p_journal_tx_id" "text", "p_journal_date" "date", "p_journal_period" "text", "p_ext_description" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."confirm_extend_raw_atomic"("p_order_id" "text", "p_new_dropoff" timestamp with time zone, "p_payment_id" "text", "p_store_id" "text", "p_amount" numeric, "p_payment_method_id" "text", "p_transaction_date" "date", "p_settlement_status" "text", "p_settlement_ref" "text", "p_raw_order_id" "text", "p_is_paid" boolean, "p_receivable_acct" "text", "p_income_acct" "text", "p_journal_tx_id" "text", "p_journal_date" "date", "p_journal_period" "text", "p_ext_description" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_expense_with_journal"("p_expense_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_account_id" "text", "p_status" "text", "p_transaction_id" "text", "p_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_created_by" "text", "p_legs" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_expense_with_journal"("p_expense_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_account_id" "text", "p_status" "text", "p_transaction_id" "text", "p_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_created_by" "text", "p_legs" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_expense_with_journal"("p_expense_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_account_id" "text", "p_status" "text", "p_transaction_id" "text", "p_period" "text", "p_journal_date" "date", "p_journal_store_id" "text", "p_created_by" "text", "p_legs" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_maintenance_expense"("p_expense_id" "text", "p_maintenance_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_maintenance_expense"("p_expense_id" "text", "p_maintenance_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_maintenance_expense"("p_expense_id" "text", "p_maintenance_id" "text", "p_store_id" "text", "p_date" "date", "p_category" "text", "p_description" "text", "p_amount" numeric, "p_paid_from" "text", "p_vehicle_id" "text", "p_employee_id" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_expense_with_journal"("p_expense_id" "text", "p_reference_type" "text", "p_reference_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_expense_with_journal"("p_expense_id" "text", "p_reference_type" "text", "p_reference_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_expense_with_journal"("p_expense_id" "text", "p_reference_type" "text", "p_reference_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_maintenance_expense"("p_maintenance_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_maintenance_expense"("p_maintenance_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_maintenance_expense"("p_maintenance_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_transfer_summary"("p_store_id" "text", "p_date_from" "date", "p_date_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_transfer_summary"("p_store_id" "text", "p_date_from" "date", "p_date_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transfer_summary"("p_store_id" "text", "p_date_from" "date", "p_date_to" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_permission"("required" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("required" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("required" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."increment_booking_interaction"("p_session_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_booking_interaction"("p_session_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_booking_interaction"("p_session_token" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."increment_cash_advance"("p_employee_id" "text", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_cash_advance"("p_employee_id" "text", "p_amount" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."match_card_settlement"("p_transaction_id" "text", "p_period" "text", "p_date" "date", "p_store_id" "text", "p_legs" "jsonb", "p_settlement_ids" "text"[], "p_is_paid" boolean, "p_date_settled" "date", "p_settlement_ref" "text", "p_net_amount" numeric, "p_fee_expense" numeric, "p_account_id" "text", "p_payment_ids" "text"[], "p_settlement_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."match_card_settlement"("p_transaction_id" "text", "p_period" "text", "p_date" "date", "p_store_id" "text", "p_legs" "jsonb", "p_settlement_ids" "text"[], "p_is_paid" boolean, "p_date_settled" "date", "p_settlement_ref" "text", "p_net_amount" numeric, "p_fee_expense" numeric, "p_account_id" "text", "p_payment_ids" "text"[], "p_settlement_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_card_settlement"("p_transaction_id" "text", "p_period" "text", "p_date" "date", "p_store_id" "text", "p_legs" "jsonb", "p_settlement_ids" "text"[], "p_is_paid" boolean, "p_date_settled" "date", "p_settlement_ref" "text", "p_net_amount" numeric, "p_fee_expense" numeric, "p_account_id" "text", "p_payment_ids" "text"[], "p_settlement_status" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."paw_card_assign_paw_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."paw_card_assign_paw_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."paw_card_assign_paw_reference"() TO "service_role";
GRANT ALL ON FUNCTION "public"."pay_expenses_atomic"("p_expense_ids" "text"[], "p_paid_at" timestamp with time zone, "p_paid_from" "text", "p_legs" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_expenses_atomic"("p_expense_ids" "text"[], "p_paid_at" timestamp with time zone, "p_paid_from" "text", "p_legs" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_expenses_atomic"("p_expense_ids" "text"[], "p_paid_at" timestamp with time zone, "p_paid_from" "text", "p_legs" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."post_batch_depreciation"("p_vehicle_records" "jsonb", "p_journal_entry_date" "date", "p_store_id" "text", "p_period" "text", "p_depreciation_expense_account_id" "text", "p_acc_depreciation_account_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."process_raw_order_atomic"("p_raw_order_id" "text", "p_order_id" "text", "p_store_id" "text", "p_customer_row" "jsonb", "p_order_row" "jsonb", "p_order_items" "jsonb", "p_order_addons" "jsonb", "p_fleet_updates" "jsonb", "p_rental_payment" "jsonb", "p_deposit_payment" "jsonb", "p_card_settlement" "jsonb", "p_transfer_row" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_settled_at" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric, "p_deposits_closing_balance" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric, "p_deposits_closing_balance" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_cash_atomic"("p_id" "text", "p_store_id" "text", "p_date" "date", "p_opening_balance" numeric, "p_expected_cash" numeric, "p_actual_counted" numeric, "p_variance" numeric, "p_variance_type" "text", "p_submitted_by" "text", "p_submitted_at" timestamp with time zone, "p_is_locked" boolean, "p_overridden_by" "text", "p_overridden_at" timestamp with time zone, "p_override_reason" "text", "p_till_counted" numeric, "p_deposits_counted" numeric, "p_till_denoms" "jsonb", "p_deposit_denoms" "jsonb", "p_till_expected" numeric, "p_deposits_expected" numeric, "p_till_variance" numeric, "p_deposit_variance" numeric, "p_closing_balance" numeric, "p_deposits_closing_balance" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."reset_test_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_test_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_test_data"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."run_payroll_atomic"("p_transactions" "jsonb", "p_timesheet_ids" "text"[], "p_status" "text", "p_store_id" "text", "p_period_start" "date", "p_period_end" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_payroll_atomic"("p_transactions" "jsonb", "p_timesheet_ids" "text"[], "p_status" "text", "p_store_id" "text", "p_period_start" "date", "p_period_end" "date", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric, "p_return_charges_delta" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric, "p_return_charges_delta" numeric, "p_return_charges_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."settle_order_atomic"("p_order_id" "text", "p_store_id" "text", "p_settled_at" timestamp with time zone, "p_final_balance_due" numeric, "p_final_payment" "jsonb", "p_card_settlement" "jsonb", "p_fleet_releases" "jsonb", "p_journal_transaction_id" "text", "p_journal_period" "text", "p_journal_date" "date", "p_journal_legs" "jsonb", "p_absorbed_extension_payment_ids" "jsonb", "p_card_fee_surcharge_delta" numeric, "p_return_charges_delta" numeric, "p_return_charges_note" "text", "p_deposit_refund_payment" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."top_paw_card_establishments"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."top_paw_card_establishments"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."top_paw_card_establishments"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_maintenance_expense"("p_expense_id" "text", "p_amount" numeric, "p_description" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_maintenance_expense"("p_expense_id" "text", "p_amount" numeric, "p_description" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_maintenance_expense"("p_expense_id" "text", "p_amount" numeric, "p_description" "text", "p_expense_account_id" "text", "p_cash_account_id" "text", "p_je_debit_id" "text", "p_je_credit_id" "text", "p_transaction_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."user_store_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_store_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_store_ids"() TO "service_role";
GRANT ALL ON TABLE "public"."accommodation_aliases" TO "anon";
GRANT ALL ON TABLE "public"."accommodation_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."accommodation_aliases" TO "service_role";
GRANT ALL ON TABLE "public"."accommodation_partners" TO "anon";
GRANT ALL ON TABLE "public"."accommodation_partners" TO "authenticated";
GRANT ALL ON TABLE "public"."accommodation_partners" TO "service_role";
GRANT ALL ON TABLE "public"."addons" TO "anon";
GRANT ALL ON TABLE "public"."addons" TO "authenticated";
GRANT ALL ON TABLE "public"."addons" TO "service_role";
GRANT ALL ON SEQUENCE "public"."addons_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."addons_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."addons_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."booking_holds" TO "anon";
GRANT ALL ON TABLE "public"."booking_holds" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_holds" TO "service_role";
GRANT ALL ON TABLE "public"."booking_sessions" TO "anon";
GRANT ALL ON TABLE "public"."booking_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."budget_lines" TO "anon";
GRANT ALL ON TABLE "public"."budget_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_lines" TO "service_role";
GRANT ALL ON TABLE "public"."budget_periods" TO "anon";
GRANT ALL ON TABLE "public"."budget_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_periods" TO "service_role";
GRANT ALL ON TABLE "public"."card_settlements" TO "anon";
GRANT ALL ON TABLE "public"."card_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."card_settlements" TO "service_role";
GRANT ALL ON SEQUENCE "public"."card_settlements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."card_settlements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."card_settlements_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."cash_advance_schedules" TO "anon";
GRANT ALL ON TABLE "public"."cash_advance_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_advance_schedules" TO "service_role";
GRANT ALL ON TABLE "public"."cash_reconciliation" TO "anon";
GRANT ALL ON TABLE "public"."cash_reconciliation" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_reconciliation" TO "service_role";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";
GRANT ALL ON TABLE "public"."day_types" TO "anon";
GRANT ALL ON TABLE "public"."day_types" TO "authenticated";
GRANT ALL ON TABLE "public"."day_types" TO "service_role";
GRANT ALL ON TABLE "public"."delivery_reminder_log" TO "anon";
GRANT ALL ON TABLE "public"."delivery_reminder_log" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_reminder_log" TO "service_role";
GRANT ALL ON TABLE "public"."directory" TO "anon";
GRANT ALL ON TABLE "public"."directory" TO "authenticated";
GRANT ALL ON TABLE "public"."directory" TO "service_role";
GRANT ALL ON SEQUENCE "public"."directory_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."directory_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."directory_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."employee_stores" TO "anon";
GRANT ALL ON TABLE "public"."employee_stores" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_stores" TO "service_role";
GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";
GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";
GRANT ALL ON SEQUENCE "public"."expense_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."expense_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."expense_categories_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";
GRANT ALL ON TABLE "public"."fleet" TO "anon";
GRANT ALL ON TABLE "public"."fleet" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet" TO "service_role";
GRANT ALL ON TABLE "public"."fleet_accounting_config" TO "anon";
GRANT ALL ON TABLE "public"."fleet_accounting_config" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_accounting_config" TO "service_role";
GRANT ALL ON TABLE "public"."fleet_statuses" TO "anon";
GRANT ALL ON TABLE "public"."fleet_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_statuses" TO "service_role";
GRANT ALL ON TABLE "public"."helmet_swaps" TO "anon";
GRANT ALL ON TABLE "public"."helmet_swaps" TO "authenticated";
GRANT ALL ON TABLE "public"."helmet_swaps" TO "service_role";
GRANT ALL ON TABLE "public"."inspection_items" TO "anon";
GRANT ALL ON TABLE "public"."inspection_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_items" TO "service_role";
GRANT ALL ON TABLE "public"."inspection_results" TO "anon";
GRANT ALL ON TABLE "public"."inspection_results" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_results" TO "service_role";
GRANT ALL ON TABLE "public"."inspections" TO "anon";
GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";
GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";
GRANT ALL ON TABLE "public"."late_return_assignments" TO "anon";
GRANT ALL ON TABLE "public"."late_return_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."late_return_assignments" TO "service_role";
GRANT ALL ON TABLE "public"."leave_config" TO "anon";
GRANT ALL ON TABLE "public"."leave_config" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_config" TO "service_role";
GRANT ALL ON SEQUENCE "public"."leave_config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."leave_config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."leave_config_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."leave_reset_log" TO "anon";
GRANT ALL ON TABLE "public"."leave_reset_log" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_reset_log" TO "service_role";
GRANT ALL ON SEQUENCE "public"."leave_reset_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."leave_reset_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."leave_reset_log_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."lost_opportunity" TO "anon";
GRANT ALL ON TABLE "public"."lost_opportunity" TO "authenticated";
GRANT ALL ON TABLE "public"."lost_opportunity" TO "service_role";
GRANT ALL ON SEQUENCE "public"."lost_opportunity_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lost_opportunity_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lost_opportunity_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."maintenance" TO "anon";
GRANT ALL ON TABLE "public"."maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance" TO "service_role";
GRANT ALL ON TABLE "public"."maintenance_work_types" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_work_types" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_work_types" TO "service_role";
GRANT ALL ON SEQUENCE "public"."maintenance_work_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."maintenance_work_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."maintenance_work_types_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."maya_checkouts" TO "anon";
GRANT ALL ON TABLE "public"."maya_checkouts" TO "authenticated";
GRANT ALL ON TABLE "public"."maya_checkouts" TO "service_role";
GRANT ALL ON TABLE "public"."merchandise" TO "anon";
GRANT ALL ON TABLE "public"."merchandise" TO "authenticated";
GRANT ALL ON TABLE "public"."merchandise" TO "service_role";
GRANT ALL ON TABLE "public"."misc_sales" TO "anon";
GRANT ALL ON TABLE "public"."misc_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."misc_sales" TO "service_role";
GRANT ALL ON TABLE "public"."nine_pm_reminder_log" TO "anon";
GRANT ALL ON TABLE "public"."nine_pm_reminder_log" TO "authenticated";
GRANT ALL ON TABLE "public"."nine_pm_reminder_log" TO "service_role";
GRANT ALL ON TABLE "public"."order_addons" TO "anon";
GRANT ALL ON TABLE "public"."order_addons" TO "authenticated";
GRANT ALL ON TABLE "public"."order_addons" TO "service_role";
GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";
GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT ALL ON TABLE "public"."orders_raw" TO "anon";
GRANT ALL ON TABLE "public"."orders_raw" TO "authenticated";
GRANT ALL ON TABLE "public"."orders_raw" TO "service_role";
GRANT ALL ON TABLE "public"."partner_booking_attribution" TO "anon";
GRANT ALL ON TABLE "public"."partner_booking_attribution" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_booking_attribution" TO "service_role";
GRANT ALL ON TABLE "public"."partner_enrollment_details" TO "anon";
GRANT ALL ON TABLE "public"."partner_enrollment_details" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_enrollment_details" TO "service_role";
GRANT ALL ON TABLE "public"."paw_card_entries" TO "anon";
GRANT ALL ON TABLE "public"."paw_card_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."paw_card_entries" TO "service_role";
GRANT ALL ON SEQUENCE "public"."paw_card_entries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."paw_card_entries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."paw_card_entries_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."paw_card_establishments" TO "anon";
GRANT ALL ON TABLE "public"."paw_card_establishments" TO "authenticated";
GRANT ALL ON TABLE "public"."paw_card_establishments" TO "service_role";
GRANT ALL ON SEQUENCE "public"."paw_card_establishments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."paw_card_establishments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."paw_card_establishments_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";
GRANT ALL ON TABLE "public"."payment_routing_rules" TO "anon";
GRANT ALL ON TABLE "public"."payment_routing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_routing_rules" TO "service_role";
GRANT ALL ON SEQUENCE "public"."payment_routing_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payment_routing_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payment_routing_rules_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT ALL ON TABLE "public"."payroll_runs" TO "anon";
GRANT ALL ON TABLE "public"."payroll_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_runs" TO "service_role";
GRANT ALL ON TABLE "public"."post_rental_email_log" TO "anon";
GRANT ALL ON TABLE "public"."post_rental_email_log" TO "authenticated";
GRANT ALL ON TABLE "public"."post_rental_email_log" TO "service_role";
GRANT ALL ON TABLE "public"."post_rental_review_log" TO "anon";
GRANT ALL ON TABLE "public"."post_rental_review_log" TO "authenticated";
GRANT ALL ON TABLE "public"."post_rental_review_log" TO "service_role";
GRANT ALL ON TABLE "public"."recurring_bills" TO "anon";
GRANT ALL ON TABLE "public"."recurring_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_bills" TO "service_role";
GRANT ALL ON SEQUENCE "public"."recurring_bills_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recurring_bills_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recurring_bills_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."repair_costs" TO "anon";
GRANT ALL ON TABLE "public"."repair_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."repair_costs" TO "service_role";
GRANT ALL ON TABLE "public"."return_reminder_log" TO "anon";
GRANT ALL ON TABLE "public"."return_reminder_log" TO "authenticated";
GRANT ALL ON TABLE "public"."return_reminder_log" TO "service_role";
GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";
GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";
GRANT ALL ON TABLE "public"."stores" TO "anon";
GRANT ALL ON TABLE "public"."stores" TO "authenticated";
GRANT ALL ON TABLE "public"."stores" TO "service_role";
GRANT ALL ON TABLE "public"."task_categories" TO "anon";
GRANT ALL ON TABLE "public"."task_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."task_categories" TO "service_role";
GRANT ALL ON SEQUENCE "public"."task_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."task_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."task_categories_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."task_events" TO "anon";
GRANT ALL ON TABLE "public"."task_events" TO "authenticated";
GRANT ALL ON TABLE "public"."task_events" TO "service_role";
GRANT ALL ON TABLE "public"."task_notifications" TO "anon";
GRANT ALL ON TABLE "public"."task_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."task_notifications" TO "service_role";
GRANT ALL ON TABLE "public"."timesheet_amendment_logs" TO "anon";
GRANT ALL ON TABLE "public"."timesheet_amendment_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."timesheet_amendment_logs" TO "service_role";
GRANT ALL ON TABLE "public"."timesheets" TO "anon";
GRANT ALL ON TABLE "public"."timesheets" TO "authenticated";
GRANT ALL ON TABLE "public"."timesheets" TO "service_role";
GRANT ALL ON TABLE "public"."todo_comments" TO "anon";
GRANT ALL ON TABLE "public"."todo_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_comments" TO "service_role";
GRANT ALL ON TABLE "public"."todo_tasks" TO "anon";
GRANT ALL ON TABLE "public"."todo_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_tasks" TO "service_role";
GRANT ALL ON TABLE "public"."transfer_pickup_rules" TO "anon";
GRANT ALL ON TABLE "public"."transfer_pickup_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."transfer_pickup_rules" TO "service_role";
GRANT ALL ON SEQUENCE "public"."transfer_pickup_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transfer_pickup_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transfer_pickup_rules_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."transfer_routes" TO "anon";
GRANT ALL ON TABLE "public"."transfer_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."transfer_routes" TO "service_role";
GRANT ALL ON SEQUENCE "public"."transfer_routes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transfer_routes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transfer_routes_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."transfers" TO "anon";
GRANT ALL ON TABLE "public"."transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."transfers" TO "service_role";
GRANT ALL ON TABLE "public"."ui_errors" TO "anon";
GRANT ALL ON TABLE "public"."ui_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."ui_errors" TO "service_role";
GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT ALL ON TABLE "public"."vehicle_model_pricing" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_model_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_model_pricing" TO "service_role";
GRANT ALL ON SEQUENCE "public"."vehicle_model_pricing_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vehicle_model_pricing_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vehicle_model_pricing_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."vehicle_models" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_models" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_models" TO "service_role";
GRANT ALL ON TABLE "public"."vehicle_swaps" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_swaps" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_swaps" TO "service_role";
GRANT ALL ON TABLE "public"."waiver_reminder_log" TO "anon";
GRANT ALL ON TABLE "public"."waiver_reminder_log" TO "authenticated";
GRANT ALL ON TABLE "public"."waiver_reminder_log" TO "service_role";
GRANT ALL ON TABLE "public"."waivers" TO "anon";
GRANT ALL ON TABLE "public"."waivers" TO "authenticated";
GRANT ALL ON TABLE "public"."waivers" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";