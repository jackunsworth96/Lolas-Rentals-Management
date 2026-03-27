-- Add receipt_url column to paw_card_entries
ALTER TABLE paw_card_entries ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Create Supabase Storage bucket for receipt photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('paw-card-receipts', 'paw-card-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read receipt images (public bucket)
CREATE POLICY "Public read paw-card-receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'paw-card-receipts');

-- Allow anyone to upload receipt images (paw card is public, no auth)
CREATE POLICY "Public upload paw-card-receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'paw-card-receipts');
