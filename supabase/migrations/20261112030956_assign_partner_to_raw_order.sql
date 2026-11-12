-- ============================================================
-- Assign a partner/affiliate to an unprocessed inbox booking
-- (orders_raw) — the pre-activation counterpart of
-- assign_partner_to_order_atomic.
--
-- In stores with partner capacity allocation enabled, an inbox
-- booking already holds a capacity_reservations row keyed
-- 'raw:<id>' to the partner it was booked under (none), and
-- allocation_reserve() refuses to change a reservation's partner:
--   ALLOCATION_CONFLICT: cannot change partner on an existing capacity reservation
-- Same fix as 20261013092752_fix_assign_partner_release_stale_capacity_reservation.sql:
-- release the reservation in the same transaction as setting
-- partner_ref, so the deferred allocation_sync trigger re-creates it
-- under the new partner at commit (or the whole thing rolls back if
-- there's no capacity for it).
--
-- p_web_quote_raw / p_rental_value_raw: new values, or NULL to leave
-- the column unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_partner_to_raw_order_atomic(
  p_raw_order_id uuid,
  p_partner_ref text,
  p_web_quote_raw numeric,
  p_rental_value_raw numeric
)
RETURNS TABLE (id uuid, partner_ref text, web_quote_raw numeric, rental_value_raw numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw public.orders_raw%ROWTYPE;
BEGIN
  IF p_partner_ref IS NULL OR btrim(p_partner_ref) = '' THEN
    RAISE EXCEPTION 'Partner reference is required';
  END IF;

  SELECT * INTO v_raw FROM public.orders_raw o WHERE o.id = p_raw_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_raw.partner_ref IS NOT NULL THEN
    RAISE EXCEPTION 'Booking already has a partner assigned (%)', v_raw.partner_ref;
  END IF;
  IF v_raw.status <> 'unprocessed' THEN
    RAISE EXCEPTION 'Only unprocessed inbox bookings can be assigned a partner here';
  END IF;

  DELETE FROM public.capacity_reservations WHERE source_key = 'raw:' || p_raw_order_id::text;

  UPDATE public.orders_raw o SET
    partner_ref      = p_partner_ref,
    web_quote_raw    = COALESCE(p_web_quote_raw, o.web_quote_raw),
    rental_value_raw = COALESCE(p_rental_value_raw, o.rental_value_raw),
    updated_at       = now()
  WHERE o.id = p_raw_order_id;

  RETURN QUERY
    SELECT o.id, o.partner_ref, o.web_quote_raw, o.rental_value_raw
    FROM public.orders_raw o WHERE o.id = p_raw_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_partner_to_raw_order_atomic(uuid,text,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_partner_to_raw_order_atomic(uuid,text,numeric,numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
