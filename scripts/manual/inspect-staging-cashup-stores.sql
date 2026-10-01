-- Read-only staging diagnostic. Compare IDs and usage before deciding whether
-- similarly named stores are duplicates. Do not merge or delete by name.
SELECT s.id, s.name, s.is_active,
       (SELECT count(*) FROM public.orders_raw r WHERE r.store_id = s.id) AS raw_bookings,
       (SELECT count(*) FROM public.orders o WHERE o.store_id = s.id) AS active_orders,
       (SELECT count(*) FROM public.payments p WHERE p.store_id = s.id) AS payments,
       (SELECT count(*) FROM public.cash_reconciliation c WHERE c.store_id = s.id) AS cashup_days
FROM public.stores s
ORDER BY lower(trim(s.name)), s.id;
