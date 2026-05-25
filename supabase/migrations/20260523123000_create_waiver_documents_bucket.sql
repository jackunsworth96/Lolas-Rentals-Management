-- Provision the private storage bucket used by public waiver uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('waiver-documents', 'waiver-documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated read waiver-documents'
  ) THEN
    CREATE POLICY "Authenticated read waiver-documents"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'waiver-documents');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated upload waiver-documents'
  ) THEN
    CREATE POLICY "Authenticated upload waiver-documents"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'waiver-documents');
  END IF;
END $$;