-- Allow security deposits to be collected by Wise. Wise deposits stay on the Wise
-- account (routed for store-lolas) rather than the cash envelope.
UPDATE public.payment_methods
SET is_deposit_eligible = true
WHERE id = 'Wise';
