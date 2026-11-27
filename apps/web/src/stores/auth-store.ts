import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  userId: string;
  username: string;
  employeeId: string;
  roleId: string;
  storeIds: string[];
  permissions: string[];
  /** Owners and developers sign in but are not staff. Missing on sessions from before this existed. */
  personType?: 'staff' | 'owner' | 'developer' | 'counter';
  /** Fingerprint of the permissions above; the API sends the current one on every response. */
  permissionsVersion?: string;
}

export function isStaffUser(user: Pick<AuthUser, 'personType'> | null | undefined): boolean {
  return (user?.personType ?? 'staff') === 'staff';
}

/** The reception tablet login: it can only run the counter page. */
export function isCounterOnlyUser(user: Pick<AuthUser, 'permissions'> | null | undefined): boolean {
  const permissions = user?.permissions ?? [];
  return permissions.length > 0 && permissions.every((p) => p === 'can_use_counter');
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  /** Replace the signed-in user's details (e.g. after their access changed) without signing out. */
  updateUser: (user: AuthUser) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (user) => set((state) => (state.token ? { user } : state)),
      logout: () => set({ token: null, user: null }),
      hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
    }),
    {
      name: 'lolas-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
