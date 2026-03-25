ALTER TABLE payment_methods
  ADD COLUMN surcharge_percent numeric(5,2) NOT NULL DEFAULT 0;
