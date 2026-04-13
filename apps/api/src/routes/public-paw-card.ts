import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { lookupPawCardPublicAccess } from '../use-cases/paw-card/lookup-paw-card-public.js';

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many lookup requests' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

const router = Router();

const LookupBodySchema = z.object({
  email: z.string().email(),
});

function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

router.post('/lookup', lookupLimiter, validateBody(LookupBodySchema), async (req, res, next) => {
  try {
    const { email } = req.body as { email: string };
    const data = await lookupPawCardPublicAccess(
      { customerRepo: req.app.locals.deps.customerRepo },
      { email },
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const EntriesQuerySchema = z.object({
  email: z.string().email(),
  period: z.enum(['month', 'all']),
});

router.get('/entries', validateQuery(EntriesQuerySchema), async (req, res, next) => {
  try {
    const { email, period } = req.query as { email: string; period: 'month' | 'all' };
    const access = await lookupPawCardPublicAccess(
      { customerRepo: req.app.locals.deps.customerRepo },
      { email },
    );
    if (!access.found) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Email not recognised for Paw Card access.' },
      });
      return;
    }

    const sb = getSupabaseClient();
    let q = sb.from('paw_card_entries').select('*').ilike('email', escapeIlike(email));
    if (period === 'month') {
      q = q.gte('created_at', startOfCurrentMonthIso());
    }
    q = q.order('created_at', { ascending: false }).limit(200);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

const RentalOrdersQuerySchema = z.object({
  email: z.string().email(),
});

router.get('/rental-orders', validateQuery(RentalOrdersQuerySchema), async (req, res, next) => {
  try {
    const email = (req.query.email as string).trim().toLowerCase();
    const access = await lookupPawCardPublicAccess(
      { customerRepo: req.app.locals.deps.customerRepo },
      { email },
    );
    if (!access.found) {
      res.json({ success: true, data: [] });
      return;
    }

    const sb = getSupabaseClient();
    const { data: custRows, error: cErr } = await sb
      .from('customers')
      .select('id')
      .ilike('email', escapeIlike(email))
      .limit(10);
    if (cErr) throw new Error(cErr.message);

    const customerIds = [...new Set((custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean))];
    if (customerIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const { data: orders, error: oErr } = await sb
      .from('orders')
      .select('id, order_date, status, order_reference')
      .in('customer_id', customerIds)
      .order('order_date', { ascending: false })
      .limit(30);
    if (oErr) throw new Error(oErr.message);
    res.json({ success: true, data: orders ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get('/establishments', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('paw_card_establishments')
      .select(`
        id,
        name,
        category,
        discount_headline,
        discount_conditions,
        description,
        opening_hours,
        saving_solo,
        saving_group,
        google_rating,
        google_maps_url,
        instagram_url,
        is_favourite,
        is_high_value,
        time_of_day,
        discount_code
      `)
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get('/top-establishments', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('paw_card_entries')
      .select('establishment')
      .not('establishment', 'is', null);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const name = ((row as { establishment: string }).establishment ?? '').trim();
      if (name) counts[name] = (counts[name] ?? 0) + 1;
    }
    const top10 = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    res.json({ success: true, data: top10 });
  } catch (err) {
    next(err);
  }
});

export { router as publicPawCardRoutes };
