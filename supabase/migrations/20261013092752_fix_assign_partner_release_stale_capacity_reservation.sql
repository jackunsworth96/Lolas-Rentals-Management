-- Fixes a second bug in assign_partner_to_order_atomic (see
-- 20261013090000_assign_partner_to_activated_order.sql and
-- 20261013092006_fix_assign_partner_to_order_ambiguous_column.sql) that made
-- "Assign partner" fail in stores with capacity allocation enabled, with:
--   ALLOCATION_CONFLICT: cannot change partner on an existing capacity reservation
--
-- Root cause: for stores that use the partner guaranteed/shared bike-pool
-- feature (20260927000000_partner_allocations.sql), every order item carries
-- a capacity_reservations row permanently keyed to whichever partner (or
-- none) it was first booked under. The deferred allocation_sync constraint
-- trigger on orders/order_items recomputes this on every change and the
-- allocation_reserve() guard explicitly refuses to let an existing
-- reservation's partner_id change -- by design, to stop *accidental* partner
-- swaps elsewhere in the app from silently stealing capacity from another
-- partner's guaranteed pool. A deliberate, staff-approved retroactive
-- assignment is exactly the case this guard should not block.
--
-- Fix: release (delete) the order's existing capacity_reservations row(s)
-- right before reassigning partner_ref, so the deferred trigger computes a
-- brand-new reservation correctly keyed to the new partner when it fires at
-- commit. If there genuinely isn't capacity for it under the new partner,
-- the whole transaction (including the assignment itself) rolls back
-- together -- never a partial/inconsistent state.

CREATE OR REPLACE FUNCTION public.assign_partner_to_order_atomic(
  p_order_id text,
  p_store_id text,
  p_partner_ref text,
  p_employee_id text,
  p_rental_discount numeric,
  p_delivery_discount numeric,
  p_item_updates jsonb
)
RETURNS TABLE (final_total numeric, balance_due numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_total_discount numeric(12,2);
  v_item jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND store_id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.partner_ref IS NOT NULL THEN
    RAISE EXCEPTION 'Order already has a partner assigned (%)', v_order.partner_ref;
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot assign a partner to a cancelled order';
  END IF;
  IF p_partner_ref IS NULL OR btrim(p_partner_ref) = '' THEN
    RAISE EXCEPTION 'Partner reference is required';
  END IF;

  v_total_discount := GREATEST(0, COALESCE(p_rental_discount, 0)) + GREATEST(0, COALESCE(p_delivery_discount, 0));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_item_updates) LOOP
    UPDATE public.order_items SET
      discount    = (v_item->>'discount')::numeric,
      pickup_fee  = (v_item->>'pickup_fee')::numeric,
      dropoff_fee = (v_item->>'dropoff_fee')::numeric,
      updated_at  = now()
    WHERE id = (v_item->>'id') AND order_id = p_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order item % not found on order %', (v_item->>'id'), p_order_id;
    END IF;
  END LOOP;

  -- See migration header: release stale reservation(s) for this order so the
  -- deferred allocation sync trigger re-creates them correctly keyed to the
  -- new partner instead of raising ALLOCATION_CONFLICT.
  DELETE FROM public.capacity_reservations
  WHERE source_key IN (
    SELECT 'item:' || oi.id FROM public.order_items oi WHERE oi.order_id = p_order_id
    UNION ALL
    SELECT 'raw:' || orw.id::text FROM public.orders_raw orw WHERE orw.order_reference = v_order.booking_token AND orw.store_id = p_store_id
  );

  UPDATE public.orders SET
    partner_ref = p_partner_ref,
    final_total = GREATEST(0, public.orders.final_total - v_total_discount),
    balance_due = GREATEST(0, public.orders.balance_due - v_total_discount),
    partner_assigned_at = now(),
    partner_assigned_by = p_employee_id,
    partner_benefit_rental_discount = GREATEST(0, COALESCE(p_rental_discount, 0)),
    partner_benefit_delivery_discount = GREATEST(0, COALESCE(p_delivery_discount, 0)),
    updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.orders_raw SET
    partner_ref = p_partner_ref,
    rental_value_raw = GREATEST(0, COALESCE(rental_value_raw, web_quote_raw, 0) - GREATEST(0, COALESCE(p_rental_discount, 0))),
    web_quote_raw = GREATEST(0, COALESCE(web_quote_raw, 0) - v_total_discount)
  WHERE order_reference = v_order.booking_token AND store_id = p_store_id;

  RETURN QUERY
    SELECT o.final_total, o.balance_due FROM public.orders o WHERE o.id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_partner_to_order_atomic(text,text,text,text,numeric,numeric,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_partner_to_order_atomic(text,text,text,text,numeric,numeric,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
