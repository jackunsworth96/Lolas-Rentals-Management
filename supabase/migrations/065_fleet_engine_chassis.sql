ALTER TABLE fleet
  ADD COLUMN IF NOT EXISTS engine_number  text,
  ADD COLUMN IF NOT EXISTS chassis_number text;
