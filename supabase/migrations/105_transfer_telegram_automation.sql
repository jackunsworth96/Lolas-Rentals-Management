-- Migration 105: Telegram driver-channel automation for transfers.
-- Adds columns needed to store calculated pickup windows, the Telegram
-- message ID returned after posting, and driver confirmation state.
--
-- NOTE: pickup_time (time) already exists from migration 086.
-- pickup_time_end stores the upper bound for shared-van windows only.

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS pickup_time_end     time,
  ADD COLUMN IF NOT EXISTS telegram_message_id text,
  ADD COLUMN IF NOT EXISTS driver_confirmed    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_confirmed_at timestamptz;
