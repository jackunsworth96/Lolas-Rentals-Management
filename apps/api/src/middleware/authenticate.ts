import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../adapters/auth/jwt.js';
import { readStaffLoginDecision } from '../auth/staff-login-access.js';
import { runWithActor } from '../adapters/supabase/request-actor.js';
import { loadEffectiveAccess } from '../services/effective-permissions.js';

/** Response header carrying the caller's access fingerprint; the web app refreshes permissions when it changes. */
export const PERMISSIONS_VERSION_HEADER = 'X-Permissions-Version';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

  try {
    const access = await readStaffLoginDecision(payload.userId, payload.employeeId);
    if (access === 'unavailable') {
      res.status(503).json({
        success: false,
        error: { code: 'UNAVAILABLE', message: 'Unable to verify account status' },
      });
      return;
    }
    if (access === 'denied') {
      res.status(401).json({
        success: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' },
      });
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  let access: Awaited<ReturnType<typeof loadEffectiveAccess>>;
  try {
    access = await loadEffectiveAccess(payload.userId);
  } catch (err) {
    next(err);
    return;
  }
  if (access === 'unavailable') {
    res.status(503).json({
      success: false,
      error: { code: 'UNAVAILABLE', message: 'Unable to verify account permissions' },
    });
    return;
  }
  if (!access) {
    res.status(401).json({
      success: false,
      error: { code: 'ACCOUNT_DISABLED', message: 'Account no longer exists' },
    });
    return;
  }

  req.user = { ...payload, roleId: access.roleId, permissions: access.permissions };
  res.setHeader(PERMISSIONS_VERSION_HEADER, access.version);
  runWithActor({ employeeId: payload.employeeId, userId: payload.userId }, next);
}
