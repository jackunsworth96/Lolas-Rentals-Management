-- ============================================================
-- HR & PAYROLL
-- ============================================================
CREATE TABLE timesheets (
  id                    text PRIMARY KEY,
  date                  date NOT NULL,
  employee_id           text NOT NULL REFERENCES employees(id),
  name                  text,
  day_type              text NOT NULL DEFAULT 'Regular',
  time_in               time,
  time_out              time,
  regular_hours         numeric(4,2) NOT NULL DEFAULT 0,
  overtime_hours        numeric(4,2) NOT NULL DEFAULT 0,
  nine_pm_returns_count integer NOT NULL DEFAULT 0,
  daily_notes           text,
  payroll_status        text NOT NULL DEFAULT 'Pending'
                          CHECK (payroll_status IN ('Pending','Approved','Paid')),
  sil_inflation         numeric(12,2) NOT NULL DEFAULT 0,
  store_id              text NOT NULL REFERENCES stores(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE TABLE cash_advance_schedules (
  id                  text PRIMARY KEY,
  employee_id         text NOT NULL REFERENCES employees(id),
  expense_id          text,
  total_amount        numeric(12,2) NOT NULL,
  granted_date        date NOT NULL,
  installment_amount  numeric(12,2) NOT NULL,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  deducted            boolean NOT NULL DEFAULT false,
  deducted_at         date,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- OPERATIONS
-- ============================================================
CREATE TABLE maintenance (
  id                   text PRIMARY KEY,
  created_at           timestamptz NOT NULL DEFAULT now(),
  asset_id             text NOT NULL REFERENCES fleet(id),
  vehicle_name         text,
  status               text NOT NULL DEFAULT 'Reported'
                         CHECK (status IN ('Reported','In Progress','Completed')),
  downtime_tracked     boolean NOT NULL DEFAULT false,
  downtime_start       date,
  downtime_end         date,
  total_downtime_days  integer,
  issue_description    text,
  work_performed       text,
  parts_replaced       jsonb,
  parts_cost           numeric(12,2) NOT NULL DEFAULT 0,
  labor_cost           numeric(12,2) NOT NULL DEFAULT 0,
  total_cost           numeric(12,2) NOT NULL DEFAULT 0,
  paid_from            text REFERENCES chart_of_accounts(id),
  mechanic             text,
  odometer             numeric(10,1),
  next_service_due     numeric(10,1),
  employee_id          text REFERENCES employees(id),
  store_id             text NOT NULL REFERENCES stores(id)
);

CREATE TABLE expenses (
  id              text PRIMARY KEY,
  maintenance_id  text REFERENCES maintenance(id),
  store_id        text NOT NULL REFERENCES stores(id),
  date            date NOT NULL,
  category        text NOT NULL,
  vehicle_id      text REFERENCES fleet(id),
  amount          numeric(12,2) NOT NULL,
  transfer_fee    numeric(12,2) NOT NULL DEFAULT 0,
  paid_from       text REFERENCES chart_of_accounts(id),
  description     text,
  employee_id     text REFERENCES employees(id),
  account_id      text REFERENCES chart_of_accounts(id),
  paid_to         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transfers (
  id                 text PRIMARY KEY,
  order_id           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  service_date       date NOT NULL,
  customer_name      text NOT NULL,
  contact_number     text,
  customer_email     text,
  customer_type      text CHECK (customer_type IN ('Walk-in','Online')),
  route              text NOT NULL,
  flight_time        text,
  pax_count          integer NOT NULL DEFAULT 1,
  van_type           text,
  accommodation      text,
  status             text NOT NULL DEFAULT 'Pending',
  ops_notes          text,
  total_price        numeric(12,2) NOT NULL,
  payment_method     text,
  payment_status     text NOT NULL DEFAULT 'Pending'
                       CHECK (payment_status IN ('Pending','Partially Paid','Paid')),
  driver_fee         numeric(12,2),
  net_profit         numeric(12,2),
  driver_paid_status text,
  booking_source     text,
  booking_token      text UNIQUE,
  store_id           text NOT NULL REFERENCES stores(id)
);
