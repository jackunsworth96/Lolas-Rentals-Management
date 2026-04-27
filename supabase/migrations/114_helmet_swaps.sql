CREATE TABLE helmet_swaps (
  id                   text PRIMARY KEY,
  order_id             text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id        text NOT NULL REFERENCES order_items(id),
  store_id             text NOT NULL REFERENCES stores(id),
  old_helmet_numbers   text NOT NULL,
  new_helmet_numbers   text NOT NULL,
  reason               text,
  employee_id          text REFERENCES employees(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);
