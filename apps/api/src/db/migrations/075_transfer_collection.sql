-- Migration 075: Add collection tracking columns to transfers table
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS collected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS collected_amount numeric(10,2) NULL;
