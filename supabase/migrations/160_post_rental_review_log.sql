-- ============================================================
-- 157: Post-rental review request deduplication log
--
-- Tracks which bookings have already received a WhatsApp
-- Google review request. The unique constraint on
-- booking_reference ensures each booking is messaged once
-- regardless of how many times the job runs.
-- ============================================================

CREATE TABLE public.post_rental_review_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text        NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_reference)
);

CREATE INDEX post_rental_review_log_reference_idx
  ON public.post_rental_review_log (booking_reference);

ALTER TABLE public.post_rental_review_log ENABLE ROW LEVEL SECURITY;
-- All writes go through the API server (service role key, bypasses RLS).
-- No direct client access is required.
