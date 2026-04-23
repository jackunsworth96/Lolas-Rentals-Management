-- Migration 101: Add dropoff_location_note to orders
-- Stores a free-text meeting-point note for non-store dropoff locations
-- (e.g. "Bravo Resort" when the dropoff location is "General Luna").
-- Editable from both the Inbox processing modal and the active order detail.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropoff_location_note text;
