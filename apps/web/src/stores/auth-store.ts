import { create } from 'zustand';

interface AuthUser {
  userId: string;
  employeeId: string;
  roleId: string;
  storeIds: string[];
  permissions: string[];
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  setAuth: (token, user) => set({ token, user }),
  logout: () => set({ token: null, user: null }),
  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
}));
