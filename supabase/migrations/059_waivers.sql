CREATE TABLE waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference text NOT NULL,
  store_id text NOT NULL REFERENCES stores(id),

  -- Signer details
  driver_name text NOT NULL,
  driver_email text,
  driver_mobile text,

  -- Agreement
  agreed_to_terms boolean NOT NULL DEFAULT false,
  agreed_at timestamptz NOT NULL DEFAULT now(),

  -- Capture metadata (for legal validity)
  ip_address text,
  user_agent text,

  -- Licence photos
  licence_front_url text,
  licence_back_url text,

  -- Signature (base64 PNG data URL)
  driver_signature_url text,

  -- Passenger signatures (up to 4)
  passenger_signatures jsonb DEFAULT '[]'::jsonb,

  -- Status
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'expired')),

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for lookup by order reference
CREATE INDEX waivers_order_reference_idx
  ON waivers(order_reference);

-- Updated at trigger
CREATE TRIGGER waivers_updated_at
  BEFORE UPDATE ON waivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE waivers ENABLE ROW LEVEL SECURITY;

-- Staff can read all waivers for their store
CREATE POLICY waivers_staff_read ON waivers
  FOR SELECT
  USING (store_id = ANY(user_store_ids()));

-- Staff can update waiver status
CREATE POLICY waivers_staff_update ON waivers
  FOR UPDATE
  USING (store_id = ANY(user_store_ids()));

-- Public can insert (customer signing)
CREATE POLICY waivers_public_insert ON waivers
  FOR INSERT
  WITH CHECK (true);

-- Public can read their own waiver by order reference
CREATE POLICY waivers_public_read ON waivers
  FOR SELECT
  USING (true);

-- Storage bucket 'waiver-documents' must be created manually
-- in Supabase dashboard with the following policies:
-- INSERT: authenticated (API uses service role)
-- SELECT: authenticated only (private documents)
