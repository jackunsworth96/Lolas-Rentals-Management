-- Protected capacity is opt-in per store. No partner quantities are seeded.
CREATE TABLE public.partner_allocation_settings (
  store_id text PRIMARY KEY REFERENCES public.stores(id),
  enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz
);
CREATE TABLE public.partner_allocation_type_map (
  model_type text PRIMARY KEY,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('bike','tuktuk'))
);
INSERT INTO public.partner_allocation_type_map VALUES ('scooter','bike'),('bike','bike'),('motorcycle','bike'),('tuktuk','tuktuk');
CREATE TABLE public.partner_allocation_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.accommodation_partners(id),
  store_id text NOT NULL REFERENCES public.stores(id),
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('bike','tuktuk')),
  tier_name text NOT NULL,
  qty integer NOT NULL CHECK (qty >= 0),
  start_month integer NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  end_month integer NOT NULL CHECK (end_month BETWEEN 1 AND 12)
);
CREATE TABLE public.partner_allocations (
  partner_id uuid NOT NULL REFERENCES public.accommodation_partners(id),
  store_id text NOT NULL REFERENCES public.stores(id),
  vehicle_type text NOT NULL,
  effective_month date NOT NULL CHECK (extract(day FROM effective_month)=1),
  scheduled_qty integer NOT NULL CHECK (scheduled_qty >= 0),
  PRIMARY KEY (partner_id,vehicle_type,effective_month)
);
CREATE TABLE public.partner_allocation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.accommodation_partners(id),
  store_id text NOT NULL REFERENCES public.stores(id),
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('bike','tuktuk')),
  starts_on date NOT NULL,
  ends_before date NOT NULL CHECK (ends_before > starts_on),
  qty integer NOT NULL CHECK (qty >= 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE public.partner_allocation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id text NOT NULL, partner_id uuid, actor text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(), before_value jsonb, after_value jsonb
);
CREATE TABLE public.capacity_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  store_id text NOT NULL REFERENCES public.stores(id),
  partner_id uuid REFERENCES public.accommodation_partners(id),
  vehicle_type text NOT NULL,
  model_id text NOT NULL REFERENCES public.vehicle_models(id),
  vehicle_id text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  expires_at timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  released_at timestamptz
);
CREATE TABLE public.capacity_reservation_segments (
  reservation_id uuid NOT NULL REFERENCES public.capacity_reservations(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  pool text NOT NULL CHECK (pool IN ('guaranteed','shared')),
  PRIMARY KEY (reservation_id,starts_at)
);
CREATE INDEX capacity_reservations_store_dates ON public.capacity_reservations(store_id,starts_at,ends_at);
ALTER TABLE public.booking_holds ADD COLUMN partner_ref text;
ALTER TABLE public.orders_raw ADD COLUMN booking_hold_id uuid;
ALTER TABLE public.orders_raw ADD COLUMN booking_session_token text;
ALTER TABLE public.orders_raw ADD COLUMN booking_request_key uuid;
ALTER TABLE public.orders_raw ADD COLUMN booking_request_index integer;
CREATE UNIQUE INDEX orders_raw_request_unique ON public.orders_raw(store_id,partner_ref,booking_request_key,booking_request_index) WHERE booking_request_key IS NOT NULL;
CREATE UNIQUE INDEX orders_raw_booking_hold_unique ON public.orders_raw(booking_hold_id) WHERE booking_hold_id IS NOT NULL;

-- All service entry points use these same ordered locks, including rollout.
-- ponytail: locking both types serializes writes within a store; narrow to affected
-- types if store-level booking throughput ever makes this measurable.
CREATE FUNCTION public.allocation_lock(p_store text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('allocation:'||p_store||':bike',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('allocation:'||p_store||':tuktuk',0));
END $$;
CREATE FUNCTION public.allocation_partner(p_store text,p_ref text) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT id FROM public.accommodation_partners WHERE store_id=p_store
 AND (slug=p_ref OR portal_subdomain=p_ref) LIMIT 1
$$;
CREATE FUNCTION public.allocation_active_partner(p_store text,p_ref text) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT id FROM public.accommodation_partners WHERE store_id=p_store AND active AND status='active'
 AND (slug=p_ref OR portal_subdomain=p_ref) LIMIT 1
$$;
CREATE FUNCTION public.allocation_generate(p_store text,p_until date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t record; m date; n integer;
BEGIN
 PERFORM public.allocation_lock(p_store);
 FOR t IN SELECT DISTINCT partner_id,vehicle_type FROM public.partner_allocation_tiers WHERE store_id=p_store LOOP
  FOR m IN SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'Asia/Manila'), greatest(date_trunc('month',p_until::timestamp),date_trunc('month',now() AT TIME ZONE 'Asia/Manila')+interval '23 months'),interval '1 month')::date LOOP
   n:=extract(month FROM m);
   INSERT INTO public.partner_allocations(partner_id,store_id,vehicle_type,effective_month,scheduled_qty)
   SELECT t.partner_id,p_store,t.vehicle_type,m,qty FROM public.partner_allocation_tiers x
   WHERE x.partner_id=t.partner_id AND x.vehicle_type=t.vehicle_type
   AND CASE WHEN start_month<=end_month THEN n BETWEEN start_month AND end_month ELSE n>=start_month OR n<=end_month END
   ON CONFLICT DO NOTHING;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.allocation_qty(p_partner uuid,p_type text,p_at timestamptz) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT qty FROM public.partner_allocation_overrides WHERE partner_id=p_partner AND vehicle_type=p_type AND revoked_at IS NULL AND starts_on <= (p_at AT TIME ZONE 'Asia/Manila')::date AND ends_before > (p_at AT TIME ZONE 'Asia/Manila')::date),
 (SELECT scheduled_qty FROM public.partner_allocations WHERE partner_id=p_partner AND vehicle_type=p_type AND effective_month=date_trunc('month',p_at AT TIME ZONE 'Asia/Manila')::date),0)
$$;

-- Canonical source view makes raw -> active conversion one capacity commitment.
CREATE VIEW public.allocation_booking_sources AS
 SELECT 'hold:'||h.id AS source_key,h.store_id,coalesce(public.allocation_partner(h.store_id,h.partner_ref),(SELECT partner_id FROM public.capacity_reservations WHERE source_key='hold:'||h.id)) AS partner_id,
 h.vehicle_model_id AS model_id,NULL::text AS vehicle_id,h.pickup_datetime AS starts_at,h.dropoff_datetime+interval '30 minutes' AS ends_at,h.expires_at,h.created_at,NULL::text AS predecessor,NULL::timestamptz AS actual_start
 FROM public.booking_holds h WHERE h.expires_at>now() AND NOT EXISTS(SELECT 1 FROM public.orders_raw r WHERE r.booking_hold_id=h.id)
 UNION ALL
 SELECT 'raw:'||r.id,r.store_id,coalesce(public.allocation_partner(r.store_id,r.partner_ref),(SELECT partner_id FROM public.capacity_reservations WHERE source_key='raw:'||r.id),(SELECT partner_id FROM public.capacity_reservations WHERE source_key='hold:'||r.booking_hold_id)),coalesce(r.vehicle_model_id,f.model_id),r.vehicle_id,r.pickup_datetime,r.dropoff_datetime+interval '30 minutes',NULL,r.created_at,'hold:'||r.booking_hold_id,NULL
 FROM public.orders_raw r LEFT JOIN public.fleet f ON f.id=r.vehicle_id
 WHERE r.status='unprocessed' AND r.pickup_datetime IS NOT NULL AND r.dropoff_datetime IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.orders o JOIN public.order_items i ON i.order_id=o.id WHERE o.booking_token=r.order_reference)
 UNION ALL
 SELECT 'item:'||i.id,i.store_id,coalesce(public.allocation_partner(i.store_id,o.partner_ref),(SELECT partner_id FROM public.capacity_reservations WHERE source_key='item:'||i.id),(SELECT partner_id FROM public.capacity_reservations WHERE source_key='raw:'||(SELECT r.id::text FROM public.orders_raw r WHERE r.order_reference=o.booking_token LIMIT 1))),f.model_id,i.vehicle_id,i.pickup_datetime,i.dropoff_datetime+interval '30 minutes',NULL,i.created_at,
 'raw:'||(SELECT r.id::text FROM public.orders_raw r WHERE r.order_reference=o.booking_token LIMIT 1),CASE WHEN o.status='active' THEN greatest(i.pickup_datetime,now()) END
 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id LEFT JOIN public.fleet f ON f.id=i.vehicle_id
 WHERE o.status NOT IN ('cancelled','completed') AND i.pickup_datetime IS NOT NULL AND i.dropoff_datetime IS NOT NULL;

CREATE FUNCTION public.allocation_boundaries(p_store text,p_type text,p_start timestamptz,p_end timestamptz)
RETURNS TABLE(at timestamptz) LANGUAGE sql STABLE AS $$
 SELECT DISTINCT x FROM (
 SELECT p_start x UNION ALL SELECT p_end
 UNION ALL SELECT generate_series(date_trunc('month',p_start AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila',(date_trunc('month',p_end AT TIME ZONE 'Asia/Manila')+interval '1 month') AT TIME ZONE 'Asia/Manila',interval '1 month')
 UNION ALL SELECT s.starts_at FROM public.capacity_reservation_segments s JOIN public.capacity_reservations r ON r.id=s.reservation_id WHERE r.store_id=p_store AND r.vehicle_type=p_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now())
 UNION ALL SELECT s.ends_at FROM public.capacity_reservation_segments s JOIN public.capacity_reservations r ON r.id=s.reservation_id WHERE r.store_id=p_store AND r.vehicle_type=p_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now())
 UNION ALL SELECT starts_on::timestamp AT TIME ZONE 'Asia/Manila' FROM public.partner_allocation_overrides WHERE store_id=p_store AND vehicle_type=p_type AND revoked_at IS NULL
 UNION ALL SELECT ends_before::timestamp AT TIME ZONE 'Asia/Manila' FROM public.partner_allocation_overrides WHERE store_id=p_store AND vehicle_type=p_type AND revoked_at IS NULL
 UNION ALL SELECT u.starts_at FROM public.fleet_unavailability u WHERE u.store_id=p_store AND u.cancelled_at IS NULL
 UNION ALL SELECT u.ends_at FROM public.fleet_unavailability u WHERE u.store_id=p_store AND u.cancelled_at IS NULL
 ) q WHERE x>=p_start AND x<=p_end ORDER BY x
$$;
CREATE FUNCTION public.allocation_counts(p_store text,p_type text,p_model text,p_partner uuid,p_at timestamptz,p_ignore uuid DEFAULT NULL)
RETURNS TABLE(protected_free integer,shared_free integer,model_free integer,physical_free integer) LANGUAGE sql STABLE AS $$
 WITH units AS (
 SELECT f.* FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id JOIN public.partner_allocation_type_map t ON t.model_type=m.type
 WHERE f.store_id=p_store AND t.vehicle_type=p_type AND m.is_active AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')
 AND NOT EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=f.id AND u.cancelled_at IS NULL AND u.starts_at<=p_at AND u.ends_at>p_at)
 ), commitments AS (
 SELECT r.*,s.pool FROM public.capacity_reservations r JOIN public.capacity_reservation_segments s ON s.reservation_id=r.id
 WHERE r.store_id=p_store AND r.vehicle_type=p_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now()) AND r.id IS DISTINCT FROM p_ignore AND s.starts_at<=p_at AND s.ends_at>p_at
 ), guarantees AS (
 SELECT coalesce(sum(public.allocation_qty(partner_id,p_type,p_at)),0)::integer qty FROM (SELECT DISTINCT partner_id FROM public.partner_allocations WHERE store_id=p_store AND vehicle_type=p_type) p
 )
 SELECT public.allocation_qty(p_partner,p_type,p_at)-(SELECT count(*)::integer FROM commitments WHERE partner_id=p_partner AND pool='guaranteed'),
 (SELECT count(*)::integer FROM units)-(SELECT qty FROM guarantees)-(SELECT count(*)::integer FROM commitments WHERE pool='shared'),
 (SELECT count(*)::integer FROM units WHERE model_id=p_model)-(SELECT count(*)::integer FROM commitments WHERE model_id=p_model),
 (SELECT count(*)::integer FROM units)-(SELECT count(*)::integer FROM commitments)
$$;
CREATE FUNCTION public.allocation_reserve(p_source jsonb) RETURNS void LANGUAGE plpgsql AS $$
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
 IF r.vehicle_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id WHERE f.id=r.vehicle_id AND f.store_id=r.store_id AND f.model_id=r.model_id AND m.is_active AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')) OR EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=r.vehicle_id AND u.cancelled_at IS NULL AND u.starts_at<r.ends_at AND u.ends_at>r.starts_at)) THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: selected vehicle is unavailable'; END IF;
 IF r.vehicle_id IS NULL AND (
  SELECT count(*) FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id
  WHERE f.store_id=r.store_id AND f.model_id=r.model_id AND m.is_active
  AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')
  AND NOT EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=f.id AND u.cancelled_at IS NULL AND u.starts_at<r.ends_at AND u.ends_at>r.starts_at)
  AND NOT EXISTS(SELECT 1 FROM public.capacity_reservations x WHERE x.vehicle_id=f.id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at)
 ) <= (SELECT count(*) FROM public.capacity_reservations x WHERE x.vehicle_id IS NULL AND x.model_id=r.model_id AND x.store_id=r.store_id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at) THEN
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
CREATE FUNCTION public.allocation_sync(p_store text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE src record;
BEGIN
 PERFORM public.allocation_lock(p_store);
 IF NOT coalesce((SELECT enabled FROM public.partner_allocation_settings WHERE store_id=p_store),false) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.allocation_booking_sources WHERE store_id=p_store AND (model_id IS NULL OR starts_at IS NULL OR ends_at IS NULL)) THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: booking has an unknown model or invalid dates'; END IF;
 -- Release removed sources, except predecessors being transferred in this transaction.
 UPDATE public.capacity_reservations r SET released_at=CASE WHEN actual_start IS NOT NULL THEN now()+interval '30 minutes' ELSE now() END,actual_end=CASE WHEN actual_start IS NOT NULL THEN least(now(),ends_at-interval '30 minutes') END
 WHERE store_id=p_store AND released_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.allocation_booking_sources s WHERE s.source_key=r.source_key OR s.predecessor=r.source_key);
 UPDATE public.capacity_reservation_segments s SET ends_at=least(s.ends_at,r.released_at) FROM public.capacity_reservations r WHERE r.id=s.reservation_id AND r.store_id=p_store AND r.released_at>now() AND s.starts_at<r.released_at;
 DELETE FROM public.capacity_reservation_segments s USING public.capacity_reservations r WHERE r.id=s.reservation_id AND r.store_id=p_store AND r.released_at>now() AND s.starts_at>=r.released_at;
 FOR src IN SELECT * FROM public.allocation_booking_sources WHERE store_id=p_store AND ends_at>now() ORDER BY created_at,source_key LOOP
  PERFORM public.allocation_reserve(to_jsonb(src));
 END LOOP;
END $$;
CREATE FUNCTION public.allocation_source_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM public.allocation_lock(OLD.store_id); RETURN OLD; END IF;
 IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('booking_holds','orders_raw') THEN
  IF NEW.partner_ref IS NOT NULL AND coalesce((SELECT enabled FROM public.partner_allocation_settings WHERE store_id=NEW.store_id),false) AND public.allocation_active_partner(NEW.store_id,NEW.partner_ref) IS NULL THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: partner is inactive or outside store'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id AND (EXISTS(SELECT 1 FROM public.partner_allocation_settings WHERE store_id=OLD.store_id AND enabled) OR EXISTS(SELECT 1 FROM public.partner_allocation_settings WHERE store_id=NEW.store_id AND enabled)) THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: cannot move a booking or vehicle between allocation stores'; END IF;
 END IF;
 PERFORM public.allocation_lock(NEW.store_id); RETURN NEW;
END $$;
CREATE FUNCTION public.allocation_source_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM public.allocation_sync(OLD.store_id); ELSE PERFORM public.allocation_sync(NEW.store_id); END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['booking_holds','orders_raw','orders','order_items'] LOOP
  EXECUTE format('CREATE TRIGGER allocation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.allocation_source_lock()',tab);
  EXECUTE format('CREATE CONSTRAINT TRIGGER allocation_sync AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.allocation_source_sync()',tab);
 END LOOP;
END $$;

-- Configuration is only written through the audited RPC below.
CREATE FUNCTION public.allocation_validate(p_store text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE x record; b record; c record; until_at timestamptz;
BEGIN
 IF coalesce((SELECT enabled FROM public.partner_allocation_settings WHERE store_id=p_store),false) AND EXISTS(SELECT 1 FROM public.fleet f LEFT JOIN public.vehicle_models m ON m.id=f.model_id LEFT JOIN public.partner_allocation_type_map t ON t.model_type=m.type WHERE f.store_id=p_store AND f.status NOT IN ('Sold','Closed') AND t.vehicle_type IS NULL) THEN
  RAISE EXCEPTION 'Classify every fleet model before enabling allocations';
 END IF;
 FOR x IN SELECT DISTINCT partner_id,vehicle_type FROM public.partner_allocation_tiers WHERE store_id=p_store LOOP
  IF EXISTS(SELECT n FROM generate_series(1,12) n LEFT JOIN public.partner_allocation_tiers t ON t.partner_id=x.partner_id AND t.vehicle_type=x.vehicle_type AND CASE WHEN start_month<=end_month THEN n BETWEEN start_month AND end_month ELSE n>=start_month OR n<=end_month END GROUP BY n HAVING count(t.id)<>1) THEN RAISE EXCEPTION 'Seasons must cover each month exactly once for % / %',x.partner_id,x.vehicle_type; END IF;
 END LOOP;
 until_at:=greatest(now()+interval '24 months',coalesce((SELECT max(ends_at) FROM public.capacity_reservations WHERE store_id=p_store),now()),coalesce((SELECT max(ends_before)::timestamp AT TIME ZONE 'Asia/Manila' FROM public.partner_allocation_overrides WHERE store_id=p_store AND revoked_at IS NULL),now()));
 PERFORM public.allocation_generate(p_store,(until_at AT TIME ZONE 'Asia/Manila')::date);
 FOR x IN SELECT DISTINCT vehicle_type FROM public.partner_allocation_type_map LOOP
  FOR b IN SELECT at FROM public.allocation_boundaries(p_store,x.vehicle_type,now(),until_at) LOOP
   SELECT * INTO c FROM public.allocation_counts(p_store,x.vehicle_type,NULL,NULL,b.at);
   IF c.shared_free<0 OR c.physical_free<0 THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: shared capacity shortfall for % at %',x.vehicle_type,b.at; END IF;
   IF EXISTS(SELECT 1 FROM public.vehicle_models m JOIN public.fleet f ON f.model_id=m.id JOIN public.partner_allocation_type_map t ON t.model_type=m.type WHERE f.store_id=p_store AND t.vehicle_type=x.vehicle_type GROUP BY m.id HAVING (SELECT model_free FROM public.allocation_counts(p_store,x.vehicle_type,m.id,NULL,b.at))<0) THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: model capacity shortfall for % at %',x.vehicle_type,b.at; END IF;
   IF EXISTS(SELECT 1 FROM public.capacity_reservations r JOIN public.capacity_reservation_segments s ON s.reservation_id=r.id WHERE r.store_id=p_store AND r.vehicle_type=x.vehicle_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now()) AND s.pool='guaranteed' AND s.starts_at<=b.at AND s.ends_at>b.at GROUP BY r.partner_id HAVING count(*)>public.allocation_qty(r.partner_id,x.vehicle_type,b.at)) THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: protected bookings exceed allocation at %',b.at; END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.allocation_configure(p_store text,p_partner uuid,p_actor text,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE before_value jsonb; entry jsonb; typ text; result jsonb;
BEGIN
 PERFORM public.allocation_lock(p_store);
 IF NOT EXISTS(SELECT 1 FROM public.accommodation_partners WHERE id=p_partner AND store_id=p_store) THEN RAISE EXCEPTION 'Partner does not belong to store'; END IF;
 SELECT jsonb_agg(to_jsonb(t)) INTO before_value FROM public.partner_allocation_tiers t WHERE partner_id=p_partner;
 IF p_action='tiers' THEN
  typ:=p_data->>'vehicleType';
  DELETE FROM public.partner_allocation_tiers WHERE partner_id=p_partner AND vehicle_type=typ;
  FOR entry IN SELECT * FROM jsonb_array_elements(p_data->'tiers') LOOP
   INSERT INTO public.partner_allocation_tiers(partner_id,store_id,vehicle_type,tier_name,qty,start_month,end_month) VALUES(p_partner,p_store,typ,entry->>'name',(entry->>'qty')::integer,(entry->>'startMonth')::integer,(entry->>'endMonth')::integer);
  END LOOP;
  -- Preserve the current/past baseline. New schedules take effect next month.
  DELETE FROM public.partner_allocations WHERE partner_id=p_partner AND vehicle_type=typ AND effective_month>date_trunc('month',now() AT TIME ZONE 'Asia/Manila')::date;
 ELSIF p_action='classify' THEN
  IF EXISTS(SELECT 1 FROM public.fleet f JOIN public.partner_allocation_settings a ON a.store_id=f.store_id JOIN public.vehicle_models m ON m.id=f.model_id JOIN public.partner_allocation_type_map t ON t.model_type=m.type WHERE f.model_id=p_data->>'modelId' AND a.enabled) OR EXISTS(SELECT 1 FROM public.capacity_reservations r WHERE r.model_id=p_data->>'modelId' AND (r.released_at IS NULL OR r.released_at>now())) THEN RAISE EXCEPTION 'Cannot reclassify a model already used by enabled allocations'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.fleet WHERE store_id=p_store AND model_id=p_data->>'modelId') THEN RAISE EXCEPTION 'Model does not belong to store'; END IF;
  UPDATE public.vehicle_models SET type=p_data->>'modelType' WHERE id=p_data->>'modelId';
  IF coalesce((SELECT enabled FROM public.partner_allocation_settings WHERE store_id=p_store),false) THEN
   BEGIN
    PERFORM public.allocation_validate(p_store);
    DELETE FROM public.partner_allocation_shortfalls WHERE store_id=p_store;
   EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.partner_allocation_shortfalls(store_id,message) VALUES(p_store,SQLERRM) ON CONFLICT(store_id) DO UPDATE SET message=excluded.message,detected_at=now();
   END;
  END IF;
 ELSIF p_action='override' THEN
  IF (p_data->>'startsOn')::date<(now() AT TIME ZONE 'Asia/Manila')::date THEN RAISE EXCEPTION 'Overrides cannot change historical dates'; END IF;
  IF EXISTS(SELECT 1 FROM public.partner_allocation_overrides WHERE partner_id=p_partner AND vehicle_type=p_data->>'vehicleType' AND revoked_at IS NULL AND starts_on<(p_data->>'endsBefore')::date AND ends_before>(p_data->>'startsOn')::date) THEN RAISE EXCEPTION 'Override overlaps an existing override'; END IF;
  INSERT INTO public.partner_allocation_overrides(partner_id,store_id,vehicle_type,starts_on,ends_before,qty,reason,created_by) VALUES(p_partner,p_store,p_data->>'vehicleType',(p_data->>'startsOn')::date,(p_data->>'endsBefore')::date,(p_data->>'qty')::integer,p_data->>'reason',p_actor);
 ELSIF p_action='revoke' THEN
  IF EXISTS(SELECT 1 FROM public.partner_allocation_overrides WHERE id=(p_data->>'id')::uuid AND starts_on<=(now() AT TIME ZONE 'Asia/Manila')::date) THEN RAISE EXCEPTION 'Started overrides cannot be revoked; their history must be preserved'; END IF;
  UPDATE public.partner_allocation_overrides SET revoked_at=now() WHERE id=(p_data->>'id')::uuid AND partner_id=p_partner;
 ELSIF p_action IN ('preview','activate') THEN
  IF NOT EXISTS(SELECT 1 FROM public.partner_allocation_tiers WHERE store_id=p_store) THEN RAISE EXCEPTION 'Configure approved seasonal quantities first'; END IF;
  IF coalesce((SELECT enabled FROM public.partner_allocation_settings WHERE store_id=p_store),false) THEN RAISE EXCEPTION 'Store allocations are already enabled'; END IF;
  -- A subtransaction permits a real dry run of the exact migration.
  BEGIN
   PERFORM public.allocation_validate(p_store);
   INSERT INTO public.partner_allocation_settings(store_id,enabled,activated_at) VALUES(p_store,true,now()) ON CONFLICT(store_id) DO UPDATE SET enabled=true,activated_at=now();
   PERFORM public.allocation_sync(p_store);
   PERFORM public.allocation_validate(p_store);
   SELECT jsonb_build_object('ready',true,'reservations',count(*)) INTO result FROM public.capacity_reservations WHERE store_id=p_store;
   IF p_action='preview' THEN RAISE SQLSTATE 'P0002' USING MESSAGE='preview rollback'; END IF;
  EXCEPTION WHEN SQLSTATE 'P0002' THEN RETURN result;
  END;
 ELSE RAISE EXCEPTION 'Unknown allocation action';
 END IF;
 IF p_action<>'classify' THEN PERFORM public.allocation_validate(p_store); END IF;
 INSERT INTO public.partner_allocation_audit(store_id,partner_id,actor,before_value,after_value) VALUES(p_store,p_partner,p_actor,before_value,jsonb_build_object('action',p_action,'data',p_data));
 RETURN coalesce(result,jsonb_build_object('saved',true));
END $$;

-- Service-only tables/functions: API checks staff permissions and store membership.
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['partner_allocation_settings','partner_allocation_type_map','partner_allocation_tiers','partner_allocations','partner_allocation_overrides','partner_allocation_audit','capacity_reservations','capacity_reservation_segments'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 REVOKE ALL ON public.allocation_booking_sources FROM anon,authenticated;
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'allocation_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;

CREATE FUNCTION public.allocation_availability(p_store text,p_start timestamptz,p_end timestamptz,p_ref text DEFAULT NULL,p_exclude_session text DEFAULT NULL,p_exclude_item text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE m record; b record; c record; partner uuid; total integer; pf integer; sf integer; segments jsonb; models jsonb:='[]'; ignored integer; ignored_guaranteed integer; ignored_shared integer;
BEGIN
 IF NOT coalesce((SELECT enabled FROM public.partner_allocation_settings WHERE store_id=p_store),false) THEN RETURN NULL; END IF;
 PERFORM public.allocation_generate(p_store,(p_end AT TIME ZONE 'Asia/Manila')::date);
 partner:=public.allocation_active_partner(p_store,p_ref);
 FOR m IN SELECT DISTINCT v.id,v.name,t.vehicle_type FROM public.vehicle_models v JOIN public.fleet f ON f.model_id=v.id JOIN public.partner_allocation_type_map t ON t.model_type=v.type WHERE f.store_id=p_store AND v.is_active LOOP
  total:=2147483647; pf:=2147483647;sf:=2147483647;segments:='[]';
  FOR b IN SELECT at,lead(at) OVER(ORDER BY at) until FROM public.allocation_boundaries(p_store,m.vehicle_type,p_start,p_end+interval '30 minutes') LOOP
   CONTINUE WHEN b.until IS NULL;
   SELECT * INTO c FROM public.allocation_counts(p_store,m.vehicle_type,m.id,partner,b.at);
   SELECT count(*) FILTER(WHERE r.model_id=m.id),count(*) FILTER(WHERE s.pool='guaranteed' AND r.partner_id=partner),count(*) FILTER(WHERE s.pool='shared') INTO ignored,ignored_guaranteed,ignored_shared
   FROM public.capacity_reservations r JOIN public.capacity_reservation_segments s ON s.reservation_id=r.id WHERE r.store_id=p_store AND r.vehicle_type=m.vehicle_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now()) AND s.starts_at<=b.at AND s.ends_at>b.at
   AND (r.source_key='item:'||p_exclude_item OR r.source_key IN(SELECT 'hold:'||id FROM public.booking_holds WHERE session_token=p_exclude_session));
   c.protected_free:=greatest(0,c.protected_free+ignored_guaranteed);c.shared_free:=greatest(0,c.shared_free+ignored_shared);
   total:=least(total,greatest(0,c.model_free+ignored),c.protected_free+c.shared_free);
   pf:=least(pf,c.protected_free);sf:=least(sf,c.shared_free);
   IF b.at<p_end THEN segments:=segments||jsonb_build_array(jsonb_build_object('startsAt',b.at,'endsAt',least(b.until,p_end),'protectedAvailable',c.protected_free,'sharedAvailable',c.shared_free)); END IF;
  END LOOP;
  models:=models||jsonb_build_array(jsonb_build_object('modelId',m.id,'modelName',m.name,'availableCount',total)||CASE WHEN partner IS NOT NULL THEN jsonb_build_object('allocation',jsonb_build_object('vehicleType',m.vehicle_type,'protectedAvailable',pf,'sharedAvailable',sf,'segments',segments)) ELSE '{}'::jsonb END);
 END LOOP;
 RETURN models;
END $$;
REVOKE ALL ON FUNCTION public.allocation_availability(text,timestamptz,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocation_availability(text,timestamptz,timestamptz,text,text,text) TO service_role;

-- Hold conversion is idempotent and commits before notifications are sent.
CREATE FUNCTION public.allocation_insert_bookings(p_rows jsonb) RETURNS SETOF public.orders_raw LANGUAGE plpgsql AS $$
DECLARE j jsonb; r public.orders_raw; h public.booking_holds; s text;
BEGIN
 FOR s IN SELECT DISTINCT value->>'store_id' FROM jsonb_array_elements(p_rows) ORDER BY 1 LOOP PERFORM public.allocation_lock(s); END LOOP;
 FOR j IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  SELECT * INTO r FROM public.orders_raw WHERE booking_hold_id=(j->>'booking_hold_id')::uuid;
  IF r.id IS NOT NULL THEN RETURN NEXT r; CONTINUE; END IF;
  SELECT * INTO h FROM public.booking_holds WHERE id=(j->>'booking_hold_id')::uuid FOR UPDATE;
  IF h.id IS NULL OR h.expires_at<=now() OR h.store_id<>j->>'store_id' OR h.vehicle_model_id<>j->>'vehicle_model_id' OR h.pickup_datetime<>(j->>'pickup_datetime')::timestamptz OR h.dropoff_datetime<>(j->>'dropoff_datetime')::timestamptz OR public.allocation_partner(h.store_id,h.partner_ref) IS DISTINCT FROM public.allocation_partner(j->>'store_id',j->>'partner_ref') THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: hold expired or booking differs from hold'; END IF;
  -- Populate supplied columns only, retaining defaults for all other raw fields.
  EXECUTE (SELECT 'INSERT INTO public.orders_raw ('||string_agg(format('%I',key),',')||') SELECT '||string_agg(format('(jsonb_populate_record(NULL::public.orders_raw,$1)).%I',key),',')||' RETURNING *' FROM jsonb_object_keys(j) key) INTO r USING j;
  RETURN NEXT r;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.allocation_insert_bookings(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocation_insert_bookings(jsonb) TO service_role;
CREATE FUNCTION public.allocation_insert_holds(p_rows jsonb) RETURNS SETOF public.booking_holds LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
 FOR s IN SELECT DISTINCT value->>'store_id' FROM jsonb_array_elements(p_rows) ORDER BY 1 LOOP PERFORM public.allocation_lock(s); END LOOP;
 RETURN QUERY INSERT INTO public.booking_holds(id,store_id,vehicle_model_id,pickup_datetime,dropoff_datetime,session_token,expires_at,partner_ref)
 SELECT coalesce(x.id,gen_random_uuid()),x.store_id,x.vehicle_model_id,x.pickup_datetime,x.dropoff_datetime,x.session_token,x.expires_at,x.partner_ref FROM jsonb_populate_recordset(NULL::public.booking_holds,p_rows) x RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.allocation_insert_holds(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocation_insert_holds(jsonb) TO service_role;

CREATE TABLE public.partner_allocation_shortfalls (
 store_id text PRIMARY KEY REFERENCES public.stores(id), message text NOT NULL, detected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_allocation_shortfalls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_allocation_shortfalls FROM anon,authenticated;
GRANT ALL ON public.partner_allocation_shortfalls TO service_role;
CREATE FUNCTION public.allocation_fleet_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE store text;
BEGIN
 store:=CASE WHEN TG_OP='DELETE' THEN OLD.store_id ELSE NEW.store_id END;
 IF coalesce((SELECT enabled FROM public.partner_allocation_settings WHERE store_id=store),false) THEN
  BEGIN
   PERFORM public.allocation_validate(store);
   DELETE FROM public.partner_allocation_shortfalls WHERE store_id=store;
  EXCEPTION WHEN OTHERS THEN
   INSERT INTO public.partner_allocation_shortfalls(store_id,message) VALUES(store,SQLERRM) ON CONFLICT(store_id) DO UPDATE SET message=excluded.message,detected_at=now();
   RAISE WARNING 'Allocation capacity shortfall in %: %',store,SQLERRM;
  END;
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['fleet','fleet_unavailability'] LOOP
  EXECUTE format('CREATE TRIGGER allocation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.allocation_source_lock()',tab);
  EXECUTE format('CREATE CONSTRAINT TRIGGER allocation_fleet_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.allocation_fleet_changed()',tab);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.allocation_fleet_changed() FROM PUBLIC,anon,authenticated;

-- Add partner attribution inside the existing atomic staff activation transaction.
CREATE FUNCTION public.allocation_activate_order(p_args jsonb,p_partner_ref text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE call_args text; store text:=p_args->>'p_store_id';
BEGIN
 PERFORM public.allocation_lock(store);
 IF p_partner_ref IS NOT NULL AND public.allocation_active_partner(store,p_partner_ref) IS NULL THEN RAISE EXCEPTION 'Invalid partner for store'; END IF;
 SELECT string_agg(format('%I => ($1->>%L)::%s',a.name,a.name,format_type(a.typ,NULL)),',' ORDER BY a.ordinality) INTO call_args
 FROM pg_proc p CROSS JOIN LATERAL unnest(p.proargnames,p.proargtypes::oid[]) WITH ORDINALITY a(name,typ,ordinality)
 WHERE p.pronamespace='public'::regnamespace AND p.proname='activate_order_atomic' AND p_args ? a.name;
 IF call_args IS NULL THEN RAISE EXCEPTION 'Atomic activation function unavailable'; END IF;
 EXECUTE 'SELECT public.activate_order_atomic('||call_args||')' USING p_args;
 UPDATE public.orders SET partner_ref=p_partner_ref WHERE id=p_args->>'p_order_id' AND store_id=store;
END $$;
REVOKE ALL ON FUNCTION public.allocation_activate_order(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocation_activate_order(jsonb,text) TO service_role;
