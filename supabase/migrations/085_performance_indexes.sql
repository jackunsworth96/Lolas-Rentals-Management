-- ============================================================
-- 085: Performance indexes for commonly filtered columns
-- ============================================================

-- transfers: most common filters are store_id + service_date
CREATE INDEX IF NOT EXISTS idx_transfers_store_service_date
  ON public.transfers(store_id, service_date DESC);

-- transfers: collected_at for settlement summary queries
CREATE INDEX IF NOT EXISTS idx_transfers_collected_at
  ON public.transfers(collected_at)
  WHERE collected_at IS NOT NULL;

-- orders: status filter is used on every active-orders query
CREATE INDEX IF NOT EXISTS idx_orders_store_status
  ON public.orders(store_id, status);

-- orders: dropoff_datetime for late-return queries
CREATE INDEX IF NOT EXISTS idx_orders_dropoff_datetime
  ON public.orders(dropoff_datetime);

-- orders_raw: status filter used on inbox page
CREATE INDEX IF NOT EXISTS idx_orders_raw_store_status
  ON public.orders_raw(store_id, status);

-- paw_card_establishments: featured + sort for top-establishments query
CREATE INDEX IF NOT EXISTS idx_paw_card_establishments_featured_sort
  ON public.paw_card_establishments(is_featured DESC, sort_order ASC)
  WHERE is_active = true;

-- lower(email) index for case-insensitive email lookups
CREATE INDEX IF NOT EXISTS idx_customers_email_lower
  ON public.customers(lower(email));
