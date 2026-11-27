import type { Request } from 'express';
import { getPermissionDefinition, isPermissionKey, Permission } from '@lolas/shared';

export type AccessError = Error & { statusCode: number; code: string; details?: unknown };

export function accessError(statusCode: number, code: string, message: string): AccessError {
  const err = new Error(message) as AccessError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function labels(keys: readonly string[]): string {
  return keys.map((k) => (isPermissionKey(k) ? `"${getPermissionDefinition(k)?.label ?? k}"` : k)).join(', ');
}

/** Nobody can hand out a permission they do not hold themselves. */
export function assertNoEscalation(req: Request, granting: readonly string[]): void {
  const held = new Set(req.user?.permissions ?? []);
  const missing = granting.filter((p) => !held.has(p));
  if (missing.length > 0) {
    throw accessError(403, 'ESCALATION_BLOCKED', `You can only give out access you have yourself. You don't have ${labels(missing)}.`);
  }
}

/** Stops someone removing their own ability to manage access. */
export function assertKeepsOwnAccessManagement(stillHasManageAccess: boolean): void {
  if (!stillHasManageAccess) {
    throw accessError(409, 'SELF_LOCKOUT', `This would remove your own "${getPermissionDefinition(Permission.ManageAccess)?.label ?? 'Manage access'}" permission. Ask another manager to make this change.`);
  }
}

const HINT_STATUS: Record<string, number> = {
  UNKNOWN_PERMISSION: 400,
  ROLE_EXISTS: 409,
  ROLE_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  LAST_ACCESS_MANAGER: 409,
  ROLE_SYSTEM: 409,
  ROLE_IN_USE: 409,
};

type PgError = { code?: string; message?: string; hint?: string | null } | null | undefined;

/** Turns a database guardrail error into a friendly HTTP error. */
export function mapAccessDbError(error: PgError, fallback: string): AccessError {
  const hint = error?.hint ?? '';
  if (hint && HINT_STATUS[hint]) return accessError(HINT_STATUS[hint], hint, error?.message ?? fallback);
  if (error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01' || error?.code === 'PGRST205') {
    return accessError(503, 'MIGRATION_PENDING', 'The access control upgrade has not been applied to the database yet.');
  }
  return accessError(500, 'ACCESS_SAVE_FAILED', `${fallback}: ${error?.message ?? 'unknown error'}`);
}
