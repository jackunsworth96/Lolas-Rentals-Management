-- Retroactively attribute active/confirmed orders to accommodation partners.
-- The RPC keeps the activated order, source raw booking, and audit record in
-- one transaction so the back office and partner portal cannot disagree.

CREATE TABLE IF NOT EXISTS public.order_partner_attribution_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          text REFERENCES public.orders(id) ON DELETE SET NULL,
  raw_order_id      uuid REFERENCES public.orders_raw(id) ON DELETE SET NULL,
  store_id          text NOT NULL REFERENCES public.stores(id),
  previous_partner_id uuid REFERENCES public.accommodation_partners(id) ON DELETE SET NULL,
  previous_partner_slug text,
  previous_partner_name text,
  new_partner_id    uuid REFERENCES public.accommodation_partners(id) ON DELETE SET NULL,
  new_partner_slug  text,
  new_partner_name  text,
  changed_by        text REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_partner_attribution_logs_order_id
  ON public.order_partner_attribution_logs(order_id, created_at);

ALTER TABLE public.order_partner_attribution_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_partner_attribution_logs_read
  ON public.order_partner_attribution_logs;
CREATE POLICY order_partner_attribution_logs_read
  ON public.order_partner_attribution_logs
  FOR SELECT
  USING (store_id = ANY(public.user_store_ids()));

DROP POLICY IF EXISTS order_partner_attribution_logs_write
  ON public.order_partner_attribution_logs;
CREATE POLICY order_partner_attribution_logs_write
  ON public.order_partner_attribution_logs
  FOR INSERT
  WITH CHECK (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_orders')
  );

CREATE OR REPLACE FUNCTION public.set_order_partner_attribution(
  p_order_id text,
  p_partner_id uuid,
  p_changed_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_raw public.orders_raw%ROWTYPE;
  v_previous_partner public.accommodation_partners%ROWTYPE;
  v_new_partner public.accommodation_partners%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status NOT IN ('active', 'confirmed') THEN
    RAISE EXCEPTION 'ORDER_NOT_ACTIVE';
  END IF;

  IF v_order.booking_token IS NULL OR btrim(v_order.booking_token) = '' THEN
    RAISE EXCEPTION 'RAW_ORDER_NOT_LINKED';
  END IF;

  SELECT * INTO v_raw
  FROM public.orders_raw
  WHERE order_reference = v_order.booking_token
    AND store_id = v_order.store_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RAW_ORDER_NOT_LINKED';
  END IF;

  IF p_partner_id IS NOT NULL THEN
    SELECT * INTO v_new_partner
    FROM public.accommodation_partners
    WHERE id = p_partner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PARTNER_NOT_FOUND';
    END IF;

    IF v_new_partner.store_id <> v_order.store_id THEN
      RAISE EXCEPTION 'PARTNER_STORE_MISMATCH';
    END IF;

    IF NOT v_new_partner.active OR COALESCE(v_new_partner.status, 'active') <> 'active' THEN
      RAISE EXCEPTION 'PARTNER_NOT_ACTIVE';
    END IF;
  END IF;

  IF v_order.partner_ref IS NOT NULL THEN
    SELECT * INTO v_previous_partner
    FROM public.accommodation_partners
    WHERE store_id = v_order.store_id
      AND slug = v_order.partner_ref
    LIMIT 1;
  END IF;

  IF v_order.partner_ref IS NOT DISTINCT FROM v_new_partner.slug
     AND v_raw.partner_ref IS NOT DISTINCT FROM v_new_partner.slug THEN
    IF p_partner_id IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'partnerId', v_new_partner.id,
      'slug', v_new_partner.slug,
      'name', v_new_partner.name
    );
  END IF;

  UPDATE public.orders
  SET partner_ref = CASE WHEN p_partner_id IS NULL THEN NULL ELSE v_new_partner.slug END,
      updated_at = now()
  WHERE id = v_order.id;

  UPDATE public.orders_raw
  SET partner_ref = CASE WHEN p_partner_id IS NULL THEN NULL ELSE v_new_partner.slug END,
      updated_at = now()
  WHERE id = v_raw.id;

  INSERT INTO public.order_partner_attribution_logs (
    order_id,
    raw_order_id,
    store_id,
    previous_partner_id,
    previous_partner_slug,
    previous_partner_name,
    new_partner_id,
    new_partner_slug,
    new_partner_name,
    changed_by
  ) VALUES (
    v_order.id,
    v_raw.id,
    v_order.store_id,
    v_previous_partner.id,
    v_order.partner_ref,
    v_previous_partner.name,
    v_new_partner.id,
    CASE WHEN p_partner_id IS NULL THEN NULL ELSE v_new_partner.slug END,
    CASE WHEN p_partner_id IS NULL THEN NULL ELSE v_new_partner.name END,
    p_changed_by
  );

  IF p_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'partnerId', v_new_partner.id,
    'slug', v_new_partner.slug,
    'name', v_new_partner.name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_partner_attribution(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_partner_attribution(text, uuid, text) TO service_role;
