import { Router } from 'express';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();

function mapReviewRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    platform: row.platform as string,
    storeId: (row.store_id as string | null) ?? null,
    date: row.date == null ? null : String(row.date).slice(0, 10),
    reviewerName: (row.reviewer_name as string) ?? '',
    reviewerRole: (row.reviewer_role as string | null) ?? null,
    starRating: Number(row.star_rating ?? 0),
    comment: (row.comment as string) ?? '',
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at as string,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('reviews')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const reviews = (data ?? []).map((r) => mapReviewRow(r as Record<string, unknown>));
    res.json({ success: true, data: reviews });
  } catch (e) {
    next(e);
  }
});

export { router as publicReviewsRoutes };
