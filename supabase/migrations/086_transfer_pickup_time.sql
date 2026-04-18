ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS pickup_time time NULL;
