-- ============================================================
-- Enable commission_includes_extensions for Bravo Beach Resort.
--
-- Extensions on Bravo-attributed bookings will now be tracked:
--   - Collected extension amounts contribute to confirmed commission.
--   - Pending (uncollected) extension amounts show as pending
--     commission on the partner portal until payment is received.
-- ============================================================

UPDATE accommodation_partners
SET commission_includes_extensions = true
WHERE slug = 'bravo';
