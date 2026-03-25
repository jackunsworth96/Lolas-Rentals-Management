import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../adapters/auth/jwt.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing authentication token' },
    });
    return;
  }

  const token = header.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
    return;
  }

  req.user = payload;
  next();
}
