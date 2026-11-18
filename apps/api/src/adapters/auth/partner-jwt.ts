import jwt from 'jsonwebtoken';

export interface PartnerTokenPayload {
  scope: 'partner';
  partnerUserId: string;
  partnerId: string;
  partnerSlug: string;
  storeId: string;
  username: string;
  name: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

export function generatePartnerToken(payload: PartnerTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
}

/** A front-desk tablet launched from the partner portal; it can only book, not see reports. */
export interface PartnerKioskTokenPayload {
  scope: 'partner_kiosk';
  partnerUserId: string;
  partnerId: string;
  partnerSlug: string;
  storeId: string;
}

export function generatePartnerKioskToken(payload: PartnerKioskTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '30d' });
}

export function verifyPartnerKioskToken(token: string): PartnerKioskTokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as Partial<PartnerKioskTokenPayload>;
    return payload.scope === 'partner_kiosk' &&
      typeof payload.partnerUserId === 'string' &&
      typeof payload.partnerId === 'string' &&
      typeof payload.partnerSlug === 'string' &&
      typeof payload.storeId === 'string'
      ? payload as PartnerKioskTokenPayload
      : null;
  } catch {
    return null;
  }
}

export function verifyPartnerToken(token: string): PartnerTokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as Partial<PartnerTokenPayload>;
    return payload.scope === 'partner' &&
      typeof payload.partnerUserId === 'string' &&
      typeof payload.partnerId === 'string' &&
      typeof payload.partnerSlug === 'string' &&
      typeof payload.storeId === 'string'
      ? payload as PartnerTokenPayload
      : null;
  } catch {
    return null;
  }
}
