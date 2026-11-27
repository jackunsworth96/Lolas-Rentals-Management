import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { getPermissionDefinition, isPermissionKey } from '@lolas/shared';
import { useAuthStore } from '../../stores/auth-store.js';
import { allows, ROUTE_PERMISSIONS, type BackofficePath, type PermissionRule } from '../../lib/route-permissions.js';

function ruleLabels(rule: PermissionRule): string[] {
  if (!rule) return [];
  const keys = typeof rule === 'string' ? [rule] : [...rule];
  return keys.map((k) => (isPermissionKey(k) ? getPermissionDefinition(k)?.label ?? k : k));
}

export function NoAccess({ rule }: { rule: PermissionRule }) {
  const labels = ruleLabels(rule);
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm" role="alert">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Lock className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-gray-900">You don't have access to this page</h1>
      {labels.length > 0 && (
        <p className="mt-2 text-sm text-gray-600">
          Ask a manager for {labels.length > 1 ? 'one of these permissions' : 'the permission'}:{' '}
          <span className="font-medium text-gray-800">{labels.map((l) => `"${l}"`).join(' or ')}</span>
        </p>
      )}
      <Link
        to="/dashboard"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-teal-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

/** Renders the page only when the signed-in user holds the permission the route manifest names for it. */
export function RequirePermission({ path, children }: { path: BackofficePath; children: React.ReactNode }) {
  const perms = useAuthStore((s) => s.user?.permissions ?? EMPTY);
  const rule: PermissionRule = ROUTE_PERMISSIONS[path];
  if (!allows(rule, perms)) return <NoAccess rule={rule} />;
  return <>{children}</>;
}

const EMPTY: string[] = [];
