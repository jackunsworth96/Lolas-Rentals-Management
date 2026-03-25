-- ============================================================
-- CONFIGURATION / REFERENCE DATA
-- ============================================================
CREATE TABLE chart_of_accounts (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  account_type  text NOT NULL CHECK (account_type IN ('Asset','Liability','Income','Expense','Equity')),
  store_id      text REFERENCES stores(id),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addons (
  id                        serial PRIMARY KEY,
  name                      text NOT NULL,
  price_per_day             numeric(12,2) NOT NULL DEFAULT 0,
  price_one_time            numeric(12,2) NOT NULL DEFAULT 0,
  addon_type                text NOT NULL CHECK (addon_type IN ('per_day','one_time')),
  store_id                  text REFERENCES stores(id),
  mutual_exclusivity_group  text,
  is_active                 boolean NOT NULL DEFAULT true
);

CREATE TABLE locations (
  id               serial PRIMARY KEY,
  name             text NOT NULL,
  delivery_cost    numeric(12,2) NOT NULL DEFAULT 0,
  collection_cost  numeric(12,2) NOT NULL DEFAULT 0,
  location_type    text,
  store_id         text REFERENCES stores(id),
  is_active        boolean NOT NULL DEFAULT true
);

CREATE TABLE payment_methods (
  id                    text PRIMARY KEY,
  name                  text NOT NULL,
  is_deposit_eligible   boolean NOT NULL DEFAULT true,
  is_active             boolean NOT NULL DEFAULT true
);

CREATE TABLE vehicle_models (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE vehicle_model_pricing (
  id          serial PRIMARY KEY,
  model_id    text NOT NULL REFERENCES vehicle_models(id),
  store_id    text NOT NULL REFERENCES stores(id),
  min_days    integer NOT NULL,
  max_days    integer NOT NULL,
  daily_rate  numeric(12,2) NOT NULL,
  UNIQUE (model_id, store_id, min_days)
);

CREATE TABLE fleet_statuses (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  is_rentable  boolean NOT NULL DEFAULT false
);

CREATE TABLE expense_categories (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  main_category   text,
  account_id      text REFERENCES chart_of_accounts(id),
  is_active       boolean NOT NULL DEFAULT true
);

CREATE TABLE transfer_routes (
  id        serial PRIMARY KEY,
  route     text NOT NULL,
  van_type  text,
  price     numeric(12,2) NOT NULL,
  store_id  text REFERENCES stores(id),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (route, van_type, store_id)
);

CREATE TABLE day_types (
  id    text PRIMARY KEY,
  name  text NOT NULL
);

CREATE TABLE paw_card_establishments (
  id        serial PRIMARY KEY,
  name      text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE maintenance_work_types (
  id        serial PRIMARY KEY,
  name      text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE leave_config (
  id                         serial PRIMARY KEY,
  store_id                   text NOT NULL REFERENCES stores(id) UNIQUE,
  reset_month                integer NOT NULL DEFAULT 1 CHECK (reset_month BETWEEN 1 AND 12),
  reset_day                  integer NOT NULL DEFAULT 1 CHECK (reset_day BETWEEN 1 AND 31),
  default_holiday_allowance  integer NOT NULL DEFAULT 5,
  default_sick_allowance     integer NOT NULL DEFAULT 5
);
