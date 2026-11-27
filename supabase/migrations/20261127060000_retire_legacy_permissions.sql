-- ============================================================
-- Retire the permission keys replaced in 20261127050000_permissions_overhaul.
--
-- Apply only AFTER the API and web release that uses the split permissions
-- is live. Before that, the previous release still checks can_edit_settings
-- and can_view_fleet_book_value, and removing them would lock people out.
--
-- Roles already hold every replacement key (the overhaul migration verified
-- it), so this only removes the retired rows. permission_aliases stays, so
-- RLS policies that still name the retired keys keep working.
-- ============================================================

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(rp.role_id || ':' || a.permission, ', ') INTO missing
  FROM public.role_permissions rp
  JOIN public.permission_aliases a ON a.legacy_key = rp.permission
  WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions r2 WHERE r2.role_id = rp.role_id AND r2.permission = a.permission
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Roles are missing replacement permissions: %', missing;
  END IF;
END $$;

DELETE FROM public.role_permissions
WHERE permission IN (SELECT key FROM public.permissions WHERE deprecated);

UPDATE public.roles SET permissions_version = permissions_version + 1, updated_at = now();

DELETE FROM public.permissions WHERE deprecated;
