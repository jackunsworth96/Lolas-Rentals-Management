-- ============================================================
-- Before/after access snapshot for the permissions overhaul rollout.
--
-- 1. Run STEP 1 just before applying 20261127050000_permissions_overhaul.
-- 2. Apply the migration, then run STEP 2. It must return no rows.
-- 3. After 20261127060000_retire_legacy_permissions, run STEP 2 again.
--    Retired keys are fine as long as every replacement is present.
-- 4. Run STEP 3 once you are happy.
-- ============================================================

-- ── STEP 1: take the snapshot ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._access_snapshot_before AS
SELECT
  u.id::text      AS user_id,
  u.username,
  u.role_id,
  u.is_active,
  coalesce(array_agg(rp.permission ORDER BY rp.permission) FILTER (WHERE rp.permission IS NOT NULL), '{}') AS permissions,
  now()           AS taken_at
FROM public.users u
LEFT JOIN public.role_permissions rp ON rp.role_id = u.role_id
GROUP BY u.id, u.username, u.role_id, u.is_active;

ALTER TABLE public._access_snapshot_before ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._access_snapshot_before FROM anon, authenticated;

SELECT count(*) AS users_snapshotted FROM public._access_snapshot_before;


-- ── STEP 2: compare (expect zero rows) ──────────────────────────────────────
-- Lists anyone who lost a permission, changed role or changed active status.
-- New permissions from the split backfill are expected and not listed.
WITH after AS (
  SELECT
    u.id::text AS user_id,
    u.role_id,
    u.is_active,
    coalesce(array_agg(rp.permission) FILTER (WHERE rp.permission IS NOT NULL), '{}') AS permissions
  FROM public.users u
  LEFT JOIN public.role_permissions rp ON rp.role_id = u.role_id
  GROUP BY u.id, u.role_id, u.is_active
),
lost AS (
  SELECT b.user_id, k AS permission
  FROM public._access_snapshot_before b
  CROSS JOIN LATERAL unnest(b.permissions) AS k
  JOIN after a ON a.user_id = b.user_id
  WHERE NOT (k = ANY (a.permissions))
    -- A retired key is covered when every key that replaced it is held.
    AND NOT (
      to_regclass('public.permission_aliases') IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.permission_aliases pa WHERE pa.legacy_key = k)
      AND NOT EXISTS (
        SELECT 1 FROM public.permission_aliases pa
        WHERE pa.legacy_key = k AND NOT (pa.permission = ANY (a.permissions))
      )
    )
)
SELECT b.username, b.role_id AS role_before, a.role_id AS role_after,
       b.is_active AS active_before, a.is_active AS active_after,
       (SELECT array_agg(l.permission ORDER BY l.permission) FROM lost l WHERE l.user_id = b.user_id) AS lost_permissions
FROM public._access_snapshot_before b
LEFT JOIN after a ON a.user_id = b.user_id
WHERE a.user_id IS NULL
   OR a.role_id IS DISTINCT FROM b.role_id
   OR a.is_active IS DISTINCT FROM b.is_active
   OR EXISTS (SELECT 1 FROM lost l WHERE l.user_id = b.user_id)
ORDER BY b.username;


-- ── STEP 3: clean up ────────────────────────────────────────────────────────
-- DROP TABLE public._access_snapshot_before;
