ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reviewer_role text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
