import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { LoginRequestSchema } from '@lolas/shared';
import { hashPin, verifyPin } from '../adapters/auth/password.js';
import { generateToken, type TokenPayload } from '../adapters/auth/jwt.js';
import { supabase } from '../adapters/supabase/client.js';

const router = Router();

/** Exact match for ILIKE: escape %, _, and \ so they are not LIKE wildcards. */
function escapeForILikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

router.post('/login', validateBody(LoginRequestSchema), async (req, res, next) => {
  try {
    const { username, pin } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, pin_hash, employee_id, role_id, is_active')
      .ilike('username', escapeForILikeExact(username))
      .limit(1)
      .maybeSingle();

    if (error || !user) {
      if (process.env.NODE_ENV !== 'production' && error) {
        console.error('[auth/login] Supabase user lookup failed:', error.message);
      }
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ success: false, error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' } });
      return;
    }

    const valid = await verifyPin(String(pin), user.pin_hash);
    if (!valid) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[auth/login] PIN verification failed for user:', username);
      }
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    const { data: permissions } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role_id', user.role_id);

    const { data: employee } = await supabase
      .from('employees')
      .select('store_id')
      .eq('id', user.employee_id)
      .single();

    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      employeeId: user.employee_id,
      roleId: user.role_id,
      storeIds: employee?.store_id ? [employee.store_id] : [],
      permissions: (permissions ?? []).map((p) => p.permission),
    };

    const token = generateToken(payload);

    res.json({ success: true, data: { token, user: payload } });
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
