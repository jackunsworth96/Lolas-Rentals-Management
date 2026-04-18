CREATE OR REPLACE FUNCTION public.get_transfer_summary(
  p_store_id text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outstanding jsonb;
  v_collected jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total', COALESCE(SUM(total_price), 0)
  ) INTO v_outstanding
  FROM public.transfers
  WHERE store_id = p_store_id
    AND collected_at IS NULL
    AND (p_date_from IS NULL OR service_date >= p_date_from)
    AND (p_date_to IS NULL OR service_date <= p_date_to);

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total', COALESCE(SUM(collected_amount), 0),
    'driverCut', COALESCE(SUM(
      CASE
        WHEN tr.pricing_type = 'per_head' THEN tr.driver_cut * t.pax_count
        ELSE tr.driver_cut
      END
    ), 0),
    'netLolas', COALESCE(SUM(collected_amount), 0) - COALESCE(SUM(
      CASE
        WHEN tr.pricing_type = 'per_head' THEN tr.driver_cut * t.pax_count
        ELSE tr.driver_cut
      END
    ), 0)
  ) INTO v_collected
  FROM public.transfers t
  LEFT JOIN public.transfer_routes tr
    ON tr.route = t.route AND tr.van_type = t.van_type AND tr.store_id = p_store_id
  WHERE t.store_id = p_store_id
    AND t.collected_at IS NOT NULL
    AND (p_date_from IS NULL OR t.service_date >= p_date_from)
    AND (p_date_to IS NULL OR t.service_date <= p_date_to);

  RETURN jsonb_build_object(
    'outstanding', v_outstanding,
    'collected', v_collected
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_transfer_summary(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transfer_summary(text, date, date) TO service_role;
