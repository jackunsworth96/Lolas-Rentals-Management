-- TVS King (Bogart) was reactivated for back-office booking with no model type.
-- Capacity reservation joins vehicle_models.type to partner_allocation_type_map
-- and rejects the booking when that join misses.

UPDATE public.vehicle_models
SET type = 'tuktuk'
WHERE id = 'TVS King TukTuk'
  AND type IS NULL;
