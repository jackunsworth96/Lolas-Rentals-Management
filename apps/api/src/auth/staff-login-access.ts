import { logSupabaseError } from '../lib/supabase-log.js';

async function staffDb() {
  const { supabase } = await import('../adapters/supabase/client.js');
  return supabase;
}

const ACCESS_CACHE_MS = 15_000;

type AccessDecision = 'ok' | 'denied';

const accessCache = new Map<string, { decision: AccessDecision; expiresAt: number }>();

export function isInactiveEmployeeStatus(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'inactive';
}

/** Login is allowed only when the user row is active and the employee is not inactive. */
export function staffLoginDecision(input: {
  userFound: boolean;
  userActive: boolean | null | undefined;
  employeeStatus?: string | null;
}): AccessDecision {
  if (!input.userFound || input.userActive !== true) return 'denied';
  if (isInactiveEmployeeStatus(input.employeeStatus)) return 'denied';
  return 'ok';
}

export function clearStaffLoginAccessCache(): void {
  accessCache.clear();
}

/**
 * Re-check a signed-in user. Cached briefly so each API call does not wait on a lookup.
 * `unavailable` is not cached — the caller should retry rather than treat it as a denial.
 */
export async function readStaffLoginDecision(
  userId: string,
  employeeId: string,
): Promise<AccessDecision | 'unavailable'> {
  const cached = accessCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.decision;

  const supabase = await staffDb();
  const [userRes, employeeRes] = await Promise.all([
    supabase.from('users').select('is_active').eq('id', userId).maybeSingle(),
    employeeId
      ? supabase.from('employees').select('status').eq('id', employeeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (userRes.error || employeeRes.error) {
    logSupabaseError('staff login access user', userRes.error);
    logSupabaseError('staff login access employee', employeeRes.error);
    return 'unavailable';
  }

  const decision = staffLoginDecision({
    userFound: !!userRes.data,
    userActive: userRes.data?.is_active,
    employeeStatus: employeeRes.data?.status,
  });
  accessCache.set(userId, { decision, expiresAt: Date.now() + ACCESS_CACHE_MS });
  return decision;
}

/** Align the PIN login row with employee status. No-op when the employee has no user. */
export async function syncUserLoginAccess(employeeId: string, status: string): Promise<void> {
  const supabase = await staffDb();
  const { error } = await supabase
    .from('users')
    .update({ is_active: !isInactiveEmployeeStatus(status) })
    .eq('employee_id', employeeId);
  clearStaffLoginAccessCache();
  if (error) {
    logSupabaseError('sync user login access', error);
    throw new Error(`Failed to update login access: ${error.message}`);
  }
}
