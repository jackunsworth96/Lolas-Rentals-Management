import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ALL_NAV_ITEMS, MAX_PINS, defaultPins, hasNavPermission, navPermissions } from '../components/layout/nav-config.js';
import { useAuthStore } from './auth-store.js';

interface NavPrefsState {
  /** Pinned paths per employee. A missing entry means "use role defaults". */
  pinsByUser: Record<string, string[]>;
  collapsedGroups: Record<string, boolean>;
  /** Returns false when the pin limit is reached. */
  togglePin: (userKey: string, path: string, current: string[]) => boolean;
  toggleGroup: (label: string) => void;
}

export const useNavPrefsStore = create<NavPrefsState>()(
  persist(
    (set) => ({
      pinsByUser: {},
      collapsedGroups: {},
      togglePin: (userKey, path, current) => {
        const pinned = current.includes(path);
        if (!pinned && current.length >= MAX_PINS) return false;
        const next = pinned ? current.filter((p) => p !== path) : [...current, path];
        set((s) => ({ pinsByUser: { ...s.pinsByUser, [userKey]: next } }));
        return true;
      },
      toggleGroup: (label) =>
        set((s) => ({ collapsedGroups: { ...s.collapsedGroups, [label]: !s.collapsedGroups[label] } })),
    }),
    { name: 'lolas-nav-prefs', storage: createJSONStorage(() => localStorage) },
  ),
);

/** Pinned nav paths for the signed-in user, limited to pages they can still see. */
export function usePins(): { pins: string[]; togglePin: (path: string) => boolean } {
  const user = useAuthStore((s) => s.user);
  const perms = navPermissions(user);
  const userKey = user?.employeeId || user?.userId || 'anon';
  const stored = useNavPrefsStore((s) => s.pinsByUser[userKey]);
  const toggle = useNavPrefsStore((s) => s.togglePin);
  const pins = (stored ?? defaultPins(perms)).filter((p) => {
    const item = ALL_NAV_ITEMS.find((i) => i.path === p);
    return item && hasNavPermission(item.perm, perms);
  });
  return { pins, togglePin: (path) => toggle(userKey, path, pins) };
}
