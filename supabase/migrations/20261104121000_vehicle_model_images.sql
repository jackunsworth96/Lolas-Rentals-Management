-- ============================================================
-- Vehicle model pictures managed from Settings, plus a public
-- bucket for images uploaded from the back office (vehicle
-- pictures and paw card partner logos). The browser resizes and
-- compresses images before upload, so files stay small.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-images',
  'site-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.vehicle_model_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     text NOT NULL REFERENCES public.vehicle_models(id) ON DELETE CASCADE,
  url          text NOT NULL,
  storage_path text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_by   text REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_model_images_model_idx
  ON public.vehicle_model_images (model_id, sort_order);

ALTER TABLE public.vehicle_model_images ENABLE ROW LEVEL SECURITY;
