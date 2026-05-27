-- ============================================================
-- 154: Return reminder deduplication log
--
-- Tracks which bookings have already received a WhatsApp
-- return reminder via the daily 9 AM job. The unique constraint
-- on booking_reference ensures each booking is messaged once
-- regardless of how many times the job runs.
-- ============================================================

CREATE TABLE public.return_reminder_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text        NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_reference)
);

CREATE INDEX return_reminder_log_reference_idx
  ON public.return_reminder_log (booking_reference);

ALTER TABLE public.return_reminder_log ENABLE ROW LEVEL SECURITY;
-- All writes go through the API server (service role key, bypasses RLS).
-- No direct client access is required.
