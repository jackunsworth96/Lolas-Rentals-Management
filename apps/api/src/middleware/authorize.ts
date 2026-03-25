import type { Request, Response, NextFunction } from 'express';

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userPermissions = req.user?.permissions ?? [];

    const missing = permissions.filter((p) => !userPermissions.includes(p));

    if (missing.length > 0) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing required permissions: ${missing.join(', ')}`,
        },
      });
      return;
    }

    next();
  };
}
