-- ============================================================
-- BOOKING HOLDS — temporary reservation of capacity per model/store
-- ============================================================

CREATE TABLE public.booking_holds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_model_id  text NOT NULL REFERENCES public.vehicle_models (id),
  store_id          text NOT NULL REFERENCES public.stores (id),
  pickup_datetime   timestamptz NOT NULL,
  dropoff_datetime  timestamptz NOT NULL,
  session_token     text NOT NULL,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_holds_pickup_before_dropoff CHECK (pickup_datetime < dropoff_datetime)
);

CREATE INDEX idx_booking_holds_store_expires
  ON public.booking_holds (store_id, expires_at);
