-- ============================================================
-- 077: process_raw_order_atomic RPC
--
-- This historical definition is superseded by migration 090, which
-- recreates the same RPC with the ambiguous order_id fix. Supabase CLI
-- v2.72 can misparse the original multi-statement function/grant file
-- during fresh local replay, so keep this migration as a no-op marker
-- and let 090 install the canonical function.
-- ============================================================

SELECT 1;
