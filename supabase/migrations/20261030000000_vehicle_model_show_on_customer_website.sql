-- Vehicle models can be "active" (bookable at all, including by back-office staff
-- via Walk-in / Reserve-later) while being hidden from the customer-facing booking
-- website and partner portal. Mirrors payment_methods.show_on_customer_website
-- (migration 107).
ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS show_on_customer_website boolean NOT NULL DEFAULT true;

-- Bogart (TVS King TukTuk) is rented only occasionally, at a discount, while
-- customers are swapped onto the newer TukTuk once it's available. Turn the
-- model back on (so it's bookable at all) but keep it off the public website —
-- staff can still book it via Walk-in / Reserve for later in the back office.
UPDATE vehicle_models
  SET is_active = true,
      show_on_customer_website = false
  WHERE id = 'TVS King TukTuk';

-- Bogart itself was marked Closed, which excludes it from every booking picker
-- regardless of its model. Restore it to Available so staff can select it again.
UPDATE fleet
  SET status = 'Available'
  WHERE id = 'VEH21';
