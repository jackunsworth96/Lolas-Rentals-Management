CREATE OR REPLACE FUNCTION activate_order_atomic(
  -- Order fields
  p_order_id              text,
  p_store_id              text,
  p_woo_order_id          integer,
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
  -- Order items (array)
  p_order_items           jsonb,
  -- Order addons (array, may be empty)
  p_order_addons          jsonb,
  -- Fleet vehicle updates (array)
  p_fleet_updates         jsonb,
  -- Journal entries (array, may be empty)
  p_journal_transaction_id text,
  p_journal_period        text,
  p_journal_date          date,
  p_journal_store_id      text,
  p_journal_legs          jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  addon jsonb;
  vehicle jsonb;
  leg jsonb;
BEGIN
  -- 1. Upsert the order record first
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

  -- 3. Upsert order addons (conditional)
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

  -- 5. Insert journal entries (conditional — only if legs array is non-empty)
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
