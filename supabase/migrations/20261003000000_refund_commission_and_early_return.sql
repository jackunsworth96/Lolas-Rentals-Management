-- Keep refund purpose and any early return alongside the payment that caused it.
ALTER TABLE public.payments
  ADD COLUMN refund_affects_rental_revenue boolean NOT NULL DEFAULT false,
  ADD COLUMN refund_revenue_source text CHECK (refund_revenue_source IN ('original', 'extension')),
  ADD COLUMN refund_source_payment_id text REFERENCES public.payments(id),
  ADD COLUMN refund_previous_dropoff_datetime timestamptz,
  ADD COLUMN refund_actual_return_datetime timestamptz;

CREATE OR REPLACE FUNCTION public.record_refund_atomic(
  p_payment_id text,
  p_order_id text,
  p_store_id text,
  p_amount numeric(12,2),
  p_payment_method_id text,
  p_account_id text,
  p_transaction_date date,
  p_customer_id text,
  p_journal_transaction_id text,
  p_journal_period text,
  p_journal_date date,
  p_journal_legs jsonb,
  p_notes text,
  p_affects_rental_revenue boolean,
  p_revenue_source text,
  p_source_payment_id text,
  p_order_item_id text,
  p_actual_return_datetime timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_source public.payments%ROWTYPE;
  v_source_amount numeric(12,2);
  v_already_refunded numeric(12,2);
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND store_id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Refund amount must be positive'; END IF;
  IF p_actual_return_datetime IS NOT NULL AND v_order.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active rental can be returned early';
  END IF;
  IF p_affects_rental_revenue AND (p_revenue_source IS NULL OR p_order_item_id IS NULL) THEN
    RAISE EXCEPTION 'Rental revenue refunds require a charge and vehicle';
  END IF;
  IF NOT p_affects_rental_revenue AND (p_revenue_source IS NOT NULL OR p_source_payment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Non-rental refunds cannot name a rental charge';
  END IF;
  IF p_order_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.order_items
    WHERE id = p_order_item_id AND order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found'; END IF;
  ELSIF p_actual_return_datetime IS NOT NULL THEN
    RAISE EXCEPTION 'Early return requires a vehicle';
  END IF;

  IF p_affects_rental_revenue THEN
    IF p_revenue_source = 'extension' AND p_source_payment_id IS NOT NULL THEN
      SELECT * INTO v_source FROM public.payments
      WHERE id = p_source_payment_id AND order_id = p_order_id
        AND (order_item_id = p_order_item_id OR
             (order_item_id IS NULL AND
              (SELECT COUNT(*) FROM public.order_items WHERE order_id = p_order_id) = 1))
        AND payment_type = 'extension'
        AND settlement_status IS DISTINCT FROM 'pending';
      IF NOT FOUND THEN RAISE EXCEPTION 'Paid extension charge not found'; END IF;
      v_source_amount := v_source.amount;
    ELSIF p_revenue_source = 'original' AND p_source_payment_id IS NULL THEN
      SELECT COALESCE(rental_value_raw, web_quote_raw, 0) INTO v_source_amount
      FROM public.orders_raw WHERE order_reference = v_order.booking_token
      ORDER BY created_at DESC LIMIT 1;
      IF v_source_amount IS NULL THEN RAISE EXCEPTION 'Original rental charge not found'; END IF;
    ELSE
      RAISE EXCEPTION 'Invalid rental revenue source';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
    FROM public.payments
    WHERE order_id = p_order_id AND payment_type = 'refund'
      AND refund_affects_rental_revenue
      AND (p_revenue_source = 'original' OR order_item_id = p_order_item_id)
      AND refund_revenue_source = p_revenue_source
      AND refund_source_payment_id IS NOT DISTINCT FROM p_source_payment_id;
    IF p_amount + v_already_refunded > v_source_amount THEN
      RAISE EXCEPTION 'Refund exceeds the remaining rental charge';
    END IF;
  END IF;

  IF p_actual_return_datetime IS NOT NULL THEN
    IF p_actual_return_datetime <= v_item.pickup_datetime
       OR p_actual_return_datetime >= v_item.dropoff_datetime
       OR p_actual_return_datetime > now() THEN
      RAISE EXCEPTION 'Actual return must be after pickup, before planned return, and no later than now';
    END IF;
  END IF;

  IF p_affects_rental_revenue THEN
    IF COALESCE(v_order.final_total, 0) < p_amount THEN
      RAISE EXCEPTION 'Refund exceeds the order total';
    END IF;
    UPDATE public.orders SET final_total = final_total - p_amount, updated_at = now()
    WHERE id = p_order_id;
  END IF;

  PERFORM public.collect_payment_atomic(
    p_payment_id, p_order_id, p_store_id, p_amount, p_payment_method_id,
    p_account_id, p_transaction_date, p_customer_id, 'refund',
    p_journal_transaction_id, p_journal_period, p_journal_date,
    p_journal_legs, p_notes, NULL
  );

  UPDATE public.payments SET
    order_item_id = p_order_item_id,
    refund_affects_rental_revenue = p_affects_rental_revenue,
    refund_revenue_source = p_revenue_source,
    refund_source_payment_id = p_source_payment_id,
    refund_previous_dropoff_datetime = CASE WHEN p_actual_return_datetime IS NOT NULL THEN v_item.dropoff_datetime ELSE NULL END,
    refund_actual_return_datetime = p_actual_return_datetime
  WHERE id = p_payment_id;

  IF p_actual_return_datetime IS NOT NULL THEN
    UPDATE public.order_items SET
      dropoff_datetime = p_actual_return_datetime,
      rental_days_count = GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_actual_return_datetime - pickup_datetime)) / 86400)::integer),
      updated_at = now()
    WHERE id = p_order_item_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_refund_atomic(text,text,text,numeric,text,text,date,text,text,text,date,jsonb,text,boolean,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic(text,text,text,numeric,text,text,date,text,text,text,date,jsonb,text,boolean,text,text,text,timestamptz) TO service_role;
