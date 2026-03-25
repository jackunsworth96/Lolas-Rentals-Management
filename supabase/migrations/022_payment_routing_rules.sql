-- payment_routing_rules: RLS deferred until permissions helper exists in DB
CREATE TABLE payment_routing_rules (
  id                          serial PRIMARY KEY,
  store_id                    text NOT NULL REFERENCES stores(id),
  payment_method_id           text NOT NULL REFERENCES payment_methods(id),
  received_into_account_id    text REFERENCES chart_of_accounts(id),
  income_account_id           text REFERENCES chart_of_accounts(id),
  card_settlement_account_id  text REFERENCES chart_of_accounts(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, payment_method_id)
);

-- Store-level defaults: card fee expense account and default cash account (for expenses)
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS card_fee_account_id text REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS default_cash_account_id text REFERENCES chart_of_accounts(id);
