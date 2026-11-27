import type { Request, Response, NextFunction } from 'express';
import { getPermissionDefinition } from '@lolas/shared';

function forbidden(res: Response, missing: string[], mode: 'all' | 'any'): void {
  const labels = missing.map((p) => getPermissionDefinition(p)?.label ?? p);
  const joined = labels.map((l) => `"${l}"`).join(mode === 'all' ? ' and ' : ' or ');
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: `You don't have access to do this. Ask a manager for the ${joined} permission.`,
      requiredPermissions: missing,
      requiredPermissionLabels: labels,
      mode,
    },
  });
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

/** The permissions a gate checks, read by the route coverage test. */
export type PermissionGate = Middleware & { permissionGate: { mode: 'all' | 'any'; permissions: readonly string[] } };

/** Passes only when the user holds every listed permission. */
export function requirePermission(...permissions: string[]): PermissionGate {
  const gate: Middleware = (req, res, next) => {
    const userPermissions = req.user?.permissions ?? [];
    const missing = permissions.filter((p) => !userPermissions.includes(p));
    if (missing.length > 0) {
      forbidden(res, missing, 'all');
      return;
    }
    next();
  };
  return Object.assign(gate, { permissionGate: { mode: 'all' as const, permissions } });
}

/** Passes when the user holds at least one of the listed permissions. */
export function requireAnyPermission(...permissions: string[]): PermissionGate {
  const gate: Middleware = (req, res, next) => {
    const userPermissions = req.user?.permissions ?? [];
    if (!permissions.some((p) => userPermissions.includes(p))) {
      forbidden(res, permissions, 'any');
      return;
    }
    next();
  };
  return Object.assign(gate, { permissionGate: { mode: 'any' as const, permissions } });
}

export function hasPermission(req: Pick<Request, 'user'>, permission: string): boolean {
  return (req.user?.permissions ?? []).includes(permission);
}
