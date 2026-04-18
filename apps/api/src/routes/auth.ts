import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { LoginRequestSchema } from '@lolas/shared';
import { verifyPin } from '../adapters/auth/password.js';
import { generateToken, type TokenPayload } from '../adapters/auth/jwt.js';
import { supabase } from '../adapters/supabase/client.js';
import { logSupabaseError } from '../lib/supabase-log.js';

const router = Router();

/** Exact match for ILIKE: escape %, _, and \ so they are not LIKE wildcards. */
function escapeForILikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, '\\,').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

router.post('/login', validateBody(LoginRequestSchema), async (req, res, next) => {
  try {
    const { username, pin } = req.body;
    const usernameNorm = String(username).trim();

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, pin_hash, employee_id, role_id, is_active')
      .ilike('username', escapeForILikeExact(usernameNorm))
      .limit(1)
      .maybeSingle();

    if (userErr) {
      logSupabaseError('auth/login user lookup', userErr);
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    if (!user) {
      console.error('[auth/login] No user row for username (after trim/ilike exact match)', {
        usernameLen: usernameNorm.length,
      });
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ success: false, error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' } });
      return;
    }

    if (user.pin_hash == null || user.pin_hash === '') {
      console.error('[auth/login] User has empty pin_hash — cannot verify PIN', { userId: user.id });
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    const valid = await verifyPin(String(pin), String(user.pin_hash));
    if (!valid) {
      console.error('[auth/login] PIN verification failed', { userId: user.id });
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    const { data: permissions, error: permErr } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role_id', user.role_id);
    if (permErr) {
      logSupabaseError('auth/login role_permissions', permErr);
    }

    const { data: employeeStores, error: empErr } = await supabase
      .from('employee_stores')
      .select('store_id')
      .eq('employee_id', user.employee_id);
    if (empErr) {
      logSupabaseError('auth/login employee_stores lookup', empErr);
    }
    const storeIds = employeeStores?.map((r) => r.store_id) ?? [];

    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      employeeId: user.employee_id,
      roleId: user.role_id,
      storeIds,
      permissions: (permissions ?? []).map((p) => p.permission),
    };

    const token = generateToken(payload);

    res.json({ success: true, data: { token, user: payload } });
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
