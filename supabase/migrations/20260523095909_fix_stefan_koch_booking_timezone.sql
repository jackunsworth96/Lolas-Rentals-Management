-- ============================================================
-- DATA FIX: Stefan Koch booking LR-0523-0036 — timezone correction
-- ============================================================
-- Root cause: BasketPage.tsx handleChangeDates() built datetime
-- strings without the +08:00 Manila offset (e.g. "2026-05-24T09:15:00"
-- instead of "2026-05-24T09:15:00+08:00"). Postgres stored the
-- naive string as UTC, causing times to display 8 hours ahead in
-- the back office (09:15 UTC → 17:15 Manila instead of 09:15 Manila).
--
-- Code fix: apps/web/src/pages/basket/BasketPage.tsx
--   handleChangeDates() now appends :00+08:00 instead of :00
--
-- This migration corrects the one affected booking (id: 9e55c961...)
-- and its booking_session record. The correct times are:
--   Pickup:  May 24 2026, 09:15 AM Manila (= 01:15 UTC)
--   Dropoff: May 27 2026, 04:45 PM Manila (= 08:45 UTC)
-- ============================================================

UPDATE public.orders_raw
SET
  pickup_datetime  = '2026-05-24T09:15:00+08:00',
  dropoff_datetime = '2026-05-27T16:45:00+08:00'
WHERE id = '9e55c961-8b48-4165-bdb4-cfa6dc9cd055'
  AND order_reference = 'LR-0523-0036';

UPDATE public.booking_sessions
SET
  pickup_datetime  = '2026-05-24T09:15:00+08:00',
  dropoff_datetime = '2026-05-27T16:45:00+08:00'
WHERE session_token = '009ca9ff-0a61-4f0f-ad10-7dc8897b3686';
