-- Manual staging/production schema patch for direct partner bookings.
--
-- The application writes the per-vehicle driver name and optional partner
-- booking-group reference to orders_raw. These columns originate from
-- supabase/migrations/161_partner_booking_group_driver.sql, which may not be
-- reflected in environments deployed from Vercel alone.
--
-- This script intentionally does not update supabase_migrations history.
-- Run explicitly in the Supabase SQL Editor or with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/manual/apply-direct-booking-partner-schema.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '1min';

SELECT pg_advisory_xact_lock(hashtext('lolas_manual_direct_booking_partner_schema_v1'));

DO $preflight$
BEGIN
  IF to_regclass('public.orders_raw') IS NULL THEN
    RAISE EXCEPTION 'Direct-booking schema patch aborted. public.orders_raw is missing';
  END IF;
END;
$preflight$;

ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS partner_booking_group_ref text NULL,
  ADD COLUMN IF NOT EXISTS driver_name text NULL;

CREATE INDEX IF NOT EXISTS idx_orders_raw_partner_booking_group_ref
  ON public.orders_raw(partner_booking_group_ref)
  WHERE partner_booking_group_ref IS NOT NULL;

DO $verify$
DECLARE
  missing_columns text;
BEGIN
  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
  INTO missing_columns
  FROM (VALUES ('driver_name'), ('partner_booking_group_ref')) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders_raw'
      AND column_name = required.column_name
      AND data_type = 'text'
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Direct-booking schema patch verification failed. Missing or incompatible orders_raw columns: %',
      missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'orders_raw'
      AND indexname = 'idx_orders_raw_partner_booking_group_ref'
  ) THEN
    RAISE EXCEPTION
      'Direct-booking schema patch verification failed. Partner booking-group index is missing';
  END IF;
END;
$verify$;

COMMIT;
