-- ============================================================
-- ORDERS RAW — add web_quote_raw top-level column (V11-02)
-- ============================================================
-- Previously the server-computed quote for direct bookings was
-- stored only inside payload.web_quote (jsonb).  The inbox
-- SELECT excludes payload for performance, so the quote was
-- never returned and the inbox showed ₱0 / "—".
--
-- This migration promotes the value to a proper typed column
-- so it can be selected without fetching the full payload blob.
-- ============================================================

ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS web_quote_raw numeric(12,2);
