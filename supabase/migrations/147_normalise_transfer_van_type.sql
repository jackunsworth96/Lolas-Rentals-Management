-- Normalise van_type values in the transfers table to canonical snake_case.
-- Some records were created via the admin UI (storing 'Shared', 'Shared Van', etc.)
-- while public bookings stored 'shared_van'. This migration aligns all records.

UPDATE public.transfers
SET van_type = CASE
  WHEN lower(replace(replace(van_type, ' ', ''), '_', '')) IN ('shared', 'sharedvan') THEN 'shared_van'
  WHEN lower(replace(replace(van_type, ' ', ''), '_', '')) IN ('private', 'privatevan') THEN 'private_van'
  WHEN lower(replace(replace(van_type, ' ', ''), '_', '')) IN ('tuktuk', 'privatetuktuk') THEN 'tuktuk'
  ELSE van_type
END
WHERE van_type IS NOT NULL
  AND van_type NOT IN ('shared_van', 'private_van', 'tuktuk');
