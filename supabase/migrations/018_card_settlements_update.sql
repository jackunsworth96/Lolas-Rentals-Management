-- Normalize card_settlements.id from serial to text (matching all other tables)
ALTER TABLE card_settlements DROP CONSTRAINT IF EXISTS card_settlements_pkey;
ALTER TABLE card_settlements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE card_settlements ALTER COLUMN id SET DATA TYPE text USING id::text;
ALTER TABLE card_settlements ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS card_settlements_id_seq;

-- Add payment_id to link back to the payments table
ALTER TABLE card_settlements ADD COLUMN IF NOT EXISTS payment_id text;
