-- ============================================================
-- BOOKING SESSIONS — funnel tracking from hold to submission
-- ============================================================
-- Status is computed in queries, not stored, to avoid stale data:
--   submitted_at IS NOT NULL                         → converted
--   submitted_at IS NULL AND created_at < now()-3h   → abandoned
--   otherwise                                        → active

CREATE TABLE public.booking_sessions (
  session_token              text PRIMARY KEY,
  store_id                   text REFERENCES public.stores (id),
  pickup_datetime            timestamptz,
  dropoff_datetime           timestamptz,
  basket_items               jsonb NOT NULL DEFAULT '[]',
  device_type                text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  basket_viewed_at           timestamptz,
  renter_details_started_at  timestamptz,
  submitted_at               timestamptz,
  renter_details             jsonb
);

CREATE INDEX idx_booking_sessions_store_created
  ON public.booking_sessions (store_id, created_at DESC);

CREATE INDEX idx_booking_sessions_created_at
  ON public.booking_sessions (created_at DESC);
