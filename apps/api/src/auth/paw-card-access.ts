import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const PAW_CARD_AUDIENCE = 'paw-card-customer';
const PAW_CARD_ISSUER = 'lolas-api';

export interface PawCardAccessPayload {
  scope: 'paw-card:customer';
  email: string;
  customerId: string | null;
  customerName: string | null;
}

declare global {
  namespace Express {
    interface Request {
      pawCardAccess?: PawCardAccessPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

export function generatePawCardAccessToken(
  payload: Omit<PawCardAccessPayload, 'scope'>,
): string {
  return jwt.sign(
    {
      scope: 'paw-card:customer',
      email: payload.email.trim().toLowerCase(),
      customerId: payload.customerId,
      customerName: payload.customerName,
    },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      audience: PAW_CARD_AUDIENCE,
      issuer: PAW_CARD_ISSUER,
      expiresIn: '30m',
    },
  );
}

export function verifyPawCardAccessToken(token: string): PawCardAccessPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      audience: PAW_CARD_AUDIENCE,
      issuer: PAW_CARD_ISSUER,
    });
    if (
      typeof decoded === 'string'
      || decoded.scope !== 'paw-card:customer'
      || typeof decoded.email !== 'string'
      || (decoded.customerId !== null && typeof decoded.customerId !== 'string')
      || (decoded.customerName !== null && typeof decoded.customerName !== 'string')
    ) {
      return null;
    }
    return {
      scope: decoded.scope,
      email: decoded.email.trim().toLowerCase(),
      customerId: decoded.customerId,
      customerName: decoded.customerName,
    };
  } catch {
    return null;
  }
}

export function authenticatePawCardAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  const payload = header?.startsWith('Bearer ')
    ? verifyPawCardAccessToken(header.slice(7))
    : null;

  if (!payload) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired Paw Card access' },
    });
    return;
  }

  req.pawCardAccess = payload;
  next();
}
