-- ============================================================
-- 121: email_opt_out — customer email unsubscribe flag
--
-- Adds a boolean opt-out column to customers so the post-rental
-- thank-you job can skip sending follow-up emails to customers
-- who have unsubscribed via the one-click unsubscribe link.
-- ============================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.email_opt_out IS
  'When true, suppress automated follow-up emails (e.g. post-rental thank-you).';
