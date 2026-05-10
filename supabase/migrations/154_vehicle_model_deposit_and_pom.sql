-- 153 had the wrong model name for TukTuk — re-run with the correct name.
UPDATE vehicle_models SET type = 'scooter', cc = 110, max_pax = 2 WHERE name = 'Honda Beat';
UPDATE vehicle_models SET type = 'tuktuk',  cc = 250, max_pax = 4 WHERE name = 'TukTuk (RE)';

-- Security deposits (column exists from migration 037; values were never set).
UPDATE vehicle_models SET security_deposit = 1000 WHERE name = 'Honda Beat';
UPDATE vehicle_models SET security_deposit = 2000 WHERE name = 'TukTuk (RE)';

-- Per-vehicle peace-of-mind daily rate for the respond.io fleet endpoint.
ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS peace_of_mind_per_day numeric(12,2);

UPDATE vehicle_models SET peace_of_mind_per_day = 95  WHERE name = 'Honda Beat';
UPDATE vehicle_models SET peace_of_mind_per_day = 200 WHERE name = 'TukTuk (RE)';
