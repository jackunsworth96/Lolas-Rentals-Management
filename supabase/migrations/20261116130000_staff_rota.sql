-- ============================================================
-- Staff rota (phase 1): weekly day-off picks, rota cells, publish, audit.
-- All access goes through the API (service role); RLS is on with no policies.
-- Cells that have no row are "working, store hours" until the week is published,
-- when every cell is written out.
-- ============================================================

CREATE TABLE IF NOT EXISTS rota_settings (
  store_id             text PRIMARY KEY REFERENCES stores(id),
  default_start        time NOT NULL DEFAULT '09:00',
  default_end          time NOT NULL DEFAULT '17:00',
  min_staff            smallint NOT NULL DEFAULT 2 CHECK (min_staff >= 1),
  emergency_min_staff  smallint NOT NULL DEFAULT 1 CHECK (emergency_min_staff >= 1),
  max_off_per_day      smallint NOT NULL DEFAULT 1 CHECK (max_off_per_day >= 0),
  change_notice_hours  smallint NOT NULL DEFAULT 48 CHECK (change_notice_hours >= 0),
  -- Only these employees can approve picks, edit and publish the rota.
  approver_ids         text[] NOT NULL DEFAULT '{}',
  updated_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (emergency_min_staff <= min_staff),
  CHECK (default_end > default_start)
);

CREATE TABLE IF NOT EXISTS employee_work_patterns (
  employee_id          text PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  schedule_mode        text NOT NULL DEFAULT 'rostered' CHECK (schedule_mode IN ('rostered', 'self_managed', 'excluded')),
  target_days_per_week smallint NOT NULL DEFAULT 6 CHECK (target_days_per_week BETWEEN 1 AND 7),
  counts_toward_cover  boolean NOT NULL DEFAULT true,
  updated_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rota_weeks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      text NOT NULL REFERENCES stores(id),
  week_start    date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'locked')),
  published_at  timestamptz,
  published_by  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, week_start)
);

CREATE TABLE IF NOT EXISTS rota_day_off_picks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       text NOT NULL REFERENCES stores(id),
  employee_id    text NOT NULL REFERENCES employees(id),
  week_start     date NOT NULL,
  date           date NOT NULL,
  note           text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  is_late        boolean NOT NULL DEFAULT false,
  is_clash       boolean NOT NULL DEFAULT false,
  moved_from     date,
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  decided_by     text,
  decided_at     timestamptz,
  decision_note  text,
  CHECK (date >= week_start AND date < week_start + 7)
);
CREATE UNIQUE INDEX IF NOT EXISTS rota_picks_live_uidx
  ON rota_day_off_picks (employee_id, date) WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS rota_picks_week_idx ON rota_day_off_picks (store_id, week_start);

CREATE TABLE IF NOT EXISTS rota_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      text NOT NULL REFERENCES stores(id),
  week_start    date NOT NULL,
  employee_id   text NOT NULL REFERENCES employees(id),
  date          date NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('working', 'day_off', 'holiday', 'sick', 'unpaid_leave', 'out_of_office')),
  start_time    time,
  end_time      time,
  note          text,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('pick', 'assigned', 'manual', 'leave', 'default')),
  updated_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date),
  CHECK (date >= week_start AND date < week_start + 7),
  CHECK (kind <> 'working' OR (start_time IS NOT NULL AND end_time IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS rota_assignments_week_idx ON rota_assignments (store_id, week_start);

-- Days the approver accepted running below minimum cover.
CREATE TABLE IF NOT EXISTS rota_cover_overrides (
  store_id     text NOT NULL REFERENCES stores(id),
  date         date NOT NULL,
  reason       text NOT NULL,
  approved_by  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, date)
);

CREATE TABLE IF NOT EXISTS rota_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     text NOT NULL,
  week_start   date NOT NULL,
  actor_id     text,
  action       text NOT NULL,
  employee_id  text,
  date         date,
  detail       jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rota_audit_week_idx ON rota_audit_log (store_id, week_start, created_at DESC);

ALTER TABLE rota_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_work_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_day_off_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_cover_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rota_settings', 'rota_weeks', 'rota_day_off_picks', 'rota_assignments', 'rota_cover_overrides'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_archived_store_write_%1$s ON %1$s', t);
    EXECUTE format(
      'CREATE TRIGGER reject_archived_store_write_%1$s BEFORE INSERT OR UPDATE OR DELETE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION reject_archived_store_write()', t);
  END LOOP;
END $$;

INSERT INTO role_permissions (role_id, permission)
SELECT 'role-admin', 'can_manage_rota'
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions WHERE role_id = 'role-admin' AND permission = 'can_manage_rota'
);

-- ── Lola's defaults: Nitz and Jack approve; Jack is off the rota; Geo self-manages ──
INSERT INTO rota_settings (store_id, approver_ids)
SELECT 'store-lolas', COALESCE(ARRAY(
  SELECT u.employee_id FROM users u WHERE u.username IN ('Nitz', 'Jack') AND u.employee_id IS NOT NULL
), '{}')
WHERE EXISTS (SELECT 1 FROM stores WHERE id = 'store-lolas')
ON CONFLICT (store_id) DO NOTHING;

INSERT INTO employee_work_patterns (employee_id, schedule_mode, counts_toward_cover)
SELECT u.employee_id, CASE u.username WHEN 'Jack' THEN 'excluded' ELSE 'self_managed' END, false
FROM users u
WHERE u.username IN ('Jack', 'Geo') AND u.employee_id IS NOT NULL
ON CONFLICT (employee_id) DO NOTHING;
