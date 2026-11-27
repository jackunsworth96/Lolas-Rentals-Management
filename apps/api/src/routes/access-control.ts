import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  Permission,
  isPermissionKey,
  resolveEffectivePermissions,
  type PermissionOverride,
} from '@lolas/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { invalidateEffectiveAccess } from '../services/effective-permissions.js';
import {
  accessError,
  assertKeepsOwnAccessManagement,
  assertNoEscalation,
  mapAccessDbError,
} from '../lib/access-guards.js';

const router = Router();
router.use(authenticate, requirePermission(Permission.ManageAccess));

const permissionKey = z.string().refine(isPermissionKey, { message: 'Unknown permission' });
const permissionList = z.array(permissionKey).max(ALL_PERMISSIONS.length).transform((keys) => [...new Set(keys)].sort());
const reason = z.string().trim().max(500).optional().default('');

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions_version: number;
  updated_at: string | null;
};

async function loadOverrides(userId: string): Promise<PermissionOverride[]> {
  const { data, error } = await getSupabaseClient()
    .from('user_permission_overrides')
    .select('permission, effect, expires_at')
    .eq('user_id', userId);
  if (error) throw mapAccessDbError(error, 'Failed to load overrides');
  return (data ?? []).map((o) => ({
    permission: String(o.permission),
    effect: o.effect === 'revoke' ? 'revoke' : 'grant',
    expiresAt: (o.expires_at as string | null) ?? null,
  }));
}

async function loadRolePermissions(roleId: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient().from('role_permissions').select('permission').eq('role_id', roleId);
  if (error) throw mapAccessDbError(error, 'Failed to load role permissions');
  return (data ?? []).map((r) => String(r.permission)).sort();
}

function actor(req: Request) {
  return { p_actor_user_id: req.user!.userId, p_actor_employee_id: req.user!.employeeId };
}

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'role';
}

// ── Roles ──

router.get('/roles', async (_req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const [rolesRes, permsRes, usersRes] = await Promise.all([
      sb.from('roles').select('id, name, description, is_system, permissions_version, updated_at').order('name'),
      sb.from('role_permissions').select('role_id, permission'),
      sb.from('users').select('role_id, is_active'),
    ]);
    const error = rolesRes.error ?? permsRes.error ?? usersRes.error;
    if (error) throw mapAccessDbError(error, 'Failed to load roles');

    const perms = new Map<string, string[]>();
    for (const row of permsRes.data ?? []) {
      const list = perms.get(String(row.role_id)) ?? [];
      list.push(String(row.permission));
      perms.set(String(row.role_id), list);
    }
    const counts = new Map<string, number>();
    for (const u of usersRes.data ?? []) {
      if (u.is_active) counts.set(String(u.role_id), (counts.get(String(u.role_id)) ?? 0) + 1);
    }
    res.json({
      success: true,
      data: ((rolesRes.data ?? []) as RoleRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.is_system,
        version: r.permissions_version,
        updatedAt: r.updated_at,
        userCount: counts.get(r.id) ?? 0,
        permissions: (perms.get(r.id) ?? []).filter(isPermissionKey).sort(),
      })),
    });
  } catch (e) { next(e); }
});

router.post('/roles', validateBody(z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().default(''),
  permissions: permissionList,
  reason,
})), async (req, res, next) => {
  try {
    const body = req.body as { name: string; description: string; permissions: string[]; reason: string };
    assertNoEscalation(req, body.permissions);

    const sb = getSupabaseClient();
    const base = `role-${slugify(body.name)}`;
    const { data: existing, error: idErr } = await sb.from('roles').select('id').like('id', `${base}%`);
    if (idErr) throw mapAccessDbError(idErr, 'Failed to create role');
    const taken = new Set((existing ?? []).map((r) => String(r.id)));
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;

    const { error } = await sb.rpc('save_role_atomic', {
      p_role_id: id,
      p_name: body.name,
      p_description: body.description,
      p_permissions: body.permissions,
      p_expected_version: null,
      p_reason: body.reason,
      ...actor(req),
      p_create: true,
    });
    if (error) throw mapAccessDbError(error, 'Failed to create role');
    invalidateEffectiveAccess();
    res.status(201).json({ success: true, data: { id, version: 1 } });
  } catch (e) { next(e); }
});

router.put('/roles/:id', validateBody(z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().default(''),
  permissions: permissionList,
  expectedVersion: z.number().int().positive(),
  reason,
})), async (req, res, next) => {
  try {
    const roleId = String(req.params.id);
    const body = req.body as { name: string; description: string; permissions: string[]; expectedVersion: number; reason: string };

    const before = new Set(await loadRolePermissions(roleId));
    assertNoEscalation(req, body.permissions.filter((p) => !before.has(p)));

    if (req.user!.roleId === roleId) {
      const ownOverrides = await loadOverrides(req.user!.userId);
      assertKeepsOwnAccessManagement(resolveEffectivePermissions(body.permissions, ownOverrides).includes(Permission.ManageAccess));
    }

    const { data, error } = await getSupabaseClient().rpc('save_role_atomic', {
      p_role_id: roleId,
      p_name: body.name,
      p_description: body.description,
      p_permissions: body.permissions,
      p_expected_version: body.expectedVersion,
      p_reason: body.reason,
      ...actor(req),
      p_create: false,
    });
    if (error) throw mapAccessDbError(error, 'Failed to save role');
    invalidateEffectiveAccess();
    res.json({ success: true, data: { id: roleId, version: Number(data) } });
  } catch (e) { next(e); }
});

router.delete('/roles/:id', async (req, res, next) => {
  try {
    if (req.user!.roleId === String(req.params.id)) throw accessError(409, 'ROLE_IN_USE', 'You cannot delete your own role.');
    const { error } = await getSupabaseClient().rpc('delete_role_atomic', {
      p_role_id: String(req.params.id),
      p_reason: String((req.body as { reason?: unknown } | undefined)?.reason ?? '').trim().slice(0, 500),
      ...actor(req),
    });
    if (error) throw mapAccessDbError(error, 'Failed to delete role');
    invalidateEffectiveAccess();
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── People ──

router.get('/users', async (_req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const [usersRes, overridesRes] = await Promise.all([
      sb.from('users').select('id, username, employee_id, role_id, is_active, permissions_version, employees(full_name, person_type)').order('username'),
      sb.from('user_permission_overrides').select('user_id, expires_at'),
    ]);
    const error = usersRes.error ?? overridesRes.error;
    if (error) throw mapAccessDbError(error, 'Failed to load people');

    const now = Date.now();
    const overrideCounts = new Map<string, number>();
    for (const o of overridesRes.data ?? []) {
      if (o.expires_at && new Date(String(o.expires_at)).getTime() <= now) continue;
      overrideCounts.set(String(o.user_id), (overrideCounts.get(String(o.user_id)) ?? 0) + 1);
    }
    res.json({
      success: true,
      data: (usersRes.data ?? []).map((u) => {
        const emp = (Array.isArray(u.employees) ? u.employees[0] : u.employees) as { full_name?: string; person_type?: string } | null;
        return {
          id: String(u.id),
          username: String(u.username),
          employeeId: String(u.employee_id),
          fullName: emp?.full_name ?? String(u.username),
          personType: emp?.person_type ?? 'staff',
          roleId: String(u.role_id),
          isActive: Boolean(u.is_active),
          version: Number(u.permissions_version ?? 1),
          activeOverrideCount: overrideCounts.get(String(u.id)) ?? 0,
        };
      }),
    });
  } catch (e) { next(e); }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data: user, error } = await sb
      .from('users')
      .select('id, username, role_id, is_active, permissions_version, employees(full_name)')
      .eq('id', String(req.params.id))
      .maybeSingle();
    if (error) throw mapAccessDbError(error, 'Failed to load person');
    if (!user) throw accessError(404, 'USER_NOT_FOUND', 'User not found');

    const [rolePermissions, overridesRes] = await Promise.all([
      loadRolePermissions(String(user.role_id)),
      sb.from('user_permission_overrides')
        .select('permission, effect, reason, expires_at, created_at, created_by_employee_id')
        .eq('user_id', String(req.params.id))
        .order('permission'),
    ]);
    if (overridesRes.error) throw mapAccessDbError(overridesRes.error, 'Failed to load overrides');

    const overrides = (overridesRes.data ?? []).map((o) => ({
      permission: String(o.permission),
      effect: (o.effect === 'revoke' ? 'revoke' : 'grant') as 'grant' | 'revoke',
      reason: String(o.reason ?? ''),
      expiresAt: (o.expires_at as string | null) ?? null,
      createdAt: String(o.created_at),
      createdByEmployeeId: (o.created_by_employee_id as string | null) ?? null,
    }));
    const emp = (Array.isArray(user.employees) ? user.employees[0] : user.employees) as { full_name?: string } | null;
    res.json({
      success: true,
      data: {
        id: String(user.id),
        username: String(user.username),
        fullName: emp?.full_name ?? String(user.username),
        roleId: String(user.role_id),
        isActive: Boolean(user.is_active),
        version: Number(user.permissions_version ?? 1),
        rolePermissions: rolePermissions.filter(isPermissionKey),
        overrides,
        effectivePermissions: resolveEffectivePermissions(rolePermissions, overrides),
      },
    });
  } catch (e) { next(e); }
});

const overrideSchema = z.object({
  permission: permissionKey,
  effect: z.enum(['grant', 'revoke']),
  reason: z.string().trim().min(3, 'Give a short reason for each exception').max(300),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
});

router.put('/users/:id/overrides', validateBody(z.object({
  overrides: z.array(overrideSchema).max(ALL_PERMISSIONS.length),
  expectedVersion: z.number().int().positive(),
})), async (req, res, next) => {
  try {
    const body = req.body as { overrides: z.infer<typeof overrideSchema>[]; expectedVersion: number };
    if (String(req.params.id) === req.user!.userId) {
      throw accessError(403, 'SELF_EDIT_BLOCKED', 'You cannot change your own access. Ask another manager.');
    }
    const keys = body.overrides.map((o) => o.permission);
    if (new Set(keys).size !== keys.length) {
      throw accessError(400, 'DUPLICATE_OVERRIDE', 'Each permission can only have one exception.');
    }
    const now = Date.now();
    if (body.overrides.some((o) => o.expiresAt && new Date(o.expiresAt).getTime() <= now)) {
      throw accessError(400, 'EXPIRY_IN_PAST', 'An expiry date must be in the future.');
    }

    const existing = await loadOverrides(String(req.params.id));
    const alreadyGranted = new Set(existing.filter((o) => o.effect === 'grant').map((o) => o.permission));
    assertNoEscalation(req, body.overrides.filter((o) => o.effect === 'grant' && !alreadyGranted.has(o.permission)).map((o) => o.permission));

    const { data, error } = await getSupabaseClient().rpc('save_user_overrides_atomic', {
      p_user_id: String(req.params.id),
      p_overrides: body.overrides,
      p_expected_version: body.expectedVersion,
      ...actor(req),
    });
    if (error) throw mapAccessDbError(error, 'Failed to save exceptions');
    invalidateEffectiveAccess(String(req.params.id));
    res.json({ success: true, data: { version: Number(data) } });
  } catch (e) { next(e); }
});

// ── History ──

router.get('/history', validateQuery(z.object({
  roleId: z.string().min(1).optional(),
  userId: z.string().uuid().optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})), async (req, res, next) => {
  try {
    const q = req.query as unknown as { roleId?: string; userId?: string; before?: number; limit: number };
    const sb = getSupabaseClient();
    let query = sb
      .from('access_audit_log')
      .select('id, occurred_at, actor_user_id, actor_employee_id, action, role_id, target_user_id, added, removed, details, reason')
      .order('id', { ascending: false })
      .limit(q.limit);
    if (q.roleId) query = query.eq('role_id', q.roleId);
    if (q.userId) query = query.eq('target_user_id', q.userId);
    if (q.before) query = query.lt('id', q.before);
    const { data, error } = await query;
    if (error) throw mapAccessDbError(error, 'Failed to load access history');

    const employeeIds = [...new Set((data ?? []).map((r) => r.actor_employee_id).filter((v): v is string => !!v))];
    const names = new Map<string, string>();
    if (employeeIds.length > 0) {
      const { data: emps } = await sb.from('employees').select('id, full_name').in('id', employeeIds);
      for (const e of emps ?? []) names.set(String(e.id), String(e.full_name));
    }
    res.json({
      success: true,
      data: (data ?? []).map((r) => ({
        id: Number(r.id),
        occurredAt: String(r.occurred_at),
        actorName: r.actor_employee_id ? names.get(String(r.actor_employee_id)) ?? null : null,
        action: String(r.action),
        roleId: (r.role_id as string | null) ?? null,
        targetUserId: (r.target_user_id as string | null) ?? null,
        added: (r.added as string[] | null) ?? [],
        removed: (r.removed as string[] | null) ?? [],
        details: (r.details as Record<string, unknown> | null) ?? {},
        reason: (r.reason as string | null) ?? null,
      })),
    });
  } catch (e) { next(e); }
});

export { router as accessControlRoutes };
