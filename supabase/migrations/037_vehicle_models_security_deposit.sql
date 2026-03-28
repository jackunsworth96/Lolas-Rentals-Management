-- Refundable security deposit shown to customers (e.g. WooCommerce); not part of rental grand total.
ALTER TABLE public.vehicle_models
  ADD COLUMN IF NOT EXISTS security_deposit numeric(12,2) NOT NULL DEFAULT 0;
