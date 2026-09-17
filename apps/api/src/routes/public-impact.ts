import { Router } from 'express';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();

const ARTICLES_CACHE_TTL_MS = 2 * 60 * 1000;
let cachedArticleList: unknown[] | null = null;
let articleListExpiry = 0;

/** Clear the unfiltered page-1 list cache (used by "All" on the impact page). */
export function invalidatePublicArticlesCache(): void {
  cachedArticleList = null;
  articleListExpiry = 0;
}

// ── GET /articles — paginated list of published articles ─────────────────────
router.get('/articles', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '12', 10) || 12));
    const category = (req.query.category as string | undefined) ?? undefined;

    const now = Date.now();
    const isCacheable = page === 1 && !category && limit === 12;

    if (isCacheable && cachedArticleList && now < articleListExpiry) {
      return res.json({ success: true, data: cachedArticleList });
    }

    const sb = getSupabaseClient();
    let query = sb
      .from('ngo_articles')
      .select(
        'id, slug, title, excerpt, category, ngo_id, featured_image_url, meta_description, tags, published_at, ngos(id, slug, name, logo_url)',
      )
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];

    if (isCacheable) {
      cachedArticleList = rows;
      articleListExpiry = now + ARTICLES_CACHE_TTL_MS;
    }

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /articles/:slug — single published article ────────────────────────────
router.get('/articles/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params as { slug: string };

    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('ngo_articles')
      .select(
        'id, slug, title, excerpt, body_markdown, category, ngo_id, featured_image_url, meta_description, tags, published_at, ngos(id, slug, name, logo_url, website_url)',
      )
      .eq('slug', slug)
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found.' } });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── GET /ngo-totals — per-NGO donation totals (for the impact page breakdown) ─
router.get('/ngo-totals', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();

    const [ngosRes, donationsRes] = await Promise.all([
      sb.from('ngos').select('id, slug, name, logo_url, website_url').eq('is_active', true),
      sb
        .from('orders_raw')
        .select('ngo_id, charity_donation')
        .not('charity_donation', 'is', null)
        .gt('charity_donation', 0),
    ]);

    if (ngosRes.error) throw ngosRes.error;
    if (donationsRes.error) throw donationsRes.error;

    const ngos = ngosRes.data ?? [];
    const donations = donationsRes.data ?? [];

    // Sum booking-level donations per ngo_id
    const totalsMap: Record<string, number> = {};
    for (const row of donations) {
      const key = (row as { ngo_id?: string | null }).ngo_id ?? 'unassigned';
      const amount = Number((row as { charity_donation?: number | null }).charity_donation ?? 0);
      totalsMap[key] = (totalsMap[key] ?? 0) + amount;
    }

    // Be Pawsitive carries the full historical opening balance (₱282,995 paid before
    // per-booking tracking existed) plus the legacy pending amount (₱2,933).
    // These match the constants in dashboard.ts / queryCharityImpact.
    const { CHARITY_OPENING_BALANCE, CHARITY_PENDING_LEGACY } = await import('./dashboard.js');
    const bePawsitiveSlug = 'be-pawsitive';

    // Legacy orders_raw rows that predate per-NGO tracking have ngo_id = null;
    // they belong to Be Pawsitive as the original partner.
    const unassignedTotal = totalsMap['unassigned'] ?? 0;

    const result = ngos.map((ngo) => {
      const ngoTyped = ngo as { id: string; slug: string; name: string; logo_url?: string | null; website_url?: string | null };
      let bookingTotal = totalsMap[ngoTyped.id] ?? 0;

      // Be Pawsitive gets the historical opening balance + legacy pending + its own
      // orders_raw rows + any unassigned (pre-tracking) rows — but NOT other NGOs' totals.
      if (ngoTyped.slug === bePawsitiveSlug) {
        bookingTotal = CHARITY_OPENING_BALANCE + CHARITY_PENDING_LEGACY + bookingTotal + unassignedTotal;
      }

      return {
        id: ngoTyped.id,
        slug: ngoTyped.slug,
        name: ngoTyped.name,
        logoUrl: ngoTyped.logo_url ?? null,
        websiteUrl: ngoTyped.website_url ?? null,
        totalDonated: Math.round(bookingTotal * 100) / 100,
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export { router as publicImpactRoutes };
