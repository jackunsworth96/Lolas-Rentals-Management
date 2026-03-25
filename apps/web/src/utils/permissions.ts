import { useAuthStore } from '../stores/auth-store.js';

export function hasPermission(permission: string): boolean {
  return useAuthStore.getState().hasPermission(permission);
}

export function hasAnyPermission(...permissions: string[]): boolean {
  const userPerms = useAuthStore.getState().user?.permissions ?? [];
  return permissions.some((p) => userPerms.includes(p));
}

export function hasAllPermissions(...permissions: string[]): boolean {
  const userPerms = useAuthStore.getState().user?.permissions ?? [];
  return permissions.every((p) => userPerms.includes(p));
}
