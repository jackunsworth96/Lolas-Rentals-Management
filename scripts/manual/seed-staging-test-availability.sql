-- Staging-only availability configuration seed for Lola's Rentals.
--
-- Run this after seed-staging-test-fleet.sql. It creates the fleet-status
-- rules and daily-rate tiers required for the six test vehicles to appear in
-- public booking availability. It does not create bookings, holds, or blockout
-- periods; absence of those records is what makes the units available.
--
-- Run explicitly in the Supabase SQL Editor or with:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/manual/seed-staging-test-availability.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtext('lolas_staging_test_availability_v1'));
LOCK TABLE public.fleet_statuses IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.vehicle_model_pricing IN SHARE ROW EXCLUSIVE MODE;

DO $availability_preflight$
DECLARE
  required_model_ids text[] := ARRAY[
    'model-honda-beat',
    'model-tuktuk-re',
    'model-tuktuk-tvs'
  ];
  required_vehicle_ids text[] := ARRAY[
    'vehicle-beat-001',
    'vehicle-beat-002',
    'vehicle-beat-003',
    'vehicle-tuktuk-re-001',
    'vehicle-tuktuk-re-002',
    'vehicle-tuktuk-tvs-001'
  ];
BEGIN
  IF to_regclass('public.fleet_statuses') IS NULL
     OR to_regclass('public.vehicle_model_pricing') IS NULL
     OR to_regclass('public.vehicle_models') IS NULL
     OR to_regclass('public.fleet') IS NULL THEN
    RAISE EXCEPTION 'Availability seed aborted. Required availability tables are missing';
  END IF;

  IF (SELECT count(*) FROM public.vehicle_models WHERE id = ANY(required_model_ids))
     <> cardinality(required_model_ids) THEN
    RAISE EXCEPTION 'Availability seed aborted. Run seed-staging-test-fleet.sql first; required test vehicle models are missing';
  END IF;

  IF (SELECT count(*) FROM public.fleet WHERE id = ANY(required_vehicle_ids))
     <> cardinality(required_vehicle_ids) THEN
    RAISE EXCEPTION 'Availability seed aborted. Run seed-staging-test-fleet.sql first; required test vehicles are missing';
  END IF;
END;
$availability_preflight$;

INSERT INTO public.fleet_statuses (id, name, is_rentable) VALUES
  ('active', 'Active', false),
  ('available', 'Available', true),
  ('closed', 'Closed', false),
  ('pending_orcr', 'Pending ORCR', false),
  ('service_vehicle', 'Service Vehicle', false),
  ('sold', 'Sold', false),
  ('under_maintenance', 'Under Maintenance', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    is_rentable = EXCLUDED.is_rentable;

INSERT INTO public.vehicle_model_pricing (
  model_id, store_id, min_days, max_days, daily_rate
) VALUES
  ('model-honda-beat', 'store-lolas', 1, 3, 500.00),
  ('model-honda-beat', 'store-lolas', 4, 6, 450.00),
  ('model-honda-beat', 'store-lolas', 7, 999, 400.00),
  ('model-tuktuk-re', 'store-lolas', 1, 3, 1200.00),
  ('model-tuktuk-re', 'store-lolas', 4, 6, 1100.00),
  ('model-tuktuk-re', 'store-lolas', 7, 999, 1000.00),
  ('model-tuktuk-tvs', 'store-lolas', 1, 3, 1100.00),
  ('model-tuktuk-tvs', 'store-lolas', 4, 6, 1000.00),
  ('model-tuktuk-tvs', 'store-lolas', 7, 999, 900.00)
ON CONFLICT (model_id, store_id, min_days) DO UPDATE
SET max_days = EXCLUDED.max_days,
    daily_rate = EXCLUDED.daily_rate;

DO $verify_availability$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.fleet_statuses
    WHERE id = 'available'
      AND name = 'Available'
      AND is_rentable = true
  ) THEN
    RAISE EXCEPTION 'Availability seed verification failed. Available is not configured as a rentable status';
  END IF;

  IF (SELECT count(*) FROM public.vehicle_model_pricing
      WHERE store_id = 'store-lolas'
        AND model_id IN ('model-honda-beat', 'model-tuktuk-re', 'model-tuktuk-tvs')) <> 9 THEN
    RAISE EXCEPTION 'Availability seed verification failed. Expected nine daily-rate tiers';
  END IF;

  IF (SELECT count(*) FROM public.fleet
      WHERE id IN (
        'vehicle-beat-001',
        'vehicle-beat-002',
        'vehicle-beat-003',
        'vehicle-tuktuk-re-001',
        'vehicle-tuktuk-re-002',
        'vehicle-tuktuk-tvs-001'
      )
        AND status = 'Available') <> 6 THEN
    RAISE EXCEPTION 'Availability seed verification failed. All six test vehicles must be Available';
  END IF;
END;
$verify_availability$;

-- Configuration-level availability diagnostic. Booking-time availability also
-- excludes overlapping active orders, holds, and fleet-unavailability periods.
SELECT
  vehicle_models.name AS vehicle_model,
  count(*) AS rentable_test_units
FROM public.fleet
JOIN public.vehicle_models ON vehicle_models.id = fleet.model_id
JOIN public.fleet_statuses
  ON lower(fleet_statuses.id) = lower(fleet.status)
  OR lower(fleet_statuses.name) = lower(fleet.status)
WHERE fleet.id IN (
  'vehicle-beat-001',
  'vehicle-beat-002',
  'vehicle-beat-003',
  'vehicle-tuktuk-re-001',
  'vehicle-tuktuk-re-002',
  'vehicle-tuktuk-tvs-001'
)
  AND fleet_statuses.is_rentable = true
GROUP BY vehicle_models.name
ORDER BY vehicle_models.name;

COMMIT;
