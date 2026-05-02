import { Router } from 'express';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();

/** In-memory cache so we don't hit the DB on every page load. */
let cachedCount: number | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes — balances DB load with hero poll

/** Cumulative total of all orders ever recorded in the system. */
router.get('/order-count', async (_req, res, next) => {
  try {
    const now = Date.now();

    if (cachedCount !== null && now < cacheExpiry) {
      return res.json({ success: true, data: { totalOrders: cachedCount } });
    }

    const sb = getSupabaseClient();
    const { count, error } = await sb
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    cachedCount = count ?? 0;
    cacheExpiry = now + CACHE_TTL_MS;

    return res.json({ success: true, data: { totalOrders: cachedCount } });
  } catch (err) {
    next(err);
  }
});

export { router as publicStatsRoutes };
