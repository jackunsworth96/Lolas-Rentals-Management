-- Sequential model reservations reuse capacity. Exact assignments still require
-- one vehicle free for the whole rental, including the 30-minute handover.

CREATE OR REPLACE FUNCTION public.allocation_reserve(p_source jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r public.capacity_reservations; old_r public.capacity_reservations; typ text; b record; c record; chosen text; old_pool text;
BEGIN
 SELECT t.vehicle_type INTO typ FROM public.vehicle_models m JOIN public.partner_allocation_type_map t ON t.model_type=m.type WHERE m.id=p_source->>'model_id';
 IF typ IS NULL THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: vehicle type classification required for model %',p_source->>'model_id'; END IF;
 SELECT * INTO old_r FROM public.capacity_reservations WHERE source_key=p_source->>'source_key';
 IF old_r.id IS NULL AND p_source->>'predecessor' IS NOT NULL THEN
  SELECT * INTO old_r FROM public.capacity_reservations WHERE source_key=p_source->>'predecessor';
  IF old_r.id IS NOT NULL THEN UPDATE public.capacity_reservations SET source_key=p_source->>'source_key' WHERE id=old_r.id; END IF;
 END IF;
 IF old_r.id IS NOT NULL AND old_r.partner_id IS DISTINCT FROM (p_source->>'partner_id')::uuid THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: cannot change partner on an existing capacity reservation'; END IF;
 IF old_r.id IS NOT NULL AND old_r.model_id=p_source->>'model_id' AND old_r.starts_at=(p_source->>'starts_at')::timestamptz AND old_r.ends_at=(p_source->>'ends_at')::timestamptz AND old_r.vehicle_id IS NOT DISTINCT FROM p_source->>'vehicle_id' AND old_r.released_at IS NULL THEN
  UPDATE public.capacity_reservations SET expires_at=(p_source->>'expires_at')::timestamptz, actual_start=coalesce(actual_start,(p_source->>'actual_start')::timestamptz) WHERE id=old_r.id;
  RETURN;
 END IF;
 r.id:=coalesce(old_r.id,gen_random_uuid()); r.source_key:=p_source->>'source_key';r.store_id:=p_source->>'store_id';r.partner_id:=(p_source->>'partner_id')::uuid;r.vehicle_type:=typ;r.model_id:=p_source->>'model_id';r.vehicle_id:=p_source->>'vehicle_id';r.starts_at:=(p_source->>'starts_at')::timestamptz;r.ends_at:=(p_source->>'ends_at')::timestamptz;r.expires_at:=(p_source->>'expires_at')::timestamptz;r.actual_start:=coalesce(old_r.actual_start,(p_source->>'actual_start')::timestamptz);
 PERFORM public.allocation_generate(r.store_id,(r.ends_at AT TIME ZONE 'Asia/Manila')::date);
 IF r.vehicle_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id WHERE f.id=r.vehicle_id AND f.store_id=r.store_id AND f.model_id=r.model_id AND m.is_active AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')) OR EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=r.vehicle_id AND u.cancelled_at IS NULL AND u.starts_at<r.ends_at AND (u.ends_at IS NULL OR u.ends_at>r.starts_at))) THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: selected vehicle is unavailable'; END IF;
 IF r.vehicle_id IS NULL AND (
  SELECT count(*) FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id
  WHERE f.store_id=r.store_id AND f.model_id=r.model_id AND m.is_active
  AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')
  AND NOT EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=f.id AND u.cancelled_at IS NULL AND u.starts_at<r.ends_at AND (u.ends_at IS NULL OR u.ends_at>r.starts_at))
  AND NOT EXISTS(SELECT 1 FROM public.capacity_reservations x WHERE x.vehicle_id=f.id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at)
 ) <= (
  WITH periods AS (
   SELECT greatest(x.starts_at,r.starts_at) starts_at,least(x.ends_at,r.ends_at) ends_at
   FROM public.capacity_reservations x
   WHERE x.vehicle_id IS NULL AND x.model_id=r.model_id AND x.store_id=r.store_id AND x.id<>r.id
   AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now())
   AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at
  ), events AS (
   SELECT starts_at at,1 delta FROM periods UNION ALL SELECT ends_at,-1 FROM periods
  ), demand AS (
   SELECT sum(sum(delta)) OVER (ORDER BY at) qty FROM events GROUP BY at
  ) SELECT coalesce(max(qty),0) FROM demand
 ) THEN
  RAISE EXCEPTION 'ALLOCATION_CONFLICT: no vehicle of model % is free for the whole rental',r.model_id;
 END IF;
 IF r.vehicle_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.capacity_reservations x WHERE x.vehicle_id=r.vehicle_id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at) THEN
  RAISE EXCEPTION 'ALLOCATION_CONFLICT: vehicle % is already reserved',r.vehicle_id USING ERRCODE='P0001';
 END IF;
 -- Keep old segment choices while validating, then replace them only after success.
 CREATE TEMP TABLE IF NOT EXISTS allocation_new_segments(starts_at timestamptz,ends_at timestamptz,pool text) ON COMMIT DROP;
 TRUNCATE pg_temp.allocation_new_segments;
 FOR b IN SELECT at,lead(at) OVER(ORDER BY at) until FROM public.allocation_boundaries(r.store_id,typ,r.starts_at,r.ends_at) LOOP
  CONTINUE WHEN b.until IS NULL;
  SELECT * INTO c FROM public.allocation_counts(r.store_id,typ,r.model_id,r.partner_id,b.at,r.id);
  SELECT pool INTO old_pool FROM public.capacity_reservation_segments WHERE reservation_id=r.id AND starts_at<=b.at AND ends_at>b.at;
  chosen:=coalesce(old_pool,CASE WHEN r.partner_id IS NOT NULL AND c.protected_free>0 THEN 'guaranteed' ELSE 'shared' END);
  IF c.model_free<1 OR c.physical_free<1 OR (chosen='guaranteed' AND c.protected_free<1) OR (chosen='shared' AND c.shared_free<1) THEN
   RAISE EXCEPTION 'ALLOCATION_CONFLICT: % at %, booking %',typ,b.at,r.source_key USING ERRCODE='P0001';
  END IF;
  INSERT INTO pg_temp.allocation_new_segments VALUES(b.at,b.until,chosen);
 END LOOP;
 INSERT INTO public.capacity_reservations SELECT r.* ON CONFLICT (id) DO UPDATE SET source_key=excluded.source_key,model_id=excluded.model_id,vehicle_id=excluded.vehicle_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,expires_at=excluded.expires_at,actual_start=excluded.actual_start,partner_id=excluded.partner_id,vehicle_type=excluded.vehicle_type,released_at=NULL;
 DELETE FROM public.capacity_reservation_segments WHERE reservation_id=r.id;
 INSERT INTO public.capacity_reservation_segments SELECT r.id,* FROM pg_temp.allocation_new_segments;
END $$;

-- The existing allocation_lock triggers serialize booking writes per store.
-- Check final transaction state so raw -> active conversion does not block itself.
CREATE FUNCTION public.assert_vehicle_booking_available(p_source_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE booking record;
BEGIN
 SELECT * INTO booking FROM public.allocation_booking_sources WHERE source_key=p_source_key;
 IF NOT FOUND OR booking.vehicle_id IS NULL THEN RETURN; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id
  WHERE f.id=booking.vehicle_id AND f.store_id=booking.store_id AND m.is_active
  AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Retired','Pending ORCR')
 ) THEN
  RAISE EXCEPTION 'VEHICLE_UNAVAILABLE: selected motorcycle is not rentable';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.allocation_booking_sources other
  WHERE other.vehicle_id=booking.vehicle_id AND other.source_key<>booking.source_key
  AND other.starts_at<booking.ends_at AND other.ends_at>booking.starts_at
 ) THEN
  RAISE EXCEPTION 'VEHICLE_UNAVAILABLE: motorcycle % is already booked for these dates',booking.vehicle_id;
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=booking.vehicle_id
  AND u.cancelled_at IS NULL AND u.starts_at<booking.ends_at
  AND (u.ends_at IS NULL OR u.ends_at>booking.starts_at)
 ) THEN
  RAISE EXCEPTION 'VEHICLE_UNAVAILABLE: motorcycle % is reserved for owner use',booking.vehicle_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_vehicle_booking_available(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_vehicle_booking_available(text) TO service_role;

CREATE OR REPLACE FUNCTION public.allocation_source_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item record; check_booking boolean:=true;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='order_items' THEN
   check_booking:=ROW(NEW.order_id,NEW.vehicle_id,NEW.pickup_datetime,NEW.dropoff_datetime,NEW.store_id)
    IS DISTINCT FROM ROW(OLD.order_id,OLD.vehicle_id,OLD.pickup_datetime,OLD.dropoff_datetime,OLD.store_id);
  ELSIF TG_TABLE_NAME='orders_raw' THEN
   check_booking:=ROW(NEW.status,NEW.vehicle_id,NEW.pickup_datetime,NEW.dropoff_datetime,NEW.store_id,NEW.order_reference)
    IS DISTINCT FROM ROW(OLD.status,OLD.vehicle_id,OLD.pickup_datetime,OLD.dropoff_datetime,OLD.store_id,OLD.order_reference);
  ELSIF TG_TABLE_NAME='orders' THEN
   check_booking:=ROW(NEW.status,NEW.store_id,NEW.booking_token)
    IS DISTINCT FROM ROW(OLD.status,OLD.store_id,OLD.booking_token);
  END IF;
 END IF;
 IF TG_OP<>'DELETE' AND check_booking THEN
  IF TG_TABLE_NAME='order_items' THEN
   PERFORM public.assert_vehicle_booking_available('item:'||NEW.id::text);
  ELSIF TG_TABLE_NAME='orders_raw' THEN
   PERFORM public.assert_vehicle_booking_available('raw:'||NEW.id::text);
  ELSIF TG_TABLE_NAME='orders' THEN
   FOR item IN SELECT id FROM public.order_items WHERE order_id=NEW.id LOOP
    PERFORM public.assert_vehicle_booking_available('item:'||item.id);
   END LOOP;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN PERFORM public.allocation_sync(OLD.store_id);
 ELSE PERFORM public.allocation_sync(NEW.store_id); END IF;
 RETURN NULL;
END $$;
