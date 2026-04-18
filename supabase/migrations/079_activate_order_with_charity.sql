-- ============================================================
-- 079: Assert balanced legs inside activate_order_atomic
-- AC-05: guarantee every journal posting in the walk-in flow is
-- balanced before it is written to journal_entries. Parameter list
-- is byte-for-byte identical to migration 067 so existing callers
-- continue to work; body is unchanged except for a single
-- PERFORM public.assert_balanced_legs(p_journal_legs) prelude.
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_order_atomic(
  -- Order fields (unchanged)
  p_order_id              text,
  p_store_id              text,
  p_woo_order_id          text,
  p_customer_id           text,
  p_employee_id           text,
  p_order_date            date,
  p_status                text,
  p_web_notes             text,
  p_quantity              integer,
  p_web_quote_raw         numeric(12,2),
  p_security_deposit      numeric(12,2),
  p_deposit_status        text,
  p_card_fee_surcharge    numeric(12,2),
  p_return_charges        numeric(12,2),
  p_final_total           numeric(12,2),
  p_balance_due           numeric(12,2),
  p_payment_method_id     text,
  p_deposit_method_id     text,
  p_booking_token         text,
  p_tips                  numeric(12,2),
  p_charity_donation      numeric(12,2),
  p_updated_at            timestamptz,
  p_order_items           jsonb,
  p_order_addons          jsonb,
  p_fleet_updates         jsonb,
  p_journal_transaction_id text,
  p_journal_period        text,
  p_journal_date          date,
  p_journal_store_id      text,
  p_journal_legs          jsonb,
  -- NEW payment parameters
  p_rental_payment_id     text,
  p_rental_amount         numeric(12,2),
  p_transaction_date      date,
  p_deposit_payment_id    text,       -- null if deposit not collected
  p_deposit_amount        numeric(12,2), -- 0 if deposit not collected
  p_deposit_collected     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- 2. Upsert order items
  FOR item IN SELECT * FROM jsonb_array_elements(p_order_items) LOOP
    INSERT INTO public.order_items (
      id, order_id, store_id, vehicle_model_id, vehicle_id,
      daily_rate, rental_days, subtotal, pickup_datetime, dropoff_datetime,
      pickup_location_id, dropoff_location_id, order_reference
    )
    SELECT
      (item->>'id')::text,
      p_order_id,
      p_store_id,
      (item->>'vehicleModelId')::text,
      (item->>'vehicleId')::text,
      (item->>'dailyRate')::numeric,
      (item->>'rentalDays')::integer,
      (item->>'subtotal')::numeric,
      (item->>'pickupDatetime')::timestamptz,
      (item->>'dropoffDatetime')::timestamptz,
      (item->>'pickupLocationId')::text,
      (item->>'dropoffLocationId')::text,
      (item->>'orderReference')::text
    ON CONFLICT (id) DO UPDATE SET
      dropoff_datetime = EXCLUDED.dropoff_datetime,
      subtotal         = EXCLUDED.subtotal,
      rental_days      = EXCLUDED.rental_days;
  END LOOP;

  -- 3. Upsert order addons
  FOR addon IN SELECT * FROM jsonb_array_elements(p_order_addons) LOOP
    INSERT INTO public.order_addons (id, order_id, addon_id, quantity, unit_price, subtotal)
    SELECT
      (addon->>'id')::text,
      p_order_id,
      (addon->>'addonId')::text,
      (addon->>'quantity')::integer,
      (addon->>'unitPrice')::numeric,
      (addon->>'subtotal')::numeric
    ON CONFLICT (id) DO UPDATE SET
      subtotal = EXCLUDED.subtotal;
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

  -- 6. Insert rental payment (NEW — previously done in route handler)
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

  -- 7. Insert deposit payment if collected (NEW — previously done in route handler)
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

-- Re-emit REVOKE/GRANT matching the typed signature from migration 067.
REVOKE EXECUTE ON FUNCTION public.activate_order_atomic(
  text, text, text, text, text, date, text, text, integer,
  numeric, numeric, text, numeric, numeric, numeric, numeric,
  text, text, text, numeric, numeric, timestamptz,
  jsonb, jsonb, jsonb, text, text, date, text, jsonb,
  text, numeric, date, text, numeric, boolean
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_order_atomic(
  text, text, text, text, text, date, text, text, integer,
  numeric, numeric, text, numeric, numeric, numeric, numeric,
  text, text, text, numeric, numeric, timestamptz,
  jsonb, jsonb, jsonb, text, text, date, text, jsonb,
  text, numeric, date, text, numeric, boolean
) FROM anon;
GRANT  EXECUTE ON FUNCTION public.activate_order_atomic(
  text, text, text, text, text, date, text, text, integer,
  numeric, numeric, text, numeric, numeric, numeric, numeric,
  text, text, text, numeric, numeric, timestamptz,
  jsonb, jsonb, jsonb, text, text, date, text, jsonb,
  text, numeric, date, text, numeric, boolean
) TO service_role;
