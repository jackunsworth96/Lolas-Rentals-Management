ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS booking_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_booking_enabled boolean NOT NULL DEFAULT false;

UPDATE stores
SET booking_token = encode(gen_random_bytes(16), 'hex')
WHERE booking_token IS NULL;

ALTER TABLE stores ALTER COLUMN booking_token SET NOT NULL;
