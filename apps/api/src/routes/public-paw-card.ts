import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { lookupPawCardPublicAccess } from '../use-cases/paw-card/lookup-paw-card-public.js';

const router = Router();

const LookupBodySchema = z.object({
  email: z.string().email(),
});

function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

router.post('/lookup', validateBody(LookupBodySchema), async (req, res, next) => {
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
    let q = sb.from('paw_card_entries').select('*');
    if (period === 'month') {
      q = q.gte('created_at', startOfCurrentMonthIso());
    }
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
      .ilike('email', email)
      .limit(10);
    if (cErr) throw new Error(cErr.message);

    const customerIds = [...new Set((custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean))];
    if (customerIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const { data: orders, error: oErr } = await sb
      .from('orders')
      .select('id, order_date, status')
      .in('customer_id', customerIds)
      .order('order_date', { ascending: false })
      .limit(30);
    if (oErr) throw new Error(oErr.message);
    res.json({ success: true, data: orders ?? [] });
  } catch (err) {
    next(err);
  }
});

export { router as publicPawCardRoutes };
