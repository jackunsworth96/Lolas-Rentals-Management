-- Back-office "Release Hold Now" action.
--
-- Context: allocation_sync() stamps a completed order's capacity_reservations
-- row with `released_at = now() + interval '30 minutes'` (see
-- 20260927000000_partner_allocations.sql) as a post-return handover buffer.
-- Until released_at passes, allocation_reserve() treats the vehicle as still
-- reserved and rejects new bookings with ALLOCATION_CONFLICT, even though the
-- order is completed and the bike is physically back.
--
-- This lets a Manager/Admin who has confirmed the vehicle is back and
-- inspected collapse that buffer immediately, without waiting out the fixed
-- 30 minutes. It is intentionally narrow: it only ever moves released_at
-- *earlier*, and only for reservations where actual_end is already set (i.e.
-- the return was genuinely processed) — it can never be used to bypass a
-- real, unfinished rental or a genuine double-booking.

CREATE TABLE public.capacity_hold_releases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES public.capacity_reservations(id),
  vehicle_id text NOT NULL,
  store_id text NOT NULL REFERENCES public.stores(id),
  previous_released_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL,
  released_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.capacity_hold_releases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.release_capacity_hold_now(
  p_vehicle_id text,
  p_store_id text,
  p_actor text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r public.capacity_reservations;
BEGIN
  PERFORM public.allocation_lock(p_store_id);

  SELECT * INTO r FROM public.capacity_reservations
  WHERE vehicle_id = p_vehicle_id AND store_id = p_store_id
    AND actual_end IS NOT NULL AND released_at IS NOT NULL AND released_at > now()
  ORDER BY released_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_PENDING_HOLD: vehicle % has no pending post-return hold to release', p_vehicle_id;
  END IF;

  INSERT INTO public.capacity_hold_releases
    (reservation_id, vehicle_id, store_id, previous_released_at, released_at, released_by)
  VALUES (r.id, p_vehicle_id, p_store_id, r.released_at, now(), p_actor);

  UPDATE public.capacity_reservations SET released_at = now() WHERE id = r.id;

  -- Mirror allocation_sync's own segment trimming so pooled shared/guaranteed
  -- counts immediately reflect the earlier release too.
  UPDATE public.capacity_reservation_segments
  SET ends_at = now()
  WHERE reservation_id = r.id AND starts_at < now() AND ends_at > now();

  DELETE FROM public.capacity_reservation_segments
  WHERE reservation_id = r.id AND starts_at >= now();

  RETURN jsonb_build_object(
    'vehicleId', p_vehicle_id,
    'previousReleasedAt', r.released_at,
    'releasedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_capacity_hold_now(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_capacity_hold_now(text, text, text) TO service_role;
