-- ============================================================
-- 024 — TASK ACCOUNTABILITY SYSTEM
-- (RLS deferred to a later migration; no policies here.)
-- ============================================================

CREATE TABLE task_categories (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  colour     text NOT NULL DEFAULT '#6B7280',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE todo_tasks
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category_id integer REFERENCES task_categories(id),
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_escalated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE todo_tasks SET title = task_description WHERE title IS NULL AND task_description IS NOT NULL;

ALTER TABLE todo_tasks DROP CONSTRAINT IF EXISTS todo_tasks_status_check;
ALTER TABLE todo_tasks ADD CONSTRAINT todo_tasks_status_check
  CHECK (status IN ('Created','Acknowledged','In Progress','Pending Verification','Closed'));

UPDATE todo_tasks SET status = 'Created' WHERE status = 'Open';
UPDATE todo_tasks SET status = 'Closed' WHERE status = 'Completed';

CREATE TABLE task_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     text NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN (
    'created','acknowledged','started','submitted',
    'verified','rejected','escalated','commented',
    'reassigned','updated'
  )),
  actor_id    text NOT NULL REFERENCES employees(id),
  actor_name  text,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_events_task ON task_events (task_id, created_at);
CREATE INDEX idx_task_events_actor ON task_events (actor_id);

CREATE TABLE task_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           text NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  recipient_id      text NOT NULL REFERENCES employees(id),
  notification_type text NOT NULL CHECK (notification_type IN (
    'assigned','rejected','escalated','overdue','comment'
  )),
  is_read           boolean NOT NULL DEFAULT false,
  is_dismissed      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_notif_recipient ON task_notifications (recipient_id, is_read);
CREATE INDEX idx_todo_tasks_due_status ON todo_tasks (due_date, status)
  WHERE status NOT IN ('Closed');

ALTER PUBLICATION supabase_realtime ADD TABLE task_events;
ALTER PUBLICATION supabase_realtime ADD TABLE task_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE task_categories;
