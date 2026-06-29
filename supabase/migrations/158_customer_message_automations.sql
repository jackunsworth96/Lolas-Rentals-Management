-- ============================================================
-- 158: Customer WhatsApp message automations
--
-- Adds dedupe logs for new WhatsApp automations and a staff-controlled
-- customer flag to suppress post-rental review requests.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pickup_reminder_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text        NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_reference)
);

CREATE INDEX IF NOT EXISTS pickup_reminder_log_reference_idx
  ON public.pickup_reminder_log (booking_reference);

ALTER TABLE public.pickup_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.return_reminder_today_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text        NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_reference)
);

CREATE INDEX IF NOT EXISTS return_reminder_today_log_reference_idx
  ON public.return_reminder_today_log (booking_reference);

ALTER TABLE public.return_reminder_today_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.extension_message_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference   text        NOT NULL,
  new_dropoff_datetime timestamptz NOT NULL,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_reference, new_dropoff_datetime)
);

CREATE INDEX IF NOT EXISTS extension_message_log_reference_idx
  ON public.extension_message_log (booking_reference);

ALTER TABLE public.extension_message_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_review_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.whatsapp_review_opt_out IS
  'When true, suppress automated WhatsApp post-rental Google review requests.';
