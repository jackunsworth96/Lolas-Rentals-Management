-- ============================================================
-- Permissions overhaul
--
-- * public.permissions: the catalogue of valid keys (mirrors
--   packages/shared/src/constants/permission-catalogue.ts; regenerate the
--   seed with apps/api/scripts/print-permission-seed.mjs). role_permissions
--   and user_permission_overrides reference it, so unknown keys are rejected.
-- * Over-broad keys are split. Every role holding a key that was split
--   receives all of its replacements, so nobody loses access on deploy.
--   can_edit_settings and can_view_fleet_book_value are retired: they stay on
--   roles (marked deprecated) so the previous app release keeps working, and
--   20261127060000_retire_legacy_permissions removes them after the deploy.
--   permission_aliases keeps older RLS policies that name them working.
-- * Safe to apply before the new API and web release.
-- * user_permission_overrides: per-person grants and revokes with a reason
--   and optional expiry.
-- * roles.permissions_version / users.permissions_version: bumped on every
--   access change so the API can refresh cached permissions immediately.
-- * access_audit_log: append-only, human-readable history of access changes.
--   The underlying rows are also attached to the hash-chained audit_log.
-- * Guardrails: a role that users hold, or a system role, cannot be deleted,
--   and at least one active user must always be able to manage access.
-- ============================================================

-- ── Catalogue ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY CHECK (key ~ '^can_[a-z_]+$'),
  area        text NOT NULL,
  label       text NOT NULL,
  description text NOT NULL,
  sensitive   boolean NOT NULL DEFAULT false,
  -- Retired keys stay until 20261127060000_retire_legacy_permissions runs, so
  -- the previous app release keeps working during the deploy. They can no
  -- longer be granted.
  deprecated  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.permissions (key, area, label, description, sensitive, sort_order) VALUES
  ('can_view_inbox', 'orders', 'View inbox and order details', 'See new bookings waiting to be processed and open any order to read its details.', false, 10),
  ('can_view_active', 'orders', 'View active rentals', 'See rentals that are currently out with customers.', false, 20),
  ('can_view_completed', 'orders', 'View completed orders', 'Browse finished and settled rentals.', false, 30),
  ('can_edit_orders', 'orders', 'Process and manage orders', 'Run the day-to-day booking workflow from inbox to settlement.', false, 40),
  ('can_perform_inspections', 'orders', 'Run vehicle inspections', 'Complete the pre-ride inspection with the customer and record the odometer.', false, 50),
  ('can_cancel_orders', 'orders', 'Cancel and write off orders', 'Cancel bookings and write off unpaid balances.', true, 60),
  ('can_manage_invoices', 'invoices', 'Manage invoices', 'Create, edit and send invoices linked to orders.', false, 70),
  ('can_view_customers', 'customers', 'View customers', 'Search customers and see their booking history and documents.', false, 80),
  ('can_edit_customers', 'customers', 'Edit customers', 'Update a customer''s details, contact preferences and blacklist status.', false, 90),
  ('can_view_transfers', 'transfers', 'View transfers', 'See airport and van transfer bookings.', false, 100),
  ('can_edit_transfers', 'transfers', 'Manage transfers', 'Create, edit, assign and settle transfers.', false, 110),
  ('can_view_fleet', 'fleet', 'View fleet', 'See vehicles, their status, availability and incidents.', false, 120),
  ('can_edit_fleet', 'fleet', 'Manage vehicles', 'Add and edit vehicles and record what happens to them.', false, 130),
  ('can_view_fleet_financials', 'fleet', 'View fleet financials', 'See what vehicles cost and what they are worth now.', true, 140),
  ('can_view_maintenance', 'maintenance', 'View maintenance', 'See the maintenance log for every vehicle.', false, 150),
  ('can_edit_maintenance', 'maintenance', 'Log and update maintenance', 'Record repairs, parts and labour, and close maintenance jobs.', false, 160),
  ('can_view_cashup', 'cashup', 'Do the daily cash up', 'Count the till and close the day.', false, 170),
  ('can_override_cashup', 'cashup', 'Override and reopen cash ups', 'Correct a closed cash up and see every staff member’s totals.', true, 180),
  ('can_view_miscsales', 'sales', 'View misc sales and merchandise', 'See sales recorded outside of rentals and the merchandise stock list.', false, 190),
  ('can_edit_miscsales', 'sales', 'Record misc sales', 'Record, correct and delete misc sales.', false, 200),
  ('can_manage_merchandise', 'sales', 'Manage merchandise stock', 'Add merchandise items, change prices and adjust stock.', false, 210),
  ('can_view_cardsettlements', 'card_settlements', 'View card settlements', 'See card payments waiting to settle and those already settled.', false, 220),
  ('can_edit_cardsettlements', 'card_settlements', 'Match card settlements', 'Match, combine and correct card settlement batches.', false, 230),
  ('can_view_expenses', 'expenses', 'View expenses', 'See expenses recorded for the store.', false, 240),
  ('can_edit_expenses', 'expenses', 'Record and pay expenses', 'Log expenses, mark them paid and pay out staff allowances.', false, 250),
  ('can_view_accounts', 'accounts', 'View accounts and budget', 'See the ledger, account balances, vehicle owner statements and the budget.', true, 260),
  ('can_edit_budget', 'accounts', 'Edit the budget', 'Change budget lines for each period.', false, 270),
  ('can_edit_accounts', 'accounts', 'Post to the accounts', 'Make manual journals, transfers between accounts, reconciliations and owner payouts.', true, 280),
  ('can_view_dashboard', 'insights', 'View business performance', 'See revenue, owner dashboards, analytics and marketing insights.', true, 290),
  ('can_view_lostopportunity', 'lost_opportunities', 'View lost opportunities', 'See customers who were turned away.', false, 300),
  ('can_edit_lostopportunity', 'lost_opportunities', 'Log lost opportunities', 'Record, edit and delete turned-away customers.', false, 310),
  ('can_view_todo', 'tasks', 'Work on tasks', 'See assigned tasks, comment on them and mark them done.', false, 320),
  ('can_manage_todo', 'tasks', 'Manage tasks', 'Create, assign and verify tasks for the team.', false, 330),
  ('can_view_timesheets', 'timesheets', 'View timesheets', 'See timesheets and cash advances for the team.', false, 340),
  ('can_submit_timesheets', 'timesheets', 'Submit timesheets', 'Enter hours worked and submit leave.', false, 350),
  ('can_approve_timesheets', 'timesheets', 'Approve timesheets', 'Approve or reject submitted timesheets.', false, 360),
  ('can_edit_timesheets', 'timesheets', 'Edit and delete timesheets', 'Correct or remove timesheets after they are submitted.', false, 370),
  ('can_manage_rota', 'rota', 'Use the staff rota', 'Open the rota and pick days off. Editing the rota also needs the person to be a rota approver.', false, 380),
  ('can_manage_employees', 'employees', 'Manage employees', 'Add, edit and remove employee records, including pay rates and cash advances.', true, 390),
  ('can_view_payroll', 'payroll', 'View payroll', 'See payroll runs, payslips and allowance balances.', true, 400),
  ('can_run_payroll', 'payroll', 'Run payroll', 'Post and void payroll runs, record remittances and adjust balances.', true, 410),
  ('can_approve_staff_requests', 'payroll', 'Approve staff requests', 'Approve leave and cash advance requests and resolve disputed payslips.', false, 420),
  ('can_manage_contracts', 'contracts', 'Manage business contracts', 'Create and send contracts for customers, partners and suppliers.', false, 430),
  ('can_manage_staff_contracts', 'contracts', 'Manage staff contracts', 'Create and send employment contracts.', true, 440),
  ('can_view_directory', 'directory', 'View directory', 'See the contacts directory.', false, 450),
  ('can_edit_directory', 'directory', 'Edit directory', 'Add, edit and remove directory contacts.', false, 460),
  ('can_manage_partners', 'partners', 'Manage partners', 'Run the accommodation partner programme.', false, 470),
  ('can_manage_impact', 'partners', 'Manage impact articles', 'Write and publish articles on the public impact page.', false, 480),
  ('can_edit_settings_business', 'settings', 'Business settings', 'Stores, delivery locations, accommodation directory, reviews and Paw Card establishments.', false, 490),
  ('can_edit_settings_operations', 'settings', 'Operations settings', 'Add-ons, transfer routes, pickup rules, inspection checklist and task categories.', false, 500),
  ('can_edit_settings_fleet', 'settings', 'Fleet settings', 'Vehicle models and pricing, fleet statuses, maintenance parts and repair costs.', false, 510),
  ('can_edit_settings_finance', 'settings', 'Finance settings', 'Payment methods, payment routing, chart of accounts, expense categories, invoices and fleet accounting.', true, 520),
  ('can_edit_settings_hr', 'settings', 'HR settings', 'Day types and leave allowances.', false, 530),
  ('can_manage_access', 'access', 'Manage users and access', 'Create logins, assign roles, change role permissions and give individual exceptions.', true, 540),
  ('can_view_uierrors', 'system', 'Report app issues', 'Report problems and ideas about the backoffice and see what others have reported.', false, 550),
  ('can_manage_uierrors', 'system', 'Resolve app issues', 'Mark reported issues as fixed.', false, 560),
  ('can_use_dev_tools', 'system', 'Developer tools', 'Run maintenance scripts that reset or repair data.', true, 570),
  ('can_use_counter', 'counter', 'Reception tablet', 'Lets customers book a walk-in and sign the waiver themselves. An account with only this permission is locked to the counter screen.', false, 580)
ON CONFLICT (key) DO UPDATE SET
  area = EXCLUDED.area,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  deprecated = false,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.permissions (key, area, label, description, sensitive, deprecated, sort_order) VALUES
  ('can_edit_settings', 'legacy', 'Edit settings (retired)', 'Replaced by the per-section settings permissions, Manage partners, Manage impact articles, Edit directory, Manage users and access and Developer tools.', true, true, 9000),
  ('can_view_fleet_book_value', 'legacy', 'View fleet book value (retired)', 'Replaced by View fleet financials.', true, true, 9010)
ON CONFLICT (key) DO UPDATE SET deprecated = true, area = 'legacy';

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_select ON public.permissions;
CREATE POLICY permissions_select ON public.permissions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.permission_aliases (
  legacy_key text NOT NULL CHECK (legacy_key ~ '^can_[a-z_]+$'),
  permission text NOT NULL REFERENCES public.permissions(key) ON UPDATE CASCADE,
  PRIMARY KEY (legacy_key, permission)
);

INSERT INTO public.permission_aliases (legacy_key, permission) VALUES
  ('can_edit_settings', 'can_edit_settings_business'),
  ('can_edit_settings', 'can_edit_settings_operations'),
  ('can_edit_settings', 'can_edit_settings_fleet'),
  ('can_edit_settings', 'can_edit_settings_finance'),
  ('can_edit_settings', 'can_edit_settings_hr'),
  ('can_edit_settings', 'can_manage_partners'),
  ('can_edit_settings', 'can_manage_impact'),
  ('can_edit_settings', 'can_edit_directory'),
  ('can_edit_settings', 'can_manage_access'),
  ('can_edit_settings', 'can_use_dev_tools'),
  ('can_view_fleet_book_value', 'can_view_fleet_financials')
ON CONFLICT DO NOTHING;

ALTER TABLE public.permission_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permission_aliases_select ON public.permission_aliases;
CREATE POLICY permission_aliases_select ON public.permission_aliases FOR SELECT USING (true);

-- RLS helper: a policy naming a retired key is satisfied by any key that replaced it.
CREATE OR REPLACE FUNCTION public.has_permission(required text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'permissions') ? required
    OR EXISTS (
      SELECT 1 FROM public.permission_aliases a
      WHERE a.legacy_key = required
        AND (current_setting('request.jwt.claims', true)::jsonb -> 'permissions') ? a.permission
    ),
    false
  );
$function$;

-- ── Backfill split permissions ──────────────────────────────────────────────

DROP TABLE IF EXISTS _role_access_before;
CREATE TEMP TABLE _role_access_before AS
  SELECT role_id, permission FROM public.role_permissions;

INSERT INTO public.role_permissions (role_id, permission)
SELECT DISTINCT rp.role_id, b.grant_permission
FROM public.role_permissions rp
JOIN (VALUES
  ('can_edit_settings', 'can_edit_settings_business'),
  ('can_edit_settings', 'can_edit_settings_operations'),
  ('can_edit_settings', 'can_edit_settings_fleet'),
  ('can_edit_settings', 'can_edit_settings_finance'),
  ('can_edit_settings', 'can_edit_settings_hr'),
  ('can_edit_settings', 'can_manage_partners'),
  ('can_edit_settings', 'can_manage_impact'),
  ('can_edit_settings', 'can_edit_directory'),
  ('can_edit_settings', 'can_manage_access'),
  ('can_edit_settings', 'can_use_dev_tools'),
  ('can_view_fleet_book_value', 'can_view_fleet_financials'),
  ('can_view_accounts', 'can_view_fleet_financials'),
  ('can_view_accounts', 'can_edit_budget'),
  ('can_view_miscsales', 'can_edit_miscsales'),
  ('can_view_miscsales', 'can_manage_merchandise'),
  ('can_view_cardsettlements', 'can_edit_cardsettlements'),
  ('can_view_lostopportunity', 'can_edit_lostopportunity'),
  ('can_view_uierrors', 'can_manage_uierrors'),
  ('can_view_inbox', 'can_view_customers'),
  ('can_edit_orders', 'can_edit_customers'),
  ('can_edit_orders', 'can_perform_inspections')
) AS b(from_permission, grant_permission) ON b.from_permission = rp.permission
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  unknown text;
BEGIN
  SELECT string_agg(DISTINCT rp.permission, ', ') INTO unknown
  FROM public.role_permissions rp
  WHERE rp.permission NOT IN (SELECT key FROM public.permissions);
  IF unknown IS NOT NULL THEN
    RAISE NOTICE 'Removing unrecognised role permissions: %', unknown;
  END IF;
END $$;

DELETE FROM public.role_permissions WHERE permission NOT IN (SELECT key FROM public.permissions);

-- Every role must still hold everything it held before, plus every replacement of a retired key.
DO $$
DECLARE
  lost_kept text;
  lost_replaced text;
  lost text;
BEGIN
  SELECT string_agg(b.role_id || ':' || b.permission, ', ') INTO lost_kept
  FROM _role_access_before b
  WHERE b.permission IN (SELECT key FROM public.permissions)
    AND NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = b.role_id AND rp.permission = b.permission
    );
  SELECT string_agg(b.role_id || ':' || a.permission, ', ') INTO lost_replaced
  FROM _role_access_before b
  JOIN public.permission_aliases a ON a.legacy_key = b.permission
  WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = b.role_id AND rp.permission = a.permission
  );
  lost := concat_ws(', ', lost_kept, lost_replaced);
  IF lost <> '' THEN
    RAISE EXCEPTION 'Permission backfill would remove access: %', lost;
  END IF;
END $$;

DROP TABLE _role_access_before;

ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_permission_fkey;
ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_permission_fkey
  FOREIGN KEY (permission) REFERENCES public.permissions(key) ON UPDATE CASCADE;

-- ── Roles and users ─────────────────────────────────────────────────────────

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.roles SET is_system = true WHERE id IN ('role-admin', 'role-counter');

UPDATE public.roles SET description = d.description
FROM (VALUES
  ('role-admin', 'Owners and directors. Full access to every part of the backoffice.'),
  ('role-counter', 'The reception tablet. Locked to the self-service walk-in screen.'),
  ('role-developer', 'Technical support accounts.'),
  ('role-staff', 'Frontline staff handling bookings, inspections and the daily cash up.'),
  ('store-assistant', 'Senior frontline staff who also handle cancellations, invoices and expenses.'),
  ('store-manager', 'Store managers responsible for the team, the fleet and the cash up.')
) AS d(id, description)
WHERE public.roles.id = d.id AND public.roles.description IS NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions_version integer NOT NULL DEFAULT 1;

-- ── Per-person overrides ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission             text NOT NULL REFERENCES public.permissions(key) ON UPDATE CASCADE,
  effect                 text NOT NULL CHECK (effect IN ('grant', 'revoke')),
  reason                 text NOT NULL CHECK (length(btrim(reason)) >= 3),
  expires_at             timestamptz,
  created_by_user_id     text,
  created_by_employee_id text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

CREATE INDEX IF NOT EXISTS user_permission_overrides_user_idx ON public.user_permission_overrides (user_id);

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_permission_overrides FROM anon, authenticated;

-- ── Access history ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.access_audit_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_user_id     text,
  actor_employee_id text,
  action            text NOT NULL CHECK (action IN (
    'role_created', 'role_updated', 'role_deleted', 'role_permissions_changed',
    'user_created', 'user_role_changed', 'user_activated', 'user_deactivated', 'user_deleted',
    'overrides_changed'
  )),
  role_id           text,
  target_user_id    uuid,
  added             text[] NOT NULL DEFAULT '{}',
  removed           text[] NOT NULL DEFAULT '{}',
  details           jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason            text
);

CREATE INDEX IF NOT EXISTS access_audit_log_time_idx ON public.access_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS access_audit_log_role_idx ON public.access_audit_log (role_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS access_audit_log_user_idx ON public.access_audit_log (target_user_id, occurred_at DESC);

ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_audit_log FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.access_audit_log FROM service_role;
GRANT SELECT, INSERT ON public.access_audit_log TO service_role;

DROP TRIGGER IF EXISTS access_audit_log_no_change ON public.access_audit_log;
CREATE TRIGGER access_audit_log_no_change BEFORE UPDATE OR DELETE ON public.access_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_change();
DROP TRIGGER IF EXISTS access_audit_log_no_truncate ON public.access_audit_log;
CREATE TRIGGER access_audit_log_no_truncate BEFORE TRUNCATE ON public.access_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_block_change();

SELECT public.audit_attach('public.roles');
SELECT public.audit_attach('public.role_permissions');
SELECT public.audit_attach('public.user_permission_overrides');

-- ── Effective access in SQL (for guardrails) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_effective_permission(p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_permission_overrides o
      WHERE o.user_id = p_user_id AND o.permission = p_permission AND o.effect = 'revoke'
        AND (o.expires_at IS NULL OR o.expires_at > now())
    ) THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.user_permission_overrides o
      WHERE o.user_id = p_user_id AND o.permission = p_permission AND o.effect = 'grant'
        AND (o.expires_at IS NULL OR o.expires_at > now())
    ) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.role_permissions rp ON rp.role_id = u.role_id
      WHERE u.id = p_user_id AND rp.permission = p_permission
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.assert_access_manager_remains()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.is_active AND public.user_has_effective_permission(u.id, 'can_manage_access')
  ) THEN
    RAISE EXCEPTION 'At least one active user must keep the "Manage users and access" permission'
      USING ERRCODE = 'check_violation', HINT = 'LAST_ACCESS_MANAGER';
  END IF;
END $$;

-- ── User changes: version bump, history and guardrail ───────────────────────

CREATE OR REPLACE FUNCTION public.users_access_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.permissions_version := OLD.permissions_version + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_access_version ON public.users;
CREATE TRIGGER users_access_version BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_access_version();

CREATE OR REPLACE FUNCTION public.users_access_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, target_user_id, details)
    VALUES (public.audit_actor('x-actor-user-id'), public.audit_actor('x-actor-employee-id'),
      'user_created', NEW.role_id, NEW.id, jsonb_build_object('username', NEW.username));
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, target_user_id, details)
    VALUES (public.audit_actor('x-actor-user-id'), public.audit_actor('x-actor-employee-id'),
      'user_deleted', OLD.role_id, NULL, jsonb_build_object('username', OLD.username, 'user_id', OLD.id));
    PERFORM public.assert_access_manager_remains();
    RETURN NULL;
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, target_user_id, details)
    VALUES (public.audit_actor('x-actor-user-id'), public.audit_actor('x-actor-employee-id'),
      'user_role_changed', NEW.role_id, NEW.id,
      jsonb_build_object('username', NEW.username, 'from_role', OLD.role_id, 'to_role', NEW.role_id));
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, target_user_id, details)
    VALUES (public.audit_actor('x-actor-user-id'), public.audit_actor('x-actor-employee-id'),
      CASE WHEN NEW.is_active THEN 'user_activated' ELSE 'user_deactivated' END, NEW.role_id, NEW.id,
      jsonb_build_object('username', NEW.username));
  END IF;
  IF NEW.role_id IS DISTINCT FROM OLD.role_id OR (OLD.is_active AND NOT NEW.is_active) THEN
    PERFORM public.assert_access_manager_remains();
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS users_access_history ON public.users;
CREATE TRIGGER users_access_history AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_access_history();

-- ── Role guardrails ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.roles_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  holders integer;
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'The % role is built in and cannot be deleted', OLD.name
      USING ERRCODE = 'check_violation', HINT = 'ROLE_SYSTEM';
  END IF;
  SELECT count(*) INTO holders FROM public.users WHERE role_id = OLD.id;
  IF holders > 0 THEN
    RAISE EXCEPTION 'The % role is assigned to % user(s). Move them to another role first.', OLD.name, holders
      USING ERRCODE = 'check_violation', HINT = 'ROLE_IN_USE';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS roles_guard_delete ON public.roles;
CREATE TRIGGER roles_guard_delete BEFORE DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.roles_guard_delete();

-- ── Atomic writes ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_role_atomic(
  p_role_id text,
  p_name text,
  p_description text,
  p_permissions text[],
  p_expected_version integer,
  p_reason text,
  p_actor_user_id text,
  p_actor_employee_id text,
  p_create boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role public.roles%ROWTYPE;
  unknown text;
  before_perms text[];
  after_perms text[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_permissions, '{}')) ORDER BY 1);
  added text[];
  removed text[];
  new_version integer;
BEGIN
  SELECT string_agg(p, ', ') INTO unknown
  FROM unnest(after_perms) p WHERE p NOT IN (SELECT key FROM public.permissions WHERE NOT deprecated);
  IF unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown permission(s): %', unknown USING ERRCODE = 'check_violation', HINT = 'UNKNOWN_PERMISSION';
  END IF;

  IF p_create THEN
    IF EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id) THEN
      RAISE EXCEPTION 'A role with ID % already exists', p_role_id USING ERRCODE = 'unique_violation', HINT = 'ROLE_EXISTS';
    END IF;
    INSERT INTO public.roles (id, name, description) VALUES (p_role_id, p_name, nullif(btrim(p_description), ''));
    INSERT INTO public.role_permissions (role_id, permission) SELECT p_role_id, unnest(after_perms);
    INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, added, details, reason)
    VALUES (p_actor_user_id, p_actor_employee_id, 'role_created', p_role_id, after_perms,
      jsonb_build_object('name', p_name), nullif(btrim(p_reason), ''));
    RETURN 1;
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role % not found', p_role_id USING ERRCODE = 'no_data_found', HINT = 'ROLE_NOT_FOUND';
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_role.permissions_version THEN
    RAISE EXCEPTION 'This role was changed by someone else. Reload and try again.'
      USING ERRCODE = 'serialization_failure', HINT = 'VERSION_CONFLICT';
  END IF;

  before_perms := ARRAY(SELECT permission FROM public.role_permissions WHERE role_id = p_role_id ORDER BY 1);
  added := ARRAY(SELECT unnest(after_perms) EXCEPT SELECT unnest(before_perms) ORDER BY 1);
  removed := ARRAY(SELECT unnest(before_perms) EXCEPT SELECT unnest(after_perms) ORDER BY 1);

  IF p_name IS DISTINCT FROM v_role.name OR nullif(btrim(p_description), '') IS DISTINCT FROM v_role.description THEN
    UPDATE public.roles SET name = p_name, description = nullif(btrim(p_description), ''), updated_at = now()
    WHERE id = p_role_id;
    INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, details, reason)
    VALUES (p_actor_user_id, p_actor_employee_id, 'role_updated', p_role_id,
      jsonb_build_object('from_name', v_role.name, 'to_name', p_name,
        'from_description', v_role.description, 'to_description', nullif(btrim(p_description), '')),
      nullif(btrim(p_reason), ''));
  END IF;

  IF cardinality(added) = 0 AND cardinality(removed) = 0 THEN
    RETURN v_role.permissions_version;
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id AND permission = ANY(removed);
  INSERT INTO public.role_permissions (role_id, permission) SELECT p_role_id, unnest(added);

  UPDATE public.roles SET permissions_version = permissions_version + 1, updated_at = now()
  WHERE id = p_role_id RETURNING permissions_version INTO new_version;

  INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, added, removed, reason)
  VALUES (p_actor_user_id, p_actor_employee_id, 'role_permissions_changed', p_role_id, added, removed,
    nullif(btrim(p_reason), ''));

  PERFORM public.assert_access_manager_remains();
  RETURN new_version;
END $$;

CREATE OR REPLACE FUNCTION public.delete_role_atomic(
  p_role_id text,
  p_reason text,
  p_actor_user_id text,
  p_actor_employee_id text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role public.roles%ROWTYPE;
  perms text[];
BEGIN
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role % not found', p_role_id USING ERRCODE = 'no_data_found', HINT = 'ROLE_NOT_FOUND';
  END IF;
  perms := ARRAY(SELECT permission FROM public.role_permissions WHERE role_id = p_role_id ORDER BY 1);
  DELETE FROM public.roles WHERE id = p_role_id;
  INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, role_id, removed, details, reason)
  VALUES (p_actor_user_id, p_actor_employee_id, 'role_deleted', p_role_id, perms,
    jsonb_build_object('name', v_role.name), nullif(btrim(p_reason), ''));
END $$;

-- Replaces a user's full set of overrides. p_overrides is a JSON array of
-- {"permission", "effect", "reason", "expiresAt"} objects.
CREATE OR REPLACE FUNCTION public.save_user_overrides_atomic(
  p_user_id uuid,
  p_overrides jsonb,
  p_expected_version integer,
  p_actor_user_id text,
  p_actor_employee_id text
) RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_version integer;
  unknown text;
  before_set jsonb;
  after_set jsonb;
  new_version integer;
BEGIN
  SELECT permissions_version INTO current_version FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'no_data_found', HINT = 'USER_NOT_FOUND';
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> current_version THEN
    RAISE EXCEPTION 'This person''s access was changed by someone else. Reload and try again.'
      USING ERRCODE = 'serialization_failure', HINT = 'VERSION_CONFLICT';
  END IF;

  SELECT string_agg(o ->> 'permission', ', ') INTO unknown
  FROM jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) o
  WHERE (o ->> 'permission') NOT IN (SELECT key FROM public.permissions WHERE NOT deprecated);
  IF unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown permission(s): %', unknown USING ERRCODE = 'check_violation', HINT = 'UNKNOWN_PERMISSION';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('permission', permission, 'effect', effect, 'reason', reason, 'expiresAt', expires_at) ORDER BY permission), '[]'::jsonb)
    INTO before_set FROM public.user_permission_overrides WHERE user_id = p_user_id;

  DELETE FROM public.user_permission_overrides WHERE user_id = p_user_id;
  INSERT INTO public.user_permission_overrides
    (user_id, permission, effect, reason, expires_at, created_by_user_id, created_by_employee_id)
  SELECT p_user_id, o ->> 'permission', o ->> 'effect', o ->> 'reason',
    nullif(o ->> 'expiresAt', '')::timestamptz, p_actor_user_id, p_actor_employee_id
  FROM jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) o;

  SELECT coalesce(jsonb_agg(jsonb_build_object('permission', permission, 'effect', effect, 'reason', reason, 'expiresAt', expires_at) ORDER BY permission), '[]'::jsonb)
    INTO after_set FROM public.user_permission_overrides WHERE user_id = p_user_id;

  IF before_set = after_set THEN
    RETURN current_version;
  END IF;

  UPDATE public.users SET permissions_version = permissions_version + 1
  WHERE id = p_user_id RETURNING permissions_version INTO new_version;

  INSERT INTO public.access_audit_log (actor_user_id, actor_employee_id, action, target_user_id, added, removed, details, reason)
  VALUES (
    p_actor_user_id, p_actor_employee_id, 'overrides_changed', p_user_id,
    ARRAY(SELECT (a ->> 'effect') || ':' || (a ->> 'permission') FROM jsonb_array_elements(after_set) a
          EXCEPT SELECT (b ->> 'effect') || ':' || (b ->> 'permission') FROM jsonb_array_elements(before_set) b),
    ARRAY(SELECT (b ->> 'effect') || ':' || (b ->> 'permission') FROM jsonb_array_elements(before_set) b
          EXCEPT SELECT (a ->> 'effect') || ':' || (a ->> 'permission') FROM jsonb_array_elements(after_set) a),
    jsonb_build_object('before', before_set, 'after', after_set),
    (SELECT string_agg(DISTINCT a ->> 'reason', '; ') FROM jsonb_array_elements(after_set) a
      WHERE NOT (a IN (SELECT jsonb_array_elements(before_set))))
  );

  PERFORM public.assert_access_manager_remains();
  RETURN new_version;
END $$;

REVOKE ALL ON FUNCTION public.save_role_atomic(text, text, text, text[], integer, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_role_atomic(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_user_overrides_atomic(uuid, jsonb, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_has_effective_permission(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_access_manager_remains() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_role_atomic(text, text, text, text[], integer, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_role_atomic(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_user_overrides_atomic(uuid, jsonb, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_effective_permission(uuid, text) TO service_role;
