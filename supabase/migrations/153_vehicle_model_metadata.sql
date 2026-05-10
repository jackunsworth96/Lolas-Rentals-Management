ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS type    text,
  ADD COLUMN IF NOT EXISTS cc      integer,
  ADD COLUMN IF NOT EXISTS max_pax integer;

UPDATE vehicle_models SET type = 'scooter', cc = 110, max_pax = 2 WHERE name = 'Honda Beat';
UPDATE vehicle_models SET type = 'tuktuk',  cc = 250, max_pax = 4 WHERE name = 'Bajaj RE TukTuk';
