import type { Request, Response, NextFunction } from 'express';

export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const provided = req.headers['x-api-key'];
  const expected = process.env.RESPOND_IO_API_KEY;

  // TEMPORARY: simple equality for auth debugging — restore timingSafeEqual once confirmed working.
  if (
    typeof provided !== 'string' ||
    !expected ||
    provided !== expected
  ) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  next();
}
