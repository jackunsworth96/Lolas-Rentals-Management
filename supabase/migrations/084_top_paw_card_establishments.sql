-- 084: top_paw_card_establishments RPC
-- Replaces the client-side loop/sort that fetched every paw_card_entries row.
-- Aggregates redemption counts in SQL and returns the top-N establishments.
--
-- NOTE: The hot-path is paw_card_entries (not paw_card_establishments).
-- paw_card_establishments only has id/name/is_active in the schema; the rich
-- columns (is_featured, sort_order, logo_url, etc.) referenced in the task
-- spec do not exist on that table. We therefore aggregate from paw_card_entries
-- so that (a) the actual performance problem is solved, and (b) the existing
-- frontend contract { name, count } is preserved without any UI changes.

CREATE OR REPLACE FUNCTION public.top_paw_card_establishments(p_limit int DEFAULT 10)
RETURNS TABLE (name text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    trim(establishment)  AS name,
    count(*)             AS count
  FROM public.paw_card_entries
  WHERE establishment IS NOT NULL
    AND trim(establishment) <> ''
  GROUP BY trim(establishment)
  ORDER BY count(*) DESC, trim(establishment) ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.top_paw_card_establishments(int) TO anon;
GRANT EXECUTE ON FUNCTION public.top_paw_card_establishments(int) TO authenticated;
