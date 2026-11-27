import { createHash } from 'node:crypto';
import {
  expandLegacyPermissions,
  resolveEffectivePermissions,
  type PermissionKey,
  type PermissionOverride,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logSupabaseError } from '../lib/supabase-log.js';

const CACHE_MS = 15_000;

export interface EffectiveAccess {
  roleId: string;
  permissions: PermissionKey[];
  /** Changes whenever the role, its permissions or the person's overrides change. */
  version: string;
}

type CacheEntry = { access: EffectiveAccess; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** Drop cached access so the next request re-reads it (call after any access change). */
export function invalidateEffectiveAccess(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

type PgError = { code?: string; message?: string } | null;

/** True when the overhaul migration has not been applied yet (missing column or table). */
function isPreMigrationError(error: PgError): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205'
    || /permissions_version|user_permission_overrides/.test(error.message ?? '');
}

async function loadLegacyAccess(userId: string): Promise<EffectiveAccess | null | 'unavailable'> {
  const sb = getSupabaseClient();
  const { data: user, error } = await sb.from('users').select('role_id').eq('id', userId).maybeSingle();
  if (error) {
    logSupabaseError('effective access legacy user', error);
    return 'unavailable';
  }
  if (!user) return null;
  const { data: perms, error: permErr } = await sb.from('role_permissions').select('permission').eq('role_id', user.role_id);
  if (permErr) {
    logSupabaseError('effective access legacy role_permissions', permErr);
    return 'unavailable';
  }
  const keys = expandLegacyPermissions((perms ?? []).map((p) => String(p.permission)), { splitBackfill: true });
  const permissions = resolveEffectivePermissions(keys);
  const roleId = String(user.role_id);
  return { roleId, permissions, version: accessVersion(roleId, permissions) };
}

/** Short fingerprint of what the person can do; changes whenever their access changes. */
export function accessVersion(roleId: string, permissions: readonly string[]): string {
  return createHash('sha256').update(`${roleId}|${[...permissions].sort().join(',')}`).digest('hex').slice(0, 16);
}

/**
 * The person's current permissions: their role's permissions plus any
 * unexpired per-person grants, minus revokes. Read from the database (cached
 * briefly) rather than the login token, so changes apply without logging out.
 * Returns null when the user no longer exists.
 */
export async function loadEffectiveAccess(userId: string): Promise<EffectiveAccess | null | 'unavailable'> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.access;

  const sb = getSupabaseClient();
  const { data: user, error: userErr } = await sb
    .from('users')
    .select('role_id, permissions_version')
    .eq('id', userId)
    .maybeSingle();
  if (isPreMigrationError(userErr)) return loadLegacyAccess(userId);
  if (userErr) {
    logSupabaseError('effective access user', userErr);
    return 'unavailable';
  }
  if (!user) return null;

  const roleId = String(user.role_id);
  const [permsRes, overridesRes] = await Promise.all([
    sb.from('role_permissions').select('permission').eq('role_id', roleId),
    sb.from('user_permission_overrides').select('permission, effect, expires_at').eq('user_id', userId),
  ]);
  if (isPreMigrationError(overridesRes.error)) return loadLegacyAccess(userId);
  if (permsRes.error || overridesRes.error) {
    logSupabaseError('effective access role_permissions', permsRes.error);
    logSupabaseError('effective access overrides', overridesRes.error);
    return 'unavailable';
  }

  const roleKeys = expandLegacyPermissions((permsRes.data ?? []).map((p) => String(p.permission)));
  const overrides: PermissionOverride[] = (overridesRes.data ?? []).map((o) => ({
    permission: String(o.permission),
    effect: o.effect === 'revoke' ? 'revoke' : 'grant',
    expiresAt: (o.expires_at as string | null) ?? null,
  }));
  const permissions = resolveEffectivePermissions(roleKeys, overrides);
  const access: EffectiveAccess = { roleId, permissions, version: accessVersion(roleId, permissions) };

  // An override that expires soon must not outlive its expiry in the cache.
  const nextExpiry = overrides
    .map((o) => (o.expiresAt ? new Date(o.expiresAt).getTime() : Infinity))
    .filter((t) => t > Date.now())
    .reduce((min, t) => Math.min(min, t), Infinity);
  cache.set(userId, { access, expiresAt: Math.min(Date.now() + CACHE_MS, nextExpiry) });
  return access;
}
