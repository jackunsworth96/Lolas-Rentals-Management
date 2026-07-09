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
