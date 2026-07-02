-- Per-vehicle deal term overrides for accommodation partners.
-- Each row lets staff configure a different deal (commission rate, discount, free
-- delivery) for a specific vehicle model under a given partner. When a booking is
-- made via a partner link the system checks for a matching override first; if none
-- exists it falls back to the global terms on accommodation_partners.

CREATE TABLE partner_vehicle_terms (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                  uuid        NOT NULL REFERENCES accommodation_partners(id) ON DELETE CASCADE,
  vehicle_model_id            text        NOT NULL REFERENCES vehicle_models(id),
  deal_type                   text        NOT NULL CHECK (deal_type IN (
                                            'commission','discount','free_delivery',
                                            'combined','commission_delivery','discount_delivery')),
  commission_type             text        CHECK (commission_type IN ('fixed','percentage')),
  commission_value            numeric(10,2),
  advance_booking_days        integer,
  commission_includes_extensions boolean  NOT NULL DEFAULT false,
  discount_type               text        CHECK (discount_type IN ('percentage','fixed')),
  discount_value              numeric(10,2),
  advance_discount_days       integer,
  early_bird_days             integer,
  early_bird_discount_value   numeric(10,2),
  free_delivery               boolean     NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, vehicle_model_id)
);

ALTER TABLE partner_vehicle_terms ENABLE ROW LEVEL SECURITY;

-- Authenticated staff have full access
CREATE POLICY "staff_all_partner_vehicle_terms"
  ON partner_vehicle_terms
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Anon cannot select directly; the API uses a service-role client
