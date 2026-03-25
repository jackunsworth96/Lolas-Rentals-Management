-- ============================================================
-- UTILITY FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. FOUNDATION
-- ============================================================
CREATE TABLE stores (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  location    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id          text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id     text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission  text NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE employees (
  id                       text PRIMARY KEY,
  store_id                 text REFERENCES stores(id),
  full_name                text NOT NULL,
  role                     text,
  status                   text NOT NULL DEFAULT 'Active',
  birthday                 date,
  emergency_contact_name   text,
  emergency_contact_number text,
  start_date               date,
  probation_end_date       date,
  rate_type                text CHECK (rate_type IN ('daily','monthly')),
  basic_rate               numeric(12,2) NOT NULL DEFAULT 0,
  overtime_rate            numeric(12,2) NOT NULL DEFAULT 0,
  nine_pm_bonus_rate       numeric(12,2) NOT NULL DEFAULT 0,
  commission_rate          numeric(8,4)  NOT NULL DEFAULT 0,
  paid_as                  text,
  monthly_bike_allowance   numeric(12,2) NOT NULL DEFAULT 0,
  bike_allowance_used      numeric(12,2) NOT NULL DEFAULT 0,
  bike_allowance_accrued   numeric(12,2) NOT NULL DEFAULT 0,
  available_balance        numeric(12,2) NOT NULL DEFAULT 0,
  thirteenth_month_accrued numeric(12,2) NOT NULL DEFAULT 0,
  current_cash_advance     numeric(12,2) NOT NULL DEFAULT 0,
  holiday_allowance        integer NOT NULL DEFAULT 0,
  holiday_used             integer NOT NULL DEFAULT 0,
  sick_allowance           integer NOT NULL DEFAULT 0,
  sick_used                integer NOT NULL DEFAULT 0,
  sss_no                   text,
  philhealth_no            text,
  pagibig_no               text,
  tin                      text,
  sss_deduction_amt        numeric(12,2) NOT NULL DEFAULT 0,
  philhealth_deduction_amt numeric(12,2) NOT NULL DEFAULT 0,
  pagibig_deduction_amt    numeric(12,2) NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     text NOT NULL UNIQUE,
  pin_hash     text NOT NULL,
  employee_id  text NOT NULL REFERENCES employees(id),
  role_id      text NOT NULL REFERENCES roles(id),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
