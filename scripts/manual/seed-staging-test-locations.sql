-- Staging-only booking location seed for Lola's Rentals.
--
-- Adds or refreshes the two locations required for public booking tests without
-- deleting any existing location. The script aborts if either seed name already
-- has duplicate rows for store-lolas.
--
-- Run explicitly in the Supabase SQL Editor or with:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/manual/seed-staging-test-locations.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtext('lolas_staging_test_locations_v1'));
LOCK TABLE public.locations IN SHARE ROW EXCLUSIVE MODE;

DO $location_preflight$
DECLARE
  duplicate_names text;
BEGIN
  IF to_regclass('public.stores') IS NULL
     OR to_regclass('public.locations') IS NULL THEN
    RAISE EXCEPTION 'Location seed aborted. Required stores or locations table is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = 'store-lolas') THEN
    RAISE EXCEPTION 'Location seed aborted. Required store store-lolas does not exist';
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name)
  INTO duplicate_names
  FROM (
    SELECT name
    FROM public.locations
    WHERE store_id = 'store-lolas'
      AND name IN ('Lola''s Rentals Shop', 'IAO Airport')
    GROUP BY name
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_names IS NOT NULL THEN
    RAISE EXCEPTION
      'Location seed aborted. Duplicate store-lolas location rows exist for: %',
      duplicate_names;
  END IF;
END;
$location_preflight$;

UPDATE public.locations
SET
  delivery_cost = seed.delivery_cost,
  collection_cost = seed.collection_cost,
  location_type = seed.location_type,
  is_active = true
FROM (
  VALUES
    ('Lola''s Rentals Shop'::text, 0.00::numeric, 0.00::numeric, 'store'::text),
    ('IAO Airport'::text, 500.00::numeric, 500.00::numeric, 'airport'::text)
) AS seed(name, delivery_cost, collection_cost, location_type)
WHERE public.locations.store_id = 'store-lolas'
  AND public.locations.name = seed.name;

INSERT INTO public.locations (
  name, delivery_cost, collection_cost, location_type, store_id, is_active
)
SELECT
  seed.name,
  seed.delivery_cost,
  seed.collection_cost,
  seed.location_type,
  'store-lolas',
  true
FROM (
  VALUES
    ('Lola''s Rentals Shop'::text, 0.00::numeric, 0.00::numeric, 'store'::text),
    ('IAO Airport'::text, 500.00::numeric, 500.00::numeric, 'airport'::text)
) AS seed(name, delivery_cost, collection_cost, location_type)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.locations AS existing
  WHERE existing.store_id = 'store-lolas'
    AND existing.name = seed.name
);

DO $verify_locations$
BEGIN
  IF (SELECT count(*) FROM public.locations
      WHERE store_id = 'store-lolas'
        AND name IN ('Lola''s Rentals Shop', 'IAO Airport')) <> 2 THEN
    RAISE EXCEPTION 'Location seed verification failed. Expected exactly two Lola''s test locations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.locations
    WHERE store_id = 'store-lolas'
      AND (
        (name = 'Lola''s Rentals Shop'
         AND (delivery_cost <> 0 OR collection_cost <> 0 OR location_type <> 'store' OR NOT is_active))
        OR
        (name = 'IAO Airport'
         AND (delivery_cost <> 500 OR collection_cost <> 500 OR location_type <> 'airport' OR NOT is_active))
      )
  ) THEN
    RAISE EXCEPTION 'Location seed verification failed. One or more Lola''s test locations have unexpected values';
  END IF;
END;
$verify_locations$;

COMMIT;
