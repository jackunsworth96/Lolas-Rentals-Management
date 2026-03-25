-- Clean up fleet_statuses: remove incorrectly inserted vehicle data
-- and populate with the actual status definitions.
DELETE FROM fleet_statuses;

INSERT INTO fleet_statuses (id, name, is_rentable) VALUES
  ('available',         'Available',         true),
  ('active',            'Active',            false),
  ('under_maintenance', 'Under Maintenance', false),
  ('sold',              'Sold',              false),
  ('service_vehicle',   'Service Vehicle',   false),
  ('closed',            'Closed',            false),
  ('pending_orcr',      'Pending ORCR',      false);
