import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, Permission } from '@lolas/shared';
import { ROUTE_PERMISSIONS, SETTINGS_PERMISSIONS, allows } from '../src/lib/route-permissions.js';
import { ALL_NAV_ITEMS, STAFF_ONLY, hasNavPermission } from '../src/components/layout/nav-config.js';
import { SETTINGS_SECTIONS, visibleSettingsSections } from '../src/pages/settings/settings-tabs.js';

const rules = Object.entries(ROUTE_PERMISSIONS) as Array<[string, string | readonly string[] | null]>;

describe('route permissions', () => {
  it('only uses real permission keys', () => {
    for (const [path, rule] of rules) {
      const keys = rule == null ? [] : typeof rule === 'string' ? [rule] : rule;
      for (const k of keys) expect(ALL_PERMISSIONS, path).toContain(k);
    }
  });

  it('gives every sidebar item the same rule as its page', () => {
    for (const item of ALL_NAV_ITEMS) {
      if (item.perm === STAFF_ONLY) continue;
      expect(Object.keys(ROUTE_PERMISSIONS), item.path).toContain(item.path);
      expect(item.perm, item.path).toEqual(ROUTE_PERMISSIONS[item.path as keyof typeof ROUTE_PERMISSIONS]);
    }
  });

  it('shows a sidebar item exactly when the page would open', () => {
    const samples = [[], [Permission.ViewFleet], [Permission.ManageStaffContracts], [...ALL_PERMISSIONS]];
    for (const perms of samples) {
      for (const item of ALL_NAV_ITEMS) {
        if (item.perm === STAFF_ONLY) continue;
        const rule = ROUTE_PERMISSIONS[item.path as keyof typeof ROUTE_PERMISSIONS];
        expect(hasNavPermission(item.perm, perms), `${item.path} with ${perms.length} perms`).toBe(allows(rule, perms));
      }
    }
  });

  it('opens settings for anyone who can see at least one section', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(SETTINGS_PERMISSIONS).toContain(section.perm);
      expect(allows(ROUTE_PERMISSIONS['/settings'], [section.perm])).toBe(true);
      expect(visibleSettingsSections([section.perm]).map((s) => s.label)).toEqual([section.label]);
    }
    expect(visibleSettingsSections([])).toEqual([]);
  });
});
