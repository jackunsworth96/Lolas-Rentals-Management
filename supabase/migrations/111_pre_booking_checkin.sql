-- Add customer_id to waivers so they can exist before a booking is created.
ALTER TABLE waivers ADD COLUMN customer_id text REFERENCES customers(id);

-- Make order_reference nullable — a waiver captured pre-booking has no reference yet.
ALTER TABLE waivers ALTER COLUMN order_reference DROP NOT NULL;

-- Guard: every waiver must have at least one of order_reference or customer_id.
ALTER TABLE waivers ADD CONSTRAINT waivers_reference_or_customer
  CHECK (order_reference IS NOT NULL OR customer_id IS NOT NULL);

-- Add customer_id to inspections so they can exist before a booking is created.
ALTER TABLE inspections ADD COLUMN customer_id text REFERENCES customers(id);

-- Indexes for fast customer-level lookups.
CREATE INDEX waivers_customer_id_idx ON waivers(customer_id);
CREATE INDEX inspections_customer_id_idx ON inspections(customer_id);
