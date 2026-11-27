import {
  ALL_PERMISSIONS,
  PERMISSION_AREAS,
  areaLevel,
  getPermissionDefinition,
  permissionsInArea,
  type AccessLevelId,
  type PermissionArea,
  type PermissionKey,
} from '@lolas/shared';
import { ApiError } from '../../../api/client.js';
import { ALL_NAV_ITEMS } from '../../layout/nav-config.js';
import { allows } from '../../../lib/route-permissions.js';
import type { AccessHistoryEntry } from '../../../api/access.js';

export function permLabel(key: string): string {
  return getPermissionDefinition(key)?.label ?? key;
}

export function isSensitive(key: string): boolean {
  return getPermissionDefinition(key)?.sensitive === true;
}

/** "No access", a level name, or "Custom" for an area. */
export function areaLevelLabel(area: PermissionArea, selected: ReadonlySet<string>): string {
  const level = areaLevel(selected, area.id);
  if (level === 'none') return 'No access';
  if (level === 'custom') return 'Custom';
  return area.levels.find((l) => l.id === level)?.label ?? level;
}

export function levelOptions(area: PermissionArea): Array<{ id: AccessLevelId; label: string }> {
  return [{ id: 'none', label: 'No access' }, ...area.levels.map((l) => ({ id: l.id, label: l.label }))];
}

/** Plain-English list of what the selected permissions in an area unlock. */
export function grantsFor(area: PermissionArea, selected: ReadonlySet<string>): string[] {
  return permissionsInArea(area.id)
    .filter((k) => selected.has(k))
    .flatMap((k) => getPermissionDefinition(k)?.grants ?? []);
}

export function diffPermissions(before: ReadonlySet<string>, after: ReadonlySet<string>) {
  const added = ALL_PERMISSIONS.filter((k) => after.has(k) && !before.has(k));
  const removed = ALL_PERMISSIONS.filter((k) => before.has(k) && !after.has(k));
  return { added, removed };
}

/** The pages in the sidebar this set of permissions opens. */
export function visiblePages(perms: readonly string[]): string[] {
  return ALL_NAV_ITEMS.filter((i) => i.path !== '/me' && allows(i.perm as Parameters<typeof allows>[0], perms)).map((i) => i.label);
}

export function matchesSearch(area: PermissionArea, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (`${area.label} ${area.description}`.toLowerCase().includes(q)) return true;
  return permissionsInArea(area.id).some((k) => {
    const d = getPermissionDefinition(k);
    return d && `${d.label} ${d.description} ${d.grants.join(' ')}`.toLowerCase().includes(q);
  });
}

export const AREAS_BY_GROUP = PERMISSION_AREAS.reduce<Record<string, PermissionArea[]>>((acc, a) => {
  (acc[a.group] ??= []).push(a);
  return acc;
}, {});

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
    return 'Someone else changed this while you were editing. Close and reopen to see the latest version, then try again.';
  }
  if (err instanceof ApiError && err.code === 'MIGRATION_PENDING') {
    return 'The access control database upgrade has not been applied yet. Ask your developer to run it.';
  }
  return err instanceof Error ? err.message : fallback;
}

function effectLabel(token: string): string {
  const [effect, key] = token.includes(':') ? token.split(':') : ['', token];
  const label = permLabel(key ?? token);
  return effect === 'grant' ? `+ ${label}` : effect === 'revoke' ? `− ${label}` : label;
}

/** One-line summary of a history entry. */
export function describeHistory(
  e: AccessHistoryEntry,
  roleName: (id: string | null) => string,
  personName: (id: string | null) => string,
): { title: string; changes: string[] } {
  const d = e.details as Record<string, string | undefined>;
  const who = d.username ?? personName(e.targetUserId);
  switch (e.action) {
    case 'role_created': return { title: `Created role "${d.name ?? roleName(e.roleId)}"`, changes: e.added.map(permLabel) };
    case 'role_deleted': return { title: `Deleted role "${d.name ?? e.roleId}"`, changes: [] };
    case 'role_updated': return { title: `Renamed role "${d.from_name}" to "${d.to_name}"`, changes: [] };
    case 'role_permissions_changed':
      return {
        title: `Changed the ${roleName(e.roleId)} role`,
        changes: [...e.added.map((k) => `+ ${permLabel(k)}`), ...e.removed.map((k) => `− ${permLabel(k)}`)],
      };
    case 'user_created': return { title: `Created login for ${who} (${roleName(e.roleId)})`, changes: [] };
    case 'user_role_changed': return { title: `Moved ${who} from ${roleName(d.from_role ?? null)} to ${roleName(d.to_role ?? null)}`, changes: [] };
    case 'user_activated': return { title: `Reactivated ${who}`, changes: [] };
    case 'user_deactivated': return { title: `Deactivated ${who}`, changes: [] };
    case 'user_deleted': return { title: `Deleted login ${who}`, changes: [] };
    case 'overrides_changed':
      return {
        title: `Changed exceptions for ${personName(e.targetUserId)}`,
        changes: [...e.added.map((t) => `Added ${effectLabel(t)}`), ...e.removed.map((t) => `Removed ${effectLabel(t)}`)],
      };
    default: return { title: e.action, changes: [] };
  }
}

export function sortedKeys(keys: Iterable<string>): PermissionKey[] {
  const set = new Set(keys);
  return ALL_PERMISSIONS.filter((k) => set.has(k));
}
