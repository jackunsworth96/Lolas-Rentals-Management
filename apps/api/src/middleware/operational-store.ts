import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { verifyToken } from '../adapters/auth/jwt.js';
import { Permission } from '@lolas/shared';

const STORE_KEYS = new Set(['storeId', 'store_id', 'locationId', 'location_id']);

export function collectStoreIds(value: unknown, ids: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectStoreIds(item, ids);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (STORE_KEYS.has(key) && typeof item === 'string' && item) ids.add(item);
    else collectStoreIds(item, ids);
  }
}

/**
 * Reject writes explicitly targeting archived stores. Database triggers provide
 * the final backstop for store-scoped rows when a legacy route omits storeId.
 */
export async function requireOperationalStore(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (['HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const source = String(req.query.store ?? (req.body as Record<string, unknown> | undefined)?.source ?? '').toLowerCase();
  if (source === 'bass') {
    res.status(410).json({ success: false, error: { code: 'STORE_ARCHIVED', message: 'Bass Bikes is permanently closed' } });
    return;
  }

  const ids = new Set<string>();
  collectStoreIds(req.query, ids);
  collectStoreIds(req.body, ids);
  if (req.originalUrl.includes('store-bass')) ids.add('store-bass');
  if (ids.size === 0) {
    next();
    return;
  }

  try {
    const { data, error } = await getSupabaseClient()
      .from('stores')
      .select('id')
      .in('id', [...ids])
      .eq('is_active', false);
    if (error) throw error;
    if ((data ?? []).length > 0) {
      if (req.method === 'GET') {
        const header = req.headers.authorization;
        const token = header?.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
        if (!token?.permissions.includes(Permission.EditSettings)) {
          res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Archived stores require settings access' } });
          return;
        }
        next();
        return;
      }
      res.status(409).json({ success: false, error: { code: 'STORE_ARCHIVED', message: 'Archived stores are read-only' } });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
