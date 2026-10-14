-- Old Honda Beat V2 and Yamaha Mio units are no longer rented, but were still
-- status Available, so utilization counted them as a zero-revenue fleet.
-- A few others already have a sale date and were left as Available.

-- These units sit on BASS Bikes, which is archived (stores.is_active = false).
-- The archive trigger blocks ordinary writes; this correction does not reopen the store.
ALTER TABLE fleet DISABLE TRIGGER reject_archived_store_write_fleet;

INSERT INTO fleet_statuses (id, name, is_rentable)
VALUES ('retired', 'Retired', false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_rentable = EXCLUDED.is_rentable;

UPDATE fleet
SET status = 'Retired'
WHERE id IN ('VEH20', 'VEH18', 'VEH03', 'VEH08', 'VEH04', 'VEH05')
  AND name IN ('Amber', 'Cardo', 'Kimchi', 'Naomi', 'Angus', 'Peggy')
  AND status = 'Available'
  AND date_sold IS NULL;

UPDATE fleet
SET status = 'Sold'
WHERE id IN ('VEH19', 'VEH09', 'VEH07', 'VEH01', 'VEH06')
  AND name IN ('Chicken', 'Frye', 'Boris', 'Edith', 'Gertrude')
  AND status = 'Available'
  AND date_sold IS NOT NULL;

-- Deferred allocation triggers are still pending; they have to run before the
-- trigger can be turned back on in this same transaction.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE fleet ENABLE TRIGGER reject_archived_store_write_fleet;
