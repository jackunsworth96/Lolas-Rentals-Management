-- ============================================================
-- Retroactively assign a partner/affiliate to an order that was
-- already activated without a partner_ref (guest booked on the
-- plain site but actually stayed at a partner property).
--
-- This mirrors the discount/benefit a live partner-linked booking
-- would have received (see apps/api/src/lib/partner-benefit.ts),
-- and nets out the commission base the same way a rental-revenue
-- refund does today (see 20261003000000_refund_commission_and_early_return.sql)
-- — except here there is no payment row at all when no cash needs
-- to move, so balance_due drops immediately instead of netting to
-- zero the way a real cash refund mirror-entry would.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_assigned_by text REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS partner_benefit_rental_discount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_benefit_delivery_discount numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.partner_assigned_at IS
  'Set when staff retroactively assigned a partner to this order after activation (as opposed to the guest arriving via ?ref= link or a walk-in staff selection). NULL for normal attribution.';
COMMENT ON COLUMN public.orders.partner_benefit_rental_discount IS
  'Rental-rate discount amount applied at the moment of retroactive assignment. Already netted out of final_total and orders_raw.rental_value_raw.';
COMMENT ON COLUMN public.orders.partner_benefit_delivery_discount IS
  'Pickup/dropoff fee waived at the moment of retroactive assignment. Already netted out of final_total (does not affect commission base).';

-- ─── Atomic assignment RPC ──────────────────────────────────
-- p_item_updates: jsonb array of { id, discount, pickup_fee, dropoff_fee }
-- carrying the NEW (already-computed, already-additive) values for each
-- order_item — the caller computes these via applyPartnerBenefit() per
-- item before calling this function; this function only persists them.

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

  UPDATE public.orders SET
    partner_ref = p_partner_ref,
    final_total = GREATEST(0, final_total - v_total_discount),
    balance_due = GREATEST(0, balance_due - v_total_discount),
    partner_assigned_at = now(),
    partner_assigned_by = p_employee_id,
    partner_benefit_rental_discount = GREATEST(0, COALESCE(p_rental_discount, 0)),
    partner_benefit_delivery_discount = GREATEST(0, COALESCE(p_delivery_discount, 0)),
    updated_at = now()
  WHERE id = p_order_id;

  -- Keep orders_raw in lockstep: it is the source of truth the commission
  -- engine reads (apps/api/src/lib/partner-commission.ts queries
  -- orders_raw.partner_ref / rental_value_raw directly), and it is also the
  -- row staff see in the Inbox history. Only the rental-rate discount comes
  -- off rental_value_raw — delivery fees were never part of that figure
  -- (see submit-direct-booking.ts: rentalValueRaw = benefit.rentalSubtotal).
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
