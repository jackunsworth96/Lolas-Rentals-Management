import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { LoginRequestSchema } from '@lolas/shared';
import { verifyPin } from '../adapters/auth/password.js';
import { generateToken, type TokenPayload } from '../adapters/auth/jwt.js';
import { isInactiveEmployeeStatus } from '../auth/staff-login-access.js';
import { supabase } from '../adapters/supabase/client.js';
import { logSupabaseError } from '../lib/supabase-log.js';
import { authenticate, PERMISSIONS_VERSION_HEADER } from '../middleware/authenticate.js';
import { invalidateEffectiveAccess, loadEffectiveAccess } from '../services/effective-permissions.js';

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

    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('store_id, status, person_type, employee_stores(store_id)')
      .eq('id', user.employee_id)
      .maybeSingle();
    if (empErr) {
      logSupabaseError('auth/login employee lookup', empErr);
      res.status(503).json({ success: false, error: { code: 'UNAVAILABLE', message: 'Unable to verify account status' } });
      return;
    }

    if (isInactiveEmployeeStatus(employee?.status)) {
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

    invalidateEffectiveAccess(user.id);
    const access = await loadEffectiveAccess(user.id);
    if (access === 'unavailable' || !access) {
      res.status(503).json({ success: false, error: { code: 'UNAVAILABLE', message: 'Unable to load account permissions' } });
      return;
    }

    const assignedStoreIds = (employee?.employee_stores ?? []).map(
      (r: { store_id: string }) => r.store_id,
    );
    const candidateStoreIds = assignedStoreIds.length > 0
      ? Array.from(new Set(assignedStoreIds))
      : (employee?.store_id ? [employee.store_id] : []);
    const { data: activeStores, error: storeErr } = candidateStoreIds.length > 0
      ? await supabase.from('stores').select('id').in('id', candidateStoreIds).eq('is_active', true)
      : { data: [], error: null };
    if (storeErr) logSupabaseError('auth/login active stores lookup', storeErr);
    const storeIds = (activeStores ?? []).map((store) => String(store.id));

    if (candidateStoreIds.length > 0 && storeIds.length === 0) {
      res.status(403).json({ success: false, error: { code: 'ACCOUNT_DISABLED', message: 'Account has no active store assignment' } });
      return;
    }

    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      employeeId: user.employee_id,
      roleId: access.roleId,
      storeIds,
      permissions: access.permissions,
      personType: (employee?.person_type as TokenPayload['personType']) ?? 'staff',
    };

    const token = generateToken(payload);

    res.json({ success: true, data: { token, user: { ...payload, permissionsVersion: access.version } } });
  } catch (err) {
    next(err);
  }
});

/** The signed-in user with their current permissions, so the app can pick up access changes without a re-login. */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    res.json({
      success: true,
      data: {
        user: {
          userId: user.userId,
          username: user.username,
          employeeId: user.employeeId,
          roleId: user.roleId,
          storeIds: user.storeIds,
          permissions: user.permissions,
          personType: user.personType ?? 'staff',
          permissionsVersion: String(res.getHeader(PERMISSIONS_VERSION_HEADER) ?? ''),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
