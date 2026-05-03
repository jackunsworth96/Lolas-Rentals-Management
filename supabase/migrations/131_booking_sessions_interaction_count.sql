-- ============================================================
-- BOOKING SESSIONS — add interaction_count for click-depth KPIs
-- ============================================================
-- Tracks the number of key booking actions taken per session:
--   +1 per vehicle hold created (catches multi-vehicle comparisons)
--   +1 when basket is first viewed
--   +1 when renter details form is first started
--   +1 when booking is submitted
-- Incremented atomically via the RPC below; Supabase JS cannot
-- express col = col + 1 in a plain .update() call.

ALTER TABLE public.booking_sessions
  ADD COLUMN interaction_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_booking_interaction(p_session_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.booking_sessions
  SET    interaction_count = interaction_count + 1
  WHERE  session_token = p_session_token;
$$;
