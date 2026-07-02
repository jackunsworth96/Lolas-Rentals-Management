-- Allow partners to restrict free delivery to specific pickup/dropoff locations.
-- When NULL (the default) the existing behaviour is preserved: free delivery
-- applies to all locations. When populated, both the pickup and dropoff location
-- IDs must be in the array for delivery fees to be waived.

ALTER TABLE accommodation_partners
  ADD COLUMN free_delivery_location_ids integer[] NULL;
