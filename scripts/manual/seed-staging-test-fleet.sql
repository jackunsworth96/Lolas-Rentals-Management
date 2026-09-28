-- Staging-only test fleet seed for Lola's Rentals.
--
-- This script never deletes a vehicle with database references. It accepts
-- either no vehicles, the two explicitly identified legacy staging vehicles,
-- or a previous run of this same six-vehicle seed. Any other fleet state
-- aborts without changes.
--
-- Run explicitly in the Supabase SQL Editor or with:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/manual/seed-staging-test-fleet.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtext('lolas_staging_test_fleet_v1'));
LOCK TABLE public.fleet IN SHARE ROW EXCLUSIVE MODE;

DO $seed_preflight$
DECLARE
  existing_vehicle_count integer;
  canonical_vehicle_count integer;
  legacy_vehicle_count integer;
  existing_vehicle record;
  foreign_key record;
  has_references boolean;
  legacy_vehicle_ids text[] := ARRAY[
    '34a74aff-3b60-47ac-a949-d55e224ec146',
    'a95d5a15-1c81-4f2d-880c-9e8b244d4d98'
  ];
  canonical_vehicle_ids text[] := ARRAY[
    'vehicle-beat-001',
    'vehicle-beat-002',
    'vehicle-beat-003',
    'vehicle-tuktuk-re-001',
    'vehicle-tuktuk-re-002',
    'vehicle-tuktuk-tvs-001'
  ];
BEGIN
  IF to_regclass('public.stores') IS NULL
     OR to_regclass('public.vehicle_models') IS NULL
     OR to_regclass('public.fleet') IS NULL THEN
    RAISE EXCEPTION 'Test fleet seed aborted. Required stores, vehicle_models, or fleet table is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = 'store-lolas') THEN
    RAISE EXCEPTION 'Test fleet seed aborted. Required store store-lolas does not exist';
  END IF;

  SELECT count(*)
  INTO existing_vehicle_count
  FROM public.fleet;

  SELECT count(*)
  INTO canonical_vehicle_count
  FROM public.fleet
  WHERE id = ANY(canonical_vehicle_ids);

  SELECT count(*)
  INTO legacy_vehicle_count
  FROM public.fleet
  WHERE id = ANY(legacy_vehicle_ids);

  IF existing_vehicle_count <> 0
     AND NOT (
       existing_vehicle_count = cardinality(canonical_vehicle_ids)
       AND canonical_vehicle_count = cardinality(canonical_vehicle_ids)
     )
     AND NOT (
       existing_vehicle_count = cardinality(legacy_vehicle_ids)
       AND legacy_vehicle_count = cardinality(legacy_vehicle_ids)
     ) THEN
    RAISE EXCEPTION
      'Test fleet seed aborted. Expected zero, the two identified legacy staging vehicles, or the six existing test vehicles; found % fleet records',
      existing_vehicle_count;
  END IF;

  FOR existing_vehicle IN
    SELECT id, store_id
    FROM public.fleet
    WHERE id = ANY(legacy_vehicle_ids)
  LOOP
    IF existing_vehicle.store_id <> 'store-lolas' THEN
      RAISE EXCEPTION
        'Test fleet seed aborted. Legacy vehicle % belongs to %, not store-lolas',
        existing_vehicle.id,
        existing_vehicle.store_id;
    END IF;

    FOR foreign_key IN
      SELECT
        constraint_row.conname,
        constraint_row.conrelid::regclass AS referencing_table,
        attribute_row.attname AS referencing_column
      FROM pg_constraint AS constraint_row
      JOIN pg_attribute AS attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = constraint_row.conkey[1]
      WHERE constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'public.fleet'::regclass
        AND array_length(constraint_row.conkey, 1) = 1
    LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
        foreign_key.referencing_table,
        foreign_key.referencing_column
      )
      INTO has_references
      USING existing_vehicle.id;

      IF has_references THEN
        RAISE EXCEPTION
          'Test fleet seed aborted. Legacy vehicle % is referenced by % (%); delete or reconcile that record explicitly first',
          existing_vehicle.id,
          foreign_key.referencing_table,
          foreign_key.conname;
      END IF;
    END LOOP;
  END LOOP;
END;
$seed_preflight$;

-- These are isolated staging test models. Upserting by their dedicated IDs
-- avoids modifying any differently identified production-like model records.
INSERT INTO public.vehicle_models (
  id, name, is_active, security_deposit, type, cc, max_pax, peace_of_mind_per_day
) VALUES
  ('model-honda-beat', 'Honda Beat', true, 3000.00, 'Scooter', 110, 2, 150.00),
  ('model-tuktuk-re', 'TukTuk (RE)', true, 5000.00, 'TukTuk', 250, 4, 250.00),
  ('model-tuktuk-tvs', 'TukTuk (TVS)', true, 5000.00, 'TukTuk', 200, 4, 250.00)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  security_deposit = EXCLUDED.security_deposit,
  type = EXCLUDED.type,
  cc = EXCLUDED.cc,
  max_pax = EXCLUDED.max_pax,
  peace_of_mind_per_day = EXCLUDED.peace_of_mind_per_day;

-- Delete only the two explicitly identified, unreferenced legacy staging
-- vehicles. A previous successful run already has all six canonical IDs and
-- is left in place.
DELETE FROM public.fleet
WHERE id IN (
  '34a74aff-3b60-47ac-a949-d55e224ec146',
  'a95d5a15-1c81-4f2d-880c-9e8b244d4d98'
);

-- All staging test units are Available so they can be selected in booking and
-- Xendit checkout tests. Local seed rows may use Active for operational UI tests.
INSERT INTO public.fleet (
  id, store_id, name, model_id, plate_number, status, current_mileage,
  surf_rack, owner, rentable_start_date
) VALUES
  ('vehicle-beat-001', 'store-lolas', 'Local Beat 1', 'model-honda-beat', 'TEST-BEAT-01', 'Available', 1000.0, false, 'Lola''s Rentals', DATE '2026-09-10'),
  ('vehicle-beat-002', 'store-lolas', 'Local Beat 2', 'model-honda-beat', 'TEST-BEAT-02', 'Available', 1200.0, true,  'Lola''s Rentals', DATE '2026-09-10'),
  ('vehicle-beat-003', 'store-lolas', 'Local Beat 3', 'model-honda-beat', 'TEST-BEAT-03', 'Available', 1400.0, false, 'Lola''s Rentals', DATE '2026-09-10'),
  ('vehicle-tuktuk-re-001', 'store-lolas', 'Local TukTuk RE 1', 'model-tuktuk-re', 'TEST-RE-01', 'Available', 2000.0, false, 'Lola''s Rentals', DATE '2026-09-10'),
  ('vehicle-tuktuk-re-002', 'store-lolas', 'Local TukTuk RE 2', 'model-tuktuk-re', 'TEST-RE-02', 'Available', 2200.0, false, 'Lola''s Rentals', DATE '2026-09-10'),
  ('vehicle-tuktuk-tvs-001', 'store-lolas', 'Local TukTuk TVS 1', 'model-tuktuk-tvs', 'TEST-TVS-01', 'Available', 1800.0, false, 'Lola''s Rentals', DATE '2026-09-10')
ON CONFLICT (id) DO UPDATE
SET
  store_id = EXCLUDED.store_id,
  name = EXCLUDED.name,
  model_id = EXCLUDED.model_id,
  plate_number = EXCLUDED.plate_number,
  status = EXCLUDED.status,
  current_mileage = EXCLUDED.current_mileage,
  surf_rack = EXCLUDED.surf_rack,
  owner = EXCLUDED.owner,
  rentable_start_date = EXCLUDED.rentable_start_date,
  updated_at = now();

DO $verify_seed$
BEGIN
  IF (SELECT count(*) FROM public.fleet) <> 6
     OR (SELECT count(*) FROM public.fleet WHERE id IN (
       'vehicle-beat-001',
       'vehicle-beat-002',
       'vehicle-beat-003',
       'vehicle-tuktuk-re-001',
       'vehicle-tuktuk-re-002',
       'vehicle-tuktuk-tvs-001'
     )) <> 6 THEN
    RAISE EXCEPTION 'Test fleet seed verification failed. Expected exactly six canonical test vehicles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fleet
    WHERE id IN (
      'vehicle-beat-001',
      'vehicle-beat-002',
      'vehicle-beat-003',
      'vehicle-tuktuk-re-001',
      'vehicle-tuktuk-re-002',
      'vehicle-tuktuk-tvs-001'
    )
      AND status <> 'Available'
  ) THEN
    RAISE EXCEPTION 'Test fleet seed verification failed. Every test vehicle must be Available';
  END IF;
END;
$verify_seed$;

COMMIT;
