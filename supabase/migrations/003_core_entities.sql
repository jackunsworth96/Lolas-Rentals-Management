-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id           text PRIMARY KEY,
  store_id     text REFERENCES stores(id),
  name         text NOT NULL,
  email        text,
  mobile       text,
  total_spent  numeric(12,2) NOT NULL DEFAULT 0,
  notes        text,
  blacklisted  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- FLEET
-- ============================================================
CREATE TABLE fleet (
  id                        text PRIMARY KEY,
  store_id                  text NOT NULL REFERENCES stores(id),
  name                      text NOT NULL,
  model_id                  text REFERENCES vehicle_models(id),
  plate_number              text,
  gps_id                    text,
  status                    text NOT NULL DEFAULT 'Available',
  current_mileage           numeric(10,1) NOT NULL DEFAULT 0,
  orcr_expiry_date          date,
  surf_rack                 boolean NOT NULL DEFAULT false,
  owner                     text,
  rentable_start_date       date,
  registration_date         date,
  purchase_price            numeric(12,2),
  purchase_date             date,
  set_up_costs              numeric(12,2) NOT NULL DEFAULT 0,
  total_bike_cost           numeric(12,2) NOT NULL DEFAULT 0,
  useful_life_months        integer,
  salvage_value             numeric(12,2) NOT NULL DEFAULT 0,
  accumulated_depreciation  numeric(12,2) NOT NULL DEFAULT 0,
  book_value                numeric(12,2) NOT NULL DEFAULT 0,
  date_sold                 date,
  sold_price                numeric(12,2),
  profit_loss               numeric(12,2),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id                   text PRIMARY KEY,
  store_id             text NOT NULL REFERENCES stores(id),
  customer_id          text REFERENCES customers(id),
  employee_id          text REFERENCES employees(id),
  order_date           date NOT NULL,
  status               text NOT NULL DEFAULT 'unprocessed'
                         CHECK (status IN ('unprocessed','active','confirmed','completed','cancelled')),
  web_notes            text,
  quantity             integer NOT NULL DEFAULT 1,
  web_quote_raw        numeric(12,2),
  security_deposit     numeric(12,2) NOT NULL DEFAULT 0,
  deposit_status       text,
  card_fee_surcharge   numeric(12,2) NOT NULL DEFAULT 0,
  return_charges       numeric(12,2) NOT NULL DEFAULT 0,
  final_total          numeric(12,2) NOT NULL DEFAULT 0,
  balance_due          numeric(12,2) NOT NULL DEFAULT 0,
  payment_method_id    text,
  deposit_method_id    text,
  booking_token        text UNIQUE,
  tips                 numeric(12,2) NOT NULL DEFAULT 0,
  charity_donation     numeric(12,2) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id                text PRIMARY KEY,
  store_id          text NOT NULL REFERENCES stores(id),
  order_id          text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vehicle_id        text REFERENCES fleet(id),
  vehicle_name      text,
  pickup_datetime   timestamptz,
  dropoff_datetime  timestamptz,
  rental_days_count integer NOT NULL DEFAULT 0,
  pickup_location   text,
  dropoff_location  text,
  pickup_fee        numeric(12,2) NOT NULL DEFAULT 0,
  dropoff_fee       numeric(12,2) NOT NULL DEFAULT 0,
  rental_rate       numeric(12,2) NOT NULL DEFAULT 0,
  helmet_numbers    text,
  discount          numeric(12,2) NOT NULL DEFAULT 0,
  ops_notes         text,
  return_condition  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_addons (
  id             text PRIMARY KEY,
  store_id       text NOT NULL REFERENCES stores(id),
  order_id       text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id  text REFERENCES order_items(id),
  customer_id    text REFERENCES customers(id),
  addon_name     text NOT NULL,
  addon_price    numeric(12,2) NOT NULL,
  addon_type     text NOT NULL CHECK (addon_type IN ('per_day','one_time')),
  quantity       integer NOT NULL DEFAULT 1,
  total_amount   numeric(12,2) NOT NULL,
  added_at       timestamptz NOT NULL DEFAULT now(),
  added_date     date,
  employee_id    text REFERENCES employees(id),
  notes          text
);
