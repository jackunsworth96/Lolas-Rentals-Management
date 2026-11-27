import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  LEGACY_PERMISSION_ALIASES,
  PERMISSION_AREAS,
  PERMISSION_CATALOGUE,
  PERMISSION_SPLIT_BACKFILL,
  Permission,
  applyAreaLevel,
  areaLevel,
  dependentPermissions,
  expandLegacyPermissions,
  resolveEffectivePermissions,
  togglePermission,
  withRequiredPermissions,
  type PermissionKey,
} from '@lolas/shared';

const ROOT = resolve(__dirname, '../../..');
const OVERHAUL_MIGRATION = join(ROOT, 'supabase/migrations/20261127050000_permissions_overhaul.sql');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('permission catalogue integrity', () => {
  it('has no duplicate keys', () => {
    const values = Object.values(Permission);
    expect(new Set(values).size).toBe(values.length);
  });

  it('describes every permission and nothing else', () => {
    expect(Object.keys(PERMISSION_CATALOGUE).sort()).toEqual([...ALL_PERMISSIONS].sort());
    for (const key of ALL_PERMISSIONS) {
      const def = PERMISSION_CATALOGUE[key];
      expect(def.key, key).toBe(key);
      expect(def.label.trim(), key).not.toBe('');
      expect(def.description.trim(), key).not.toBe('');
      expect(def.grants.length, `${key} lists what it lets people do`).toBeGreaterThan(0);
    }
  });

  it('only depends on known permissions, without cycles', () => {
    for (const key of ALL_PERMISSIONS) {
      for (const dep of PERMISSION_CATALOGUE[key].requires ?? []) {
        expect(ALL_PERMISSIONS, `${key} requires ${dep}`).toContain(dep);
      }
      const visiting = new Set<string>();
      const walk = (k: PermissionKey): void => {
        expect(visiting.has(k), `cycle through ${k}`).toBe(false);
        visiting.add(k);
        for (const d of PERMISSION_CATALOGUE[k].requires ?? []) walk(d);
        visiting.delete(k);
      };
      walk(key);
    }
  });

  it('puts every permission in exactly one existing area', () => {
    const areaIds = new Set(PERMISSION_AREAS.map((a) => a.id));
    expect(areaIds.size).toBe(PERMISSION_AREAS.length);
    for (const key of ALL_PERMISSIONS) expect(areaIds, key).toContain(PERMISSION_CATALOGUE[key].area);
  });

  it('builds each area from cumulative, self-contained levels', () => {
    for (const area of PERMISSION_AREAS) {
      let previous: readonly string[] = [];
      for (const level of area.levels) {
        for (const k of level.permissions) expect(PERMISSION_CATALOGUE[k].area, `${area.id}/${level.id} has ${k}`).toBe(area.id);
        for (const k of previous) expect(level.permissions, `${area.id}/${level.id} keeps ${k}`).toContain(k);
        const deps = [...withRequiredPermissions(level.permissions)].filter((k) => PERMISSION_CATALOGUE[k].area === area.id);
        for (const k of deps) expect(level.permissions, `${area.id}/${level.id} needs ${k}`).toContain(k);
        previous = level.permissions;
      }
    }
  });

  it('seeds every permission in the overhaul migration', () => {
    const sql = readFileSync(OVERHAUL_MIGRATION, 'utf8');
    const missing = ALL_PERMISSIONS.filter((k) => !sql.includes(`'${k}'`));
    expect(missing).toEqual([]);
  });

  it('maps legacy keys only to current keys', () => {
    for (const [from, to] of Object.entries(LEGACY_PERMISSION_ALIASES)) {
      expect(ALL_PERMISSIONS, from).not.toContain(from);
      for (const k of to) expect(ALL_PERMISSIONS).toContain(k);
    }
    for (const rule of PERMISSION_SPLIT_BACKFILL) for (const k of rule.grant) expect(ALL_PERMISSIONS).toContain(k);
  });

  it('has no unknown permission strings in the API or web source', () => {
    const known = new Set<string>([...ALL_PERMISSIONS, ...Object.keys(LEGACY_PERMISSION_ALIASES)]);
    const unknown: string[] = [];
    for (const dir of ['apps/api/src', 'apps/web/src']) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/['"`](can_[a-z0-9_]+)['"`]/g)) {
          if (!known.has(m[1])) unknown.push(`${file.slice(ROOT.length + 1)}: ${m[1]}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe('dependencies and levels', () => {
  it('turning a permission on adds what it needs; turning it off removes what needs it', () => {
    const on = togglePermission(new Set(), Permission.EditMaintenance, true);
    expect(on.has(Permission.ViewMaintenance)).toBe(true);
    const off = togglePermission(on, Permission.ViewMaintenance, false);
    expect(off.has(Permission.EditMaintenance)).toBe(false);
    expect(dependentPermissions(Permission.ViewMaintenance).has(Permission.EditMaintenance)).toBe(true);
  });

  it('round-trips every preset level', () => {
    for (const area of PERMISSION_AREAS) {
      expect(areaLevel(applyAreaLevel(new Set(), area.id, 'none'), area.id)).toBe('none');
      for (const level of area.levels) {
        expect(areaLevel(applyAreaLevel(new Set(), area.id, level.id), area.id), `${area.id}/${level.id}`).toBe(level.id);
      }
    }
  });
});

describe('resolveEffectivePermissions', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('drops unknown role keys', () => {
    expect(resolveEffectivePermissions(['can_view_fleet', 'can_nope'], [], now)).toEqual([Permission.ViewFleet]);
  });

  it('adds grants with their dependencies', () => {
    const out = resolveEffectivePermissions([], [{ permission: Permission.EditMaintenance, effect: 'grant' }], now);
    expect(out).toEqual(expect.arrayContaining([Permission.EditMaintenance, Permission.ViewMaintenance]));
  });

  it('revokes remove dependents too, and beat grants', () => {
    const out = resolveEffectivePermissions(
      [Permission.ViewMaintenance, Permission.EditMaintenance],
      [{ permission: Permission.ViewMaintenance, effect: 'revoke' }, { permission: Permission.EditMaintenance, effect: 'grant' }],
      now,
    );
    expect(out).not.toContain(Permission.ViewMaintenance);
    expect(out).not.toContain(Permission.EditMaintenance);
  });

  it('ignores expired exceptions', () => {
    const out = resolveEffectivePermissions(
      [Permission.ViewFleet],
      [
        { permission: Permission.ViewFleet, effect: 'revoke', expiresAt: '2026-05-01T00:00:00Z' },
        { permission: Permission.ViewMaintenance, effect: 'grant', expiresAt: '2026-05-01T00:00:00Z' },
        { permission: Permission.ViewTransfers, effect: 'grant', expiresAt: '2026-07-01T00:00:00Z' },
      ],
      now,
    );
    expect(out).toEqual(expect.arrayContaining([Permission.ViewFleet, Permission.ViewTransfers]));
    expect(out).not.toContain(Permission.ViewMaintenance);
  });
});

describe('expandLegacyPermissions', () => {
  it('replaces the old settings key with the split settings keys', () => {
    const out = expandLegacyPermissions(['can_edit_settings']);
    expect(out).toEqual(expect.arrayContaining([...LEGACY_PERMISSION_ALIASES.can_edit_settings]));
  });

  it('only applies split backfill when asked', () => {
    expect(expandLegacyPermissions([Permission.ViewInbox])).not.toContain(Permission.ViewCustomers);
    expect(expandLegacyPermissions([Permission.ViewInbox], { splitBackfill: true })).toContain(Permission.ViewCustomers);
  });
});
