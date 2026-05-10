import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const provided = req.headers['x-api-key'];
  const expected = process.env.RESPOND_IO_API_KEY;

  if (
    typeof provided !== 'string' ||
    !expected ||
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  next();
}
