-- Migration: cancel stale unprocessed direct orders_raw for Honda Beat V3
-- Context: 10 unprocessed orders_raw records were silently draining availability
-- for the Honda Beat, reducing the website count to 1 despite 7 bikes being
-- physically available. Root cause was a double-submit bug in the booking form
-- (now fixed). This script cancels the stale records to restore correct counts.
--
-- Records by category:
--   Duplicate pairs (submitted within 2 seconds of each other, April 24-25):
--     31560710, 00ed3f71  (May 24-28)
--     fe1b0f8a, e2d511b2  (May 25-30)
--     7bbbc10c, 187ebbbc  (May 26-31)
--   Old single submissions (April 25, >3 weeks old, never actioned):
--     beec53e2            (May 26-Jun 1)
--   Past pickup date — customer never arrived (May 17 pickup, now May 21):
--     7bd037a4            (May 17-24)
--   Recent — may be real customers awaiting a response:
--     b0982cb3  created 2026-05-20, pickup May 23  ← REVIEW before cancelling
--     b3072433  created 2026-05-21 05:10, pickup May 21 ← likely lost confirmation
--
-- All 10 are cancelled here. If b0982cb3 or b3072433 are genuine customers,
-- contact them directly after running this script.

UPDATE public.orders_raw
SET status = 'cancelled'
WHERE id IN (
  -- Duplicate pairs from April 24–25
  '31560710-a262-49e8-b89c-2d025ac82686',
  '00ed3f71-d07d-4c00-b424-73c3611a699f',
  'fe1b0f8a-fe68-4a35-90a0-ca0ce3826c48',
  'e2d511b2-b0bb-4aac-bc94-073886e7b5ae',
  '7bbbc10c-fcb1-48ac-b8c9-112a8057efde',
  '187ebbbc-8d6d-4f7a-8d95-f5f7e1cc9879',
  -- Old single, never actioned
  'beec53e2-d1fe-45fe-9351-9891cc060102',
  -- Past pickup date
  '7bd037a4-22e9-4a4c-a2e2-95c8e4b9debf',
  -- Recent — review recommended (see notes above)
  'b0982cb3-ccf4-437c-8759-6c640e37f2b2',
  'b3072433-7e47-459c-bc25-bf020fa337c1'
)
AND status = 'unprocessed';  -- safety guard: only touch unprocessed rows
