-- Maintenance odometer readings can update fleet mileage, alongside inspections and manual edits.

ALTER TABLE public.fleet_mileage_events
  ADD COLUMN IF NOT EXISTS maintenance_id text REFERENCES public.maintenance(id) ON DELETE CASCADE;

ALTER TABLE public.fleet_mileage_events DROP CONSTRAINT IF EXISTS fleet_mileage_events_source_check;
ALTER TABLE public.fleet_mileage_events DROP CONSTRAINT IF EXISTS fleet_mileage_events_source_shape;

-- The original source list was an unnamed column check. Drop whichever check still limits source.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.fleet_mileage_events'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.fleet_mileage_events DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.fleet_mileage_events
  ADD CONSTRAINT fleet_mileage_events_source_check
  CHECK (source IN ('manual', 'inspection', 'maintenance'));

ALTER TABLE public.fleet_mileage_events
  ADD CONSTRAINT fleet_mileage_events_source_shape CHECK (
    (source = 'inspection' AND inspection_id IS NOT NULL AND maintenance_id IS NULL AND reason IS NULL)
    OR (source = 'manual' AND inspection_id IS NULL AND maintenance_id IS NULL)
    OR (source = 'maintenance' AND maintenance_id IS NOT NULL AND inspection_id IS NULL AND reason IS NULL)
  );
