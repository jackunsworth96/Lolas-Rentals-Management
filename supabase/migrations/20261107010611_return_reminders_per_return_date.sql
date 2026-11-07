-- Apply before deploying the API, while reminder jobs are idle.
BEGIN;

-- Include the existing 9 PM job's log in fresh database setups.
CREATE TABLE IF NOT EXISTS public.nine_pm_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text NOT NULL UNIQUE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nine_pm_reminder_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.return_reminder_log ADD COLUMN return_date date;
ALTER TABLE public.return_reminder_today_log ADD COLUMN return_date date;
ALTER TABLE public.nine_pm_reminder_log ADD COLUMN return_date date;

-- Legacy jobs selected a single Manila return date. Preserve that date from
-- the send time, rather than a booking's current, possibly extended dropoff.
UPDATE public.return_reminder_log
SET return_date = (sent_at AT TIME ZONE 'Asia/Manila')::date + 1
WHERE return_date IS NULL;
UPDATE public.return_reminder_today_log
SET return_date = (sent_at AT TIME ZONE 'Asia/Manila')::date
WHERE return_date IS NULL;
UPDATE public.nine_pm_reminder_log
SET return_date = (sent_at AT TIME ZONE 'Asia/Manila')::date
WHERE return_date IS NULL;

ALTER TABLE public.return_reminder_log
  ALTER COLUMN return_date SET NOT NULL,
  ALTER COLUMN return_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date + 1),
  DROP CONSTRAINT return_reminder_log_booking_reference_key,
  ADD CONSTRAINT return_reminder_log_booking_return_date_key UNIQUE (booking_reference, return_date);

ALTER TABLE public.return_reminder_today_log
  ALTER COLUMN return_date SET NOT NULL,
  ALTER COLUMN return_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
  DROP CONSTRAINT return_reminder_today_log_booking_reference_key,
  ADD CONSTRAINT return_reminder_today_log_booking_return_date_key UNIQUE (booking_reference, return_date);

ALTER TABLE public.nine_pm_reminder_log
  ALTER COLUMN return_date SET NOT NULL,
  ALTER COLUMN return_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
  DROP CONSTRAINT nine_pm_reminder_log_booking_reference_key,
  ADD CONSTRAINT nine_pm_reminder_log_booking_return_date_key UNIQUE (booking_reference, return_date);

-- Retain Meta IDs, reporting state and uncertain attempts under dated keys.
-- Only legacy booking-only keys match; other WhatsApp automations are unchanged.
UPDATE public.whatsapp_template_sends
SET operation_key = operation_key || ':' || (
  (COALESCE(sent_at, created_at) AT TIME ZONE 'Asia/Manila')::date
  + CASE WHEN operation_key LIKE 'return-reminder:%' THEN 1 ELSE 0 END
)::text
WHERE operation_key ~ '^return-reminder(-today)?:[^:]+$';

COMMIT;
