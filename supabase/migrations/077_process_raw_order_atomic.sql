-- ============================================================
-- 077: process_raw_order_atomic RPC
-- Atomically processes a raw order into a fully-activated order:
-- upserts customer, inserts order + items + addons, updates fleet,
-- inserts payments + card settlement + transfer, writes all
-- journal legs, and marks the raw order processed.
-- Deterministic order id (computed client-side) + orders idempotency
-- guard make retries safe even after mid-flight failure.
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_raw_order_atomic(
  p_raw_order_id           text,
  p_order_id               text,
  p_store_id               text,
  p_customer_row           jsonb,
  p_order_row              jsonb,
  p_order_items            jsonb,
  p_order_addons           jsonb,
  p_fleet_updates          jsonb,
  p_rental_payment         jsonb,
  p_deposit_payment        jsonb,
  p_card_settlement        jsonb,
  p_transfer_row           jsonb,
  p_journal_transaction_id text,
  p_journal_period         text,
  p_journal_date           date,
  p_journal_legs           jsonb,
  p_settled_at             timestamptz
)
RETURNS TABLE(order_id text, was_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  UPDATE public.payments
  SET order_id = p_order_id
  WHERE raw_order_id = p_raw_order_id::uuid
    AND order_id IS NULL;

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


-- ============================================================
-- Lock down execution — only the API service role may invoke.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.process_raw_order_atomic(
  text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, text, text, date, jsonb, timestamptz
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.process_raw_order_atomic(
  text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, text, text, date, jsonb, timestamptz
) FROM anon;

GRANT EXECUTE ON FUNCTION public.process_raw_order_atomic(
  text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, text, text, date, jsonb, timestamptz
) TO service_role;
