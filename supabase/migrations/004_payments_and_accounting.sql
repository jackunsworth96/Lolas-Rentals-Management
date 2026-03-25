-- ============================================================
-- PAYMENTS & VEHICLE SWAPS
-- ============================================================
CREATE TABLE payments (
  id                 text PRIMARY KEY,
  store_id           text NOT NULL REFERENCES stores(id),
  order_id           text NOT NULL REFERENCES orders(id),
  order_item_id      text REFERENCES order_items(id),
  order_addon_id     text REFERENCES order_addons(id),
  payment_type       text NOT NULL,
  amount             numeric(12,2) NOT NULL,
  payment_method_id  text,
  transaction_date   date NOT NULL,
  settlement_status  text,
  settlement_ref     text,
  customer_id        text REFERENCES customers(id),
  account_id         text REFERENCES chart_of_accounts(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_swaps (
  id                text PRIMARY KEY,
  order_id          text NOT NULL REFERENCES orders(id),
  order_item_id     text NOT NULL REFERENCES order_items(id),
  store_id          text NOT NULL REFERENCES stores(id),
  old_vehicle_id    text NOT NULL REFERENCES fleet(id),
  old_vehicle_name  text,
  new_vehicle_id    text NOT NULL REFERENCES fleet(id),
  new_vehicle_name  text,
  swap_date         date NOT NULL,
  swap_time         time,
  reason            text,
  employee_id       text REFERENCES employees(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ACCOUNTING
-- ============================================================
CREATE TABLE journal_entries (
  id              text PRIMARY KEY,
  transaction_id  text NOT NULL,
  period          text NOT NULL,
  date            date NOT NULL,
  store_id        text NOT NULL REFERENCES stores(id),
  account_id      text NOT NULL REFERENCES chart_of_accounts(id),
  description     text,
  debit           numeric(12,2) NOT NULL DEFAULT 0,
  credit          numeric(12,2) NOT NULL DEFAULT 0,
  reference_type  text NOT NULL,
  reference_id    text,
  created_by      text REFERENCES employees(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positive_amounts CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT debit_xor_credit CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

CREATE TABLE cash_reconciliation (
  id                 text PRIMARY KEY,
  date               date NOT NULL,
  store_id           text NOT NULL REFERENCES stores(id),
  opening_balance    numeric(12,2) NOT NULL DEFAULT 0,
  expected_cash      numeric(12,2) NOT NULL DEFAULT 0,
  actual_counted     numeric(12,2) NOT NULL DEFAULT 0,
  variance           numeric(12,2) NOT NULL DEFAULT 0,
  variance_type      text,
  submitted_by       text REFERENCES employees(id),
  submitted_at       timestamptz,
  is_locked          boolean NOT NULL DEFAULT false,
  overridden_by      text REFERENCES employees(id),
  overridden_at      timestamptz,
  override_reason    text,
  till_counted       numeric(12,2),
  deposits_counted   numeric(12,2),
  till_denoms        jsonb,
  deposit_denoms     jsonb,
  till_expected      numeric(12,2),
  deposits_expected  numeric(12,2),
  till_variance      numeric(12,2),
  deposit_variance   numeric(12,2),
  closing_balance    numeric(12,2),
  UNIQUE (store_id, date)
);

CREATE TABLE card_settlements (
  id               serial PRIMARY KEY,
  is_paid          boolean NOT NULL DEFAULT false,
  order_id         text REFERENCES orders(id),
  customer_id      text REFERENCES customers(id),
  settlement_ref   text,
  date_settled     date,
  store_id         text NOT NULL REFERENCES stores(id),
  net_amount       numeric(12,2),
  fee_expense      numeric(12,2),
  account_id       text REFERENCES chart_of_accounts(id),
  raw_date         text,
  name             text,
  ref_number       text,
  amount           numeric(12,2),
  forecasted_date  date,
  batch_no         text,
  mid              text,
  merchant         text,
  tx_type          text,
  card_num         text,
  orig_amt         numeric(12,2),
  exch_rate        numeric(8,4),
  settle_amt       numeric(12,2),
  other_fee        numeric(12,2),
  tax              numeric(12,2),
  net_settlement   numeric(12,2),
  paid_status      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
