-- ============================================================
-- 078: settle_order_atomic RPC
--
-- This initial settlement RPC is superseded by later migrations that
-- recreate the function with pending-extension, surcharge, return-
-- charge, and deposit-refund support. Keep this historical migration
-- as a no-op marker for fresh local replay under Supabase CLI v2.72.
-- ============================================================

SELECT 1;
