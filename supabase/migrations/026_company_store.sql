-- Company-wide store record for shared accounts (GCash, safe, bank accounts, etc.)
-- booking_token is NOT NULL + UNIQUE (see 019_store_booking_token.sql); company is not used for public booking.
INSERT INTO stores (id, name, is_active, booking_token)
SELECT
  'company',
  'Company (All Stores)',
  true,
  'company-' || encode(gen_random_bytes(16), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE id = 'company');
