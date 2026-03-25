-- ============================================================
-- NEW FUNCTIONALITY (currently unused sheets)
-- ============================================================
CREATE TABLE merchandise (
  sku            text PRIMARY KEY,
  item_name      text NOT NULL,
  size_variant   text,
  cost_price     numeric(12,2) NOT NULL DEFAULT 0,
  sale_price     numeric(12,2) NOT NULL DEFAULT 0,
  starting_stock integer NOT NULL DEFAULT 0,
  sold_count     integer NOT NULL DEFAULT 0,
  current_stock  integer NOT NULL DEFAULT 0,
  store_id       text REFERENCES stores(id),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id             serial PRIMARY KEY,
  external_id    text,
  platform       text NOT NULL,
  store_id       text REFERENCES stores(id),
  date           date,
  reviewer_name  text,
  star_rating    integer CHECK (star_rating BETWEEN 1 AND 5),
  comment        text,
  replied        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_id, platform)
);

CREATE TABLE recurring_bills (
  id                    serial PRIMARY KEY,
  bill_name             text NOT NULL,
  category              text,
  amount                numeric(12,2) NOT NULL,
  day_of_month          integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  store_id              text REFERENCES stores(id),
  account_id            text REFERENCES chart_of_accounts(id),
  auto_post_to_ledger   boolean NOT NULL DEFAULT false,
  last_posted_date      date,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE directory (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  number        text,
  email         text,
  relationship  text,
  gcash_number  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
