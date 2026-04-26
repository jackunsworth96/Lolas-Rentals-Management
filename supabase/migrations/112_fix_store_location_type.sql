-- Set location_type = 'store' for store pickup locations (zero delivery/collection cost).
-- All locations had location_type = '' (empty string), causing the basket page to always
-- show the address input fields even when the customer had selected the store.
UPDATE locations
SET location_type = 'store'
WHERE delivery_cost = 0
  AND collection_cost = 0;
