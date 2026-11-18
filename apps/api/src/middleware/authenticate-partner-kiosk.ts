import type { Request, Response, NextFunction } from 'express';
import { verifyPartnerKioskToken, type PartnerKioskTokenPayload } from '../adapters/auth/partner-jwt.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';

export interface PartnerKioskSession extends PartnerKioskTokenPayload {
  partnerName: string;
  logoUrl: string | null;
  welcomeMessage: string | null;
  kioskLocationId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      partnerKiosk?: PartnerKioskSession;
    }
  }
}

function unauthorized(res: Response, message: string) {
  res.status(401).json({ success: false, error: { code: 'KIOSK_SIGNED_OUT', message } });
}

/**
 * Kiosk tokens last 30 days, so every request re-checks that the partner, its portal
 * and the user who launched the tablet are all still active. Switching any of them
 * off signs the tablet out on its next request.
 */
export async function authenticatePartnerKiosk(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const payload = header?.startsWith('Bearer ') ? verifyPartnerKioskToken(header.slice(7)) : null;
  if (!payload) {
    unauthorized(res, 'This tablet is not signed in');
    return;
  }

  try {
    const sb = getSupabaseClient();
    const [{ data: partner, error: partnerErr }, { data: user, error: userErr }] = await Promise.all([
      sb.from('accommodation_partners')
        .select('id, name, logo_url, welcome_message, kiosk_location_id, portal_enabled, active, status')
        .eq('id', payload.partnerId)
        .maybeSingle(),
      sb.from('partner_users')
        .select('id, is_active')
        .eq('id', payload.partnerUserId)
        .eq('partner_id', payload.partnerId)
        .maybeSingle(),
    ]);
    if (partnerErr) throw new Error(`Failed to check kiosk partner: ${partnerErr.message}`);
    if (userErr) throw new Error(`Failed to check kiosk user: ${userErr.message}`);

    const p = partner as {
      name: string; logo_url: string | null; welcome_message: string | null; kiosk_location_id: number | null;
      portal_enabled: boolean; active: boolean; status: string;
    } | null;
    if (!p || !p.active || p.status !== 'active' || !p.portal_enabled || !(user as { is_active?: boolean } | null)?.is_active) {
      unauthorized(res, 'This tablet has been signed out');
      return;
    }

    req.partnerKiosk = {
      ...payload,
      partnerName: p.name,
      logoUrl: p.logo_url,
      welcomeMessage: p.welcome_message,
      kioskLocationId: p.kiosk_location_id,
    };
    next();
  } catch (err) {
    next(err);
  }
}
