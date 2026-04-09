CREATE TABLE inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text REFERENCES stores(id),
  name text NOT NULL,
  item_type text NOT NULL DEFAULT 'accepted_issue'
    CHECK (item_type IN (
      'accepted_issue',
      'accepted_issue_qty',
      'accepted_issue_na',
      'accepted_issue_declined'
    )),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text REFERENCES orders(id),
  order_reference text NOT NULL,
  store_id text NOT NULL REFERENCES stores(id),
  vehicle_id text REFERENCES fleet(id),
  vehicle_name text,
  employee_id text REFERENCES employees(id),
  km_reading text,
  damage_notes text,
  helmet_numbers text,
  customer_signature_url text,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inspection_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id)
    ON DELETE CASCADE,
  inspection_item_id uuid REFERENCES inspection_items(id),
  item_name text NOT NULL,
  result text NOT NULL
    CHECK (result IN (
      'accepted', 'issue_noted', 'na', 'declined'
    )),
  qty integer,
  notes text,
  log_maintenance boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX inspections_order_id_idx ON inspections(order_id);
CREATE INDEX inspections_order_reference_idx
  ON inspections(order_reference);
CREATE INDEX inspection_results_inspection_id_idx
  ON inspection_results(inspection_id);

-- Updated at triggers
CREATE TRIGGER inspection_items_updated_at
  BEFORE UPDATE ON inspection_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspection_items_read ON inspection_items
  FOR SELECT USING (
    store_id IS NULL OR store_id = ANY(user_store_ids())
  );
CREATE POLICY inspection_items_write ON inspection_items
  FOR ALL USING (has_permission('can_edit_settings'));

CREATE POLICY inspections_read ON inspections
  FOR SELECT USING (store_id = ANY(user_store_ids()));
CREATE POLICY inspections_write ON inspections
  FOR ALL USING (store_id = ANY(user_store_ids()));

CREATE POLICY inspection_results_read ON inspection_results
  FOR SELECT USING (true);
CREATE POLICY inspection_results_write ON inspection_results
  FOR ALL USING (true);

-- Seed default inspection items (Honda Beat standard)
INSERT INTO inspection_items
  (name, item_type, sort_order, store_id) VALUES
  ('Front Tyre', 'accepted_issue', 1, null),
  ('Rear Tyre', 'accepted_issue', 2, null),
  ('No Tyre Cracks', 'accepted_issue', 3, null),
  ('Engine Start', 'accepted_issue', 4, null),
  ('Kick Start', 'accepted_issue', 5, null),
  ('Front Light', 'accepted_issue', 6, null),
  ('High Beam Light', 'accepted_issue', 7, null),
  ('Front Right Indicator', 'accepted_issue', 8, null),
  ('Front Left Indicator', 'accepted_issue', 9, null),
  ('Rear Right Indicator', 'accepted_issue', 10, null),
  ('Rear Left Indicator', 'accepted_issue', 11, null),
  ('Horn', 'accepted_issue', 12, null),
  ('Brake Light', 'accepted_issue', 13, null),
  ('Brake Tension', 'accepted_issue', 14, null),
  ('Handle Bars', 'accepted_issue', 15, null),
  ('Mirrors', 'accepted_issue', 16, null),
  ('Rear Reflector', 'accepted_issue', 17, null),
  ('Full Tank', 'accepted_issue', 18, null),
  ('Bike Papers', 'accepted_issue', 19, null),
  ('Rain Coat', 'accepted_issue_qty', 20, null),
  ('ICC Helmets', 'accepted_issue_qty', 21, null),
  ('How to Secure the Helmet', 'accepted_issue', 22, null),
  ('Seat Cloth', 'accepted_issue_declined', 23, null),
  ('5L Dry Bag', 'accepted_issue_declined', 24, null),
  ('Sealant', 'accepted_issue_declined', 25, null),
  ('First Aid Kit', 'accepted_issue_declined', 26, null),
  ('Surf Rack (safely installed)', 'accepted_issue_na', 27, null),
  ('Road Clearance & Parking Informed', 'accepted_issue', 28, null);
