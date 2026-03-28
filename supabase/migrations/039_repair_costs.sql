-- Public repair cost reference for customer-facing Repairs page
CREATE TABLE IF NOT EXISTS repair_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type text NOT NULL,
  item text NOT NULL,
  cost_php numeric(12, 2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_repair_costs_vehicle_type ON repair_costs (vehicle_type);

INSERT INTO repair_costs (vehicle_type, item, cost_php, sort_order) VALUES
  ('honda_beat', 'Puncture repair', 150, 1),
  ('honda_beat', 'Mirror replacement', 250, 2),
  ('honda_beat', 'Indicator light', 200, 3),
  ('honda_beat', 'Brake lever', 350, 4),
  ('honda_beat', 'Full respray', 8000, 5),
  ('tuk_tuk', 'Puncture repair', 200, 1),
  ('tuk_tuk', 'Mirror replacement', 300, 2),
  ('tuk_tuk', 'Indicator light', 250, 3),
  ('tuk_tuk', 'Brake lever', 400, 4),
  ('tuk_tuk', 'Body panel / fairing', 2500, 5),
  ('tuk_tuk', 'Full respray', 12000, 6);
