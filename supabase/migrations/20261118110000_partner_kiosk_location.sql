-- Where we hand over vehicles booked on a partner's front-desk tablet.
-- The kiosk refuses bookings until this is set.
ALTER TABLE accommodation_partners
  ADD COLUMN IF NOT EXISTS kiosk_location_id integer REFERENCES locations(id) ON DELETE SET NULL;
