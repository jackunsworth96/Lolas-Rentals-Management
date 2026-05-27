-- ============================================================
-- 141: Add motivations column to partner_enrollment_details
-- Stores comma-separated motivation tags submitted via the
-- Step 1 enrollment form checkboxes.
-- ============================================================

ALTER TABLE public.partner_enrollment_details
  ADD COLUMN IF NOT EXISTS motivations text;
