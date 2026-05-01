-- Migration 126: Transfer pickup rules table and flight number column.
--
-- Creates transfer_pickup_rules to store:
--   - Bracket-based lookup rules for shared_van (outbound): floor the flight
--     departure hour and return the matching pickup window.
--   - Offset-based rules for private_van and tuktuk (outbound): single pickup
--     time calculated as flight time + offset_mins (negative = before flight).
-- Inbound transfers always use the exact arrival time (no rule needed).
--
-- Also adds flight_number text to transfers for display in emails and
-- Telegram driver alerts.

-- ─── transfer_pickup_rules ───────────────────────────────────────────────────

CREATE TABLE public.transfer_pickup_rules (
  id           serial  PRIMARY KEY,
  vehicle_type text    NOT NULL,
  direction    text    NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  rule_type    text    NOT NULL CHECK (rule_type IN ('bracket', 'offset')),
  -- bracket rules: flight_hour is the floored PHT departure hour (6–17)
  flight_hour  integer,
  pickup_from  time,   -- bracket window start, e.g. '04:00'
  pickup_to    time,   -- bracket window end,   e.g. '04:30' (NULL = no window)
  -- offset rules: minutes relative to flight time (negative = before)
  offset_mins  integer,
  is_active    boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_pickup_rule UNIQUE (vehicle_type, direction, rule_type, flight_hour)
);

COMMENT ON TABLE public.transfer_pickup_rules IS
  'Stores pickup time rules for airport transfers. Bracket rules apply to shared '
  'van outbound trips; offset rules apply to private van and tuktuk outbound trips.';

ALTER TABLE public.transfer_pickup_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read pickup rules"
  ON public.transfer_pickup_rules FOR SELECT
  TO authenticated USING (true);

-- ─── Seed: shared_van outbound bracket rules ──────────────────────────────────
--
-- Logic: floor the PHT departure hour, look up this table.
-- A 6:50 am flight → floor to 6 → pickup 04:00–04:30.
-- A 1:05 pm flight → floor to 13 → pickup 10:30–11:00.

INSERT INTO public.transfer_pickup_rules
  (vehicle_type, direction, rule_type, flight_hour, pickup_from, pickup_to)
VALUES
  ('shared_van', 'outbound', 'bracket',  6, '04:00', '04:30'),
  ('shared_van', 'outbound', 'bracket',  7, '05:00', '05:30'),
  ('shared_van', 'outbound', 'bracket',  8, '06:00', '06:30'),
  ('shared_van', 'outbound', 'bracket',  9, '07:00', '07:30'),
  ('shared_van', 'outbound', 'bracket', 10, '08:00', '08:30'),
  ('shared_van', 'outbound', 'bracket', 11, '09:00', '09:30'),
  ('shared_van', 'outbound', 'bracket', 12, '10:00', '10:30'),
  ('shared_van', 'outbound', 'bracket', 13, '10:30', '11:00'),
  ('shared_van', 'outbound', 'bracket', 14, '11:30', '12:00'),
  ('shared_van', 'outbound', 'bracket', 15, '12:30', '13:00'),
  ('shared_van', 'outbound', 'bracket', 16, '13:30', '14:00'),
  ('shared_van', 'outbound', 'bracket', 17, '14:00', '14:30');

-- ─── Seed: private_van and tuktuk outbound offset rules ───────────────────────
--
-- Single pickup time = flight departure time + offset_mins (−90 = 90 min before).

INSERT INTO public.transfer_pickup_rules
  (vehicle_type, direction, rule_type, offset_mins)
VALUES
  ('private_van', 'outbound', 'offset', -90),
  ('tuktuk',      'outbound', 'offset', -90);

-- ─── Add flight_number column to transfers ────────────────────────────────────

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS flight_number text;
