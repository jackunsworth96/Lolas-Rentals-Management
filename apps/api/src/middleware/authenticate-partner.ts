import type { Request, Response, NextFunction } from 'express';
import { verifyPartnerToken, type PartnerTokenPayload } from '../adapters/auth/partner-jwt.js';

declare global {
  namespace Express {
    interface Request {
      partnerUser?: PartnerTokenPayload;
    }
  }
}

export function authenticatePartner(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing partner authentication token' },
    });
    return;
  }

  const payload = verifyPartnerToken(header.slice(7));
  if (!payload) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired partner token' },
    });
    return;
  }

  req.partnerUser = payload;
  next();
}
