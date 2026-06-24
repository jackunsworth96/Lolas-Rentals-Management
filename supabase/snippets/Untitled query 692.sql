ALTER TABLE public.booking_sessions
  ADD COLUMN IF NOT EXISTS handoff_context jsonb;