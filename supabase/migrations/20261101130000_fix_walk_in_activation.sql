-- Walk-in Create & Activate calls allocation_activate_order, which built one
-- activate_order_atomic() call from every overload. Shared argument names were
-- emitted twice, so Postgres rejected the statement (42601) and the API
-- returned 500. Pick the single overload whose arguments are all present,
-- preferring the longer payment-aware function.
--
-- That longer function also inserted journal rows into amount/type, which are
-- not columns on journal_entries. Write debit/credit/reference_type instead,
-- and copy the rental rate onto the columns invoices and extensions read.

CREATE OR REPLACE FUNCTION public.allocation_activate_order(p_args jsonb, p_partner_ref text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  call_args text;
  store text := p_args->>'p_store_id';
  target oid;
BEGIN
  PERFORM public.allocation_lock(store);
  IF p_partner_ref IS NOT NULL AND public.allocation_active_partner(store, p_partner_ref) IS NULL THEN
    RAISE EXCEPTION 'Invalid partner for store';
  END IF;

  SELECT p.oid INTO target
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'activate_order_atomic'
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p.proargnames) AS arg(name)
      WHERE NOT (p_args ? arg.name)
    )
  ORDER BY cardinality(p.proargnames) DESC
  LIMIT 1;

  IF target IS NULL THEN
    RAISE EXCEPTION 'Atomic activation function unavailable';
  END IF;

  SELECT string_agg(
    format('%I => ($1->>%L)::%s', a.name, a.name, format_type(a.typ, NULL)),
    ',' ORDER BY a.ordinality
  )
  INTO call_args
  FROM pg_proc p
  CROSS JOIN LATERAL unnest(p.proargnames, p.proargtypes::oid[]) WITH ORDINALITY AS a(name, typ, ordinality)
  WHERE p.oid = target;

  IF call_args IS NULL THEN
    RAISE EXCEPTION 'Atomic activation function unavailable';
  END IF;

  EXECUTE 'SELECT public.activate_order_atomic(' || call_args || ')' USING p_args;
  UPDATE public.orders
  SET partner_ref = p_partner_ref
  WHERE id = p_args->>'p_order_id' AND store_id = store;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_order_atomic(
  p_order_id              text,
  p_store_id              text,
  p_woo_order_id          text,
  p_customer_id           text,
  p_employee_id           text,
  p_order_date            date,
  p_status                text,
  p_web_notes             text,
  p_quantity              integer,
  p_web_quote_raw         numeric,
  p_security_deposit      numeric,
  p_deposit_status        text,
  p_card_fee_surcharge    numeric,
  p_return_charges        numeric,
  p_final_total           numeric,
  p_balance_due           numeric,
  p_payment_method_id     text,
  p_deposit_method_id     text,
  p_booking_token         text,
  p_tips                  numeric,
  p_charity_donation      numeric,
  p_updated_at            timestamptz,
  p_order_items           jsonb,
  p_order_addons          jsonb,
  p_fleet_updates         jsonb,
  p_journal_transaction_id text,
  p_journal_period        text,
  p_journal_date          date,
  p_journal_store_id      text,
  p_journal_legs          jsonb,
  p_rental_payment_id     text,
  p_rental_amount         numeric,
  p_transaction_date      date,
  p_deposit_payment_id    text,
  p_deposit_amount        numeric,
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
  PERFORM public.assert_balanced_legs(p_journal_legs);

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

  FOR item IN SELECT * FROM jsonb_array_elements(p_order_items) LOOP
    INSERT INTO public.order_items (
      id, order_id, store_id, vehicle_model_id, vehicle_id, vehicle_name,
      daily_rate, rental_days, rental_days_count, rental_rate, subtotal,
      pickup_datetime, dropoff_datetime,
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
      COALESCE((item->>'rentalDays')::integer, 0),
      COALESCE((item->>'dailyRate')::numeric, 0),
      (item->>'subtotal')::numeric,
      (item->>'pickupDatetime')::timestamptz,
      (item->>'dropoffDatetime')::timestamptz,
      (item->>'pickupLocationId')::text,
      (item->>'dropoffLocationId')::text,
      (item->>'orderReference')::text
    ON CONFLICT (id) DO UPDATE SET
      vehicle_id         = EXCLUDED.vehicle_id,
      vehicle_name       = EXCLUDED.vehicle_name,
      pickup_datetime    = EXCLUDED.pickup_datetime,
      dropoff_datetime   = EXCLUDED.dropoff_datetime,
      subtotal           = EXCLUDED.subtotal,
      rental_days        = EXCLUDED.rental_days,
      rental_days_count  = EXCLUDED.rental_days_count,
      rental_rate        = EXCLUDED.rental_rate,
      daily_rate         = EXCLUDED.daily_rate;
  END LOOP;

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

  FOR vehicle IN SELECT * FROM jsonb_array_elements(p_fleet_updates) LOOP
    UPDATE public.fleet
    SET
      status     = (vehicle->>'status')::text,
      updated_at = now()
    WHERE id = (vehicle->>'id')::text;
  END LOOP;

  IF p_journal_legs IS NOT NULL AND jsonb_array_length(p_journal_legs) > 0 THEN
    FOR leg IN SELECT * FROM jsonb_array_elements(p_journal_legs) LOOP
      INSERT INTO public.journal_entries (
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
        COALESCE((leg->>'debit')::numeric(12,2), 0),
        COALESCE((leg->>'credit')::numeric(12,2), 0),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id',
        NULL
      );
    END LOOP;
  END IF;

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
