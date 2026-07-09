import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { verifyPin } from '../adapters/auth/password.js';
import { generatePartnerToken } from '../adapters/auth/partner-jwt.js';

const router = Router();

const PartnerLoginSchema = z.object({
  partnerSlug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  username: z.string().min(1).max(120),
  pin: z.coerce.string().min(1).max(120),
});

function escapeForILikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

router.post('/login', validateBody(PartnerLoginSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof PartnerLoginSchema>;
    const sb = getSupabaseClient();

    const { data: partner, error: partnerErr } = await sb
      .from('accommodation_partners')
      .select('id, slug, name, store_id, portal_enabled, active, status')
      .or(`slug.eq.${body.partnerSlug},portal_subdomain.eq.${body.partnerSlug}`)
      .eq('active', true)
      .eq('status', 'active')
      .maybeSingle();

    if (partnerErr || !partner || !(partner as { portal_enabled?: boolean }).portal_enabled) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid partner credentials' } });
      return;
    }

    const p = partner as { id: string; slug: string; name: string; store_id: string };
    const username = body.username.trim();
    const { data: user, error: userErr } = await sb
      .from('partner_users')
      .select('id, partner_id, name, username, pin_hash, is_active')
      .eq('partner_id', p.id)
      .ilike('username', escapeForILikeExact(username))
      .limit(1)
      .maybeSingle();

    if (userErr || !user || !(user as { is_active?: boolean }).is_active) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid partner credentials' } });
      return;
    }

    const u = user as { id: string; name: string; username: string; pin_hash: string };
    const valid = await verifyPin(String(body.pin), u.pin_hash);
    if (!valid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid partner credentials' } });
      return;
    }

    await sb.from('partner_users').update({ last_login_at: new Date().toISOString() }).eq('id', u.id);

    const payload = {
      scope: 'partner' as const,
      partnerUserId: u.id,
      partnerId: p.id,
      partnerSlug: p.slug,
      storeId: p.store_id,
      username: u.username,
      name: u.name,
    };
    res.json({ success: true, data: { token: generatePartnerToken(payload), user: payload, partner: { id: p.id, slug: p.slug, name: p.name, storeId: p.store_id } } });
  } catch (err) { next(err); }
});

export { router as partnerAuthRoutes };
