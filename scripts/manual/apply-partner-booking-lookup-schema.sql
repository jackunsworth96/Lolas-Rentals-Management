-- Manual staging/production schema patch for public partner booking lookup.
--
-- The direct-booking API resolves partner pricing and delivery benefits from
-- accommodation_partners. These fields originate from migrations 134, 139,
-- 156, and 159, which are not applied by a Vercel deployment.
--
-- This script intentionally does not update supabase_migrations history.
-- Run explicitly in the Supabase SQL Editor or with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/manual/apply-partner-booking-lookup-schema.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '1min';

SELECT pg_advisory_xact_lock(hashtext('lolas_manual_partner_booking_lookup_schema_v1'));

DO $preflight$
BEGIN
  IF to_regclass('public.accommodation_partners') IS NULL THEN
    RAISE EXCEPTION
      'Partner booking schema patch aborted. public.accommodation_partners is missing';
  END IF;
END;
$preflight$;

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS deal_type text NOT NULL DEFAULT 'commission',
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS free_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_delivery_location_ids integer[] NULL,
  ADD COLUMN IF NOT EXISTS advance_discount_days integer,
  ADD COLUMN IF NOT EXISTS early_bird_days integer,
  ADD COLUMN IF NOT EXISTS early_bird_discount_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS portal_subdomain text;

ALTER TABLE public.accommodation_partners
  DROP CONSTRAINT IF EXISTS accommodation_partners_deal_type_check,
  ADD CONSTRAINT accommodation_partners_deal_type_check
    CHECK (deal_type IN (
      'commission', 'discount', 'free_delivery', 'combined',
      'commission_delivery', 'discount_delivery'
    ));

ALTER TABLE public.accommodation_partners
  DROP CONSTRAINT IF EXISTS accommodation_partners_discount_type_check,
  ADD CONSTRAINT accommodation_partners_discount_type_check
    CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'fixed'));

ALTER TABLE public.accommodation_partners
  DROP CONSTRAINT IF EXISTS accommodation_partners_status_check,
  ADD CONSTRAINT accommodation_partners_status_check
    CHECK (status IN ('active', 'pending', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_accommodation_partners_portal_subdomain
  ON public.accommodation_partners(portal_subdomain)
  WHERE portal_subdomain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accommodation_partners_pending
  ON public.accommodation_partners(created_at DESC)
  WHERE status = 'pending';

DO $verify$
DECLARE
  missing_columns text;
BEGIN
  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
  INTO missing_columns
  FROM (
    VALUES
      ('deal_type', 'text'),
      ('discount_type', 'text'),
      ('discount_value', 'numeric'),
      ('free_delivery', 'boolean'),
      ('free_delivery_location_ids', 'ARRAY'),
      ('advance_discount_days', 'integer'),
      ('early_bird_days', 'integer'),
      ('early_bird_discount_value', 'numeric'),
      ('status', 'text'),
      ('portal_subdomain', 'text')
  ) AS required(column_name, data_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accommodation_partners'
      AND column_name = required.column_name
      AND data_type = required.data_type
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Partner booking schema patch verification failed. Missing or incompatible accommodation_partners columns: %',
      missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'accommodation_partners'
      AND indexname = 'idx_accommodation_partners_portal_subdomain'
  ) THEN
    RAISE EXCEPTION
      'Partner booking schema patch verification failed. Portal-subdomain index is missing';
  END IF;
END;
$verify$;

COMMIT;
