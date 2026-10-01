-- Apply manually to backed-up staging after reviewing the preflight output.
-- This is the customer-column portion of migration 158. It does not update
-- supabase_migrations and is safe to rerun.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('lolas_customer_opt_out_install'));

DO $preflight$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'customers table is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'whatsapp_review_opt_out'
      AND (data_type <> 'boolean' OR is_nullable <> 'NO')
  ) THEN
    RAISE EXCEPTION 'customers.whatsapp_review_opt_out has an incompatible definition';
  END IF;
END;
$preflight$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_review_opt_out boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.customers.whatsapp_review_opt_out IS
  'When true, suppress automated WhatsApp post-rental Google review requests.';

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
  AND column_name = 'whatsapp_review_opt_out';
