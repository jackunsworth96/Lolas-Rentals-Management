-- Staff notes on orders, plus a price-neutral "change return time" action.
--
-- order_notes holds free-text staff notes (kind 'note') and an automatic log
-- of every return-time change (kind 'return_change', with old/new datetimes
-- in meta). change_return_time_atomic moves order_items.dropoff_datetime —
-- the column availability, reminders and summaries all read — and records
-- the note in the same transaction. Price, rental_days_count and add-ons are
-- intentionally left untouched; extending past the paid days goes through
-- confirm_extend_order_atomic instead.

CREATE TABLE IF NOT EXISTS public.order_notes (
  id           text PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id     text NOT NULL REFERENCES stores(id),
  kind         text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'return_change')),
  body         text NOT NULL,
  meta         jsonb,
  employee_id  text REFERENCES employees(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_notes_order_created_idx
  ON public.order_notes (order_id, created_at);

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_notes_select ON public.order_notes;
CREATE POLICY order_notes_select ON public.order_notes
  FOR SELECT USING (store_id = ANY(public.user_store_ids()));

DROP POLICY IF EXISTS order_notes_modify ON public.order_notes;
CREATE POLICY order_notes_modify ON public.order_notes
  FOR ALL USING (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_orders')
  );

CREATE OR REPLACE FUNCTION public.change_return_time_atomic(
  p_order_id text,
  p_new_dropoff timestamptz,
  p_note_id text,
  p_body text,
  p_meta jsonb,
  p_employee_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id text;
  v_status text;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_status NOT IN ('active', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active or confirmed orders can have their return time changed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM order_items
    WHERE order_id = p_order_id
      AND pickup_datetime IS NOT NULL
      AND p_new_dropoff <= pickup_datetime
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return time must be after pickup');
  END IF;

  UPDATE order_items
  SET
    original_dropoff_datetime = COALESCE(original_dropoff_datetime, dropoff_datetime),
    dropoff_datetime          = p_new_dropoff
  WHERE order_id = p_order_id
    AND pickup_datetime IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order has no rental items');
  END IF;

  INSERT INTO order_notes (id, order_id, store_id, kind, body, meta, employee_id)
  VALUES (p_note_id, p_order_id, v_store_id, 'return_change', p_body, p_meta, p_employee_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_return_time_atomic(text, timestamptz, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_return_time_atomic(text, timestamptz, text, text, jsonb, text) TO service_role;
