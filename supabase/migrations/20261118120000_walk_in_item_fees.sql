-- Walk-in Create & Activate saved only the location IDs on its order item.
-- The delivery/collection fees were added to final_total but never stored on
-- the item, and the location names were dropped, so the order summary could
-- not itemise them. Store names and fees from the item payload, then backfill
-- existing walk-in items.

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
      pickup_location_id, dropoff_location_id,
      pickup_location, dropoff_location, pickup_fee, dropoff_fee,
      order_reference
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
      (item->>'pickupLocation')::text,
      (item->>'dropoffLocation')::text,
      COALESCE((item->>'pickupFee')::numeric, 0),
      COALESCE((item->>'dropoffFee')::numeric, 0),
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

-- Backfill: restore the location names, and restore the fees only where the
-- unexplained part of final_total equals the locations' delivery + collection cost.
WITH cand AS (
  SELECT
    i.id AS item_id,
    lp.name AS pick_name,
    ld.name AS drop_name,
    COALESCE(lp.delivery_cost, 0) AS pick_cost,
    COALESCE(ld.collection_cost, 0) AS drop_cost,
    o.final_total
      - i.rental_rate * i.rental_days_count + i.discount - i.pickup_fee - i.dropoff_fee
      - COALESCE((SELECT sum(a.total_amount) FROM public.order_addons a WHERE a.order_id = o.id), 0)
      - o.charity_donation - o.card_fee_surcharge - o.return_charges
      - COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.order_id = o.id AND p.payment_type = 'extension'), 0)
      AS residual
  FROM public.order_items i
  JOIN public.orders o ON o.id = i.order_id
  LEFT JOIN public.locations lp ON lp.id::text = i.pickup_location_id
  LEFT JOIN public.locations ld ON ld.id::text = i.dropoff_location_id
  WHERE (SELECT count(*) FROM public.order_items x WHERE x.order_id = o.id) = 1
    AND (
      (i.pickup_location_id IS NOT NULL AND i.pickup_location IS NULL)
      OR (i.dropoff_location_id IS NOT NULL AND i.dropoff_location IS NULL)
    )
)
UPDATE public.order_items i
SET
  pickup_location  = COALESCE(i.pickup_location, c.pick_name),
  dropoff_location = COALESCE(i.dropoff_location, c.drop_name),
  pickup_fee  = CASE WHEN c.pick_cost + c.drop_cost > 0 AND c.residual = c.pick_cost + c.drop_cost THEN c.pick_cost ELSE i.pickup_fee END,
  dropoff_fee = CASE WHEN c.pick_cost + c.drop_cost > 0 AND c.residual = c.pick_cost + c.drop_cost THEN c.drop_cost ELSE i.dropoff_fee END
FROM cand c
WHERE i.id = c.item_id;
