-- Add a flag to control whether a payment method appears on the customer booking website.
-- Defaults to true so existing methods remain visible; set false to hide internal-only methods.
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS show_on_customer_website boolean NOT NULL DEFAULT true;

-- Hide the legacy "Pre Paid (Prior System)" method from the customer website.
UPDATE payment_methods
  SET show_on_customer_website = false
  WHERE name ILIKE '%Prior System%';
