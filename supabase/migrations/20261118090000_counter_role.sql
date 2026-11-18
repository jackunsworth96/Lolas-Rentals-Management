-- Reception tablet login. The role carries only can_use_counter, so the tablet can
-- create walk-in bookings and nothing else. Assign it to a dedicated tablet user.
INSERT INTO roles (id, name)
VALUES ('role-counter', 'Counter tablet')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission)
VALUES ('role-counter', 'can_use_counter')
ON CONFLICT (role_id, permission) DO NOTHING;

-- Walk-ins the customer entered themselves on the tablet, so the inbox can show
-- that someone is waiting at reception.
ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS via_counter boolean NOT NULL DEFAULT false;
