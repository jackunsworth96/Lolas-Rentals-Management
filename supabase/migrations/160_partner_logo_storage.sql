-- ============================================================
-- 160: Partner logo storage bucket
-- Public bucket for accommodation partner logos uploaded from
-- the back office. Files are limited to 5 MB and image MIME types.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partner-logos',
  'partner-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS partner_logos_public_read ON storage.objects;
CREATE POLICY partner_logos_public_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'partner-logos');

DROP POLICY IF EXISTS partner_logos_authenticated_insert ON storage.objects;
CREATE POLICY partner_logos_authenticated_insert
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'partner-logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS partner_logos_authenticated_update ON storage.objects;
CREATE POLICY partner_logos_authenticated_update
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'partner-logos' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'partner-logos' AND auth.role() = 'authenticated');
