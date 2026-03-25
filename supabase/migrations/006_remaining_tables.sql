-- ============================================================
-- MISC SALES, LOST OPPORTUNITY
-- ============================================================
CREATE TABLE misc_sales (
  id                text PRIMARY KEY,
  date              date NOT NULL,
  store_id          text NOT NULL REFERENCES stores(id),
  description       text,
  category          text,
  amount            numeric(12,2) NOT NULL,
  received_into     text REFERENCES chart_of_accounts(id),
  income_account_id text REFERENCES chart_of_accounts(id),
  employee_id       text REFERENCES employees(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lost_opportunity (
  id                serial PRIMARY KEY,
  store_id          text NOT NULL REFERENCES stores(id),
  date              date NOT NULL,
  time              time,
  vehicle_requested text,
  quantity          integer NOT NULL DEFAULT 1,
  duration_days     integer,
  est_value         numeric(12,2),
  reason            text,
  outcome           text,
  staff_notes       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- TASK MANAGEMENT
-- ============================================================
CREATE TABLE todo_tasks (
  id                   text PRIMARY KEY,
  store_id             text NOT NULL REFERENCES stores(id),
  employee_id          text REFERENCES employees(id),
  vehicle_id           text REFERENCES fleet(id),
  assigned_by          text REFERENCES employees(id),
  assigned_to          text REFERENCES employees(id),
  task_description     text NOT NULL,
  completion_response  text,
  date_created         timestamptz NOT NULL DEFAULT now(),
  date_completed       timestamptz,
  visibility           text NOT NULL DEFAULT 'all',
  priority             text NOT NULL DEFAULT 'Medium'
                         CHECK (priority IN ('Low','Medium','High','Urgent')),
  status               text NOT NULL DEFAULT 'Open'
                         CHECK (status IN ('Open','In Progress','Completed')),
  due_date             date,
  task_category        text,
  seen_by              text[] DEFAULT '{}',
  completed_by         text
);

CREATE TABLE todo_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      text NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id),
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PAW CARD & UI ERRORS
-- ============================================================
CREATE TABLE paw_card_entries (
  id                serial PRIMARY KEY,
  created_at        timestamptz NOT NULL DEFAULT now(),
  order_id          text,
  full_name         text NOT NULL,
  email             text,
  establishment     text NOT NULL,
  date_of_visit     date,
  number_of_people  integer,
  amount_saved      numeric(12,2) NOT NULL DEFAULT 0,
  rental_total      numeric(12,2),
  rental_days       integer,
  effective_per_day numeric(12,2)
);

CREATE TABLE ui_errors (
  id                     text PRIMARY KEY,
  page                   text NOT NULL,
  error_description      text NOT NULL,
  idea_and_improvements  text,
  employee_id            text REFERENCES employees(id),
  fixed                  boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);
