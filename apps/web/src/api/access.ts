import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PermissionKey } from '@lolas/shared';
import { api } from './client.js';

export interface AccessRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  version: number;
  updatedAt: string | null;
  userCount: number;
  permissions: PermissionKey[];
}

export interface AccessPerson {
  id: string;
  username: string;
  employeeId: string;
  fullName: string;
  personType: string;
  roleId: string;
  isActive: boolean;
  version: number;
  activeOverrideCount: number;
}

export interface AccessOverride {
  permission: PermissionKey;
  effect: 'grant' | 'revoke';
  reason: string;
  expiresAt: string | null;
  createdAt?: string;
  createdByEmployeeId?: string | null;
}

export interface PersonAccess {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
  version: number;
  rolePermissions: PermissionKey[];
  overrides: AccessOverride[];
  effectivePermissions: PermissionKey[];
}

export interface AccessHistoryEntry {
  id: number;
  occurredAt: string;
  actorName: string | null;
  action: string;
  roleId: string | null;
  targetUserId: string | null;
  added: string[];
  removed: string[];
  details: Record<string, unknown>;
  reason: string | null;
}

const KEY = ['access'] as const;

export function useAccessRoles() {
  return useQuery<AccessRole[]>({ queryKey: [...KEY, 'roles'], queryFn: () => api.get('/access/roles') });
}

export function useAccessPeople() {
  return useQuery<AccessPerson[]>({ queryKey: [...KEY, 'users'], queryFn: () => api.get('/access/users') });
}

export function usePersonAccess(userId: string | null) {
  return useQuery<PersonAccess>({
    queryKey: [...KEY, 'user', userId],
    queryFn: () => api.get(`/access/users/${userId}`),
    enabled: !!userId,
  });
}

export function useAccessHistory(filter: { roleId?: string; userId?: string } = {}) {
  const params = new URLSearchParams({ limit: '100' });
  if (filter.roleId) params.set('roleId', filter.roleId);
  if (filter.userId) params.set('userId', filter.userId);
  return useQuery<AccessHistoryEntry[]>({
    queryKey: [...KEY, 'history', filter.roleId ?? null, filter.userId ?? null],
    queryFn: () => api.get(`/access/history?${params.toString()}`),
  });
}

function useInvalidateAccess() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['config', 'roles'] });
    void qc.invalidateQueries({ queryKey: ['config', 'users'] });
  };
}

export interface SaveRoleInput {
  name: string;
  description: string;
  permissions: PermissionKey[];
  reason: string;
}

export function useCreateRole() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: (body: SaveRoleInput) => api.post<{ id: string; version: number }>('/access/roles', body),
    onSuccess: invalidate,
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: ({ id, ...body }: SaveRoleInput & { id: string; expectedVersion: number }) =>
      api.put<{ id: string; version: number }>(`/access/roles/${encodeURIComponent(id)}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.delete(`/access/roles/${encodeURIComponent(id)}`, { reason }),
    onSuccess: invalidate,
  });
}

export function useSaveOverrides() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: ({ userId, overrides, expectedVersion }: {
      userId: string;
      overrides: Array<Pick<AccessOverride, 'permission' | 'effect' | 'reason' | 'expiresAt'>>;
      expectedVersion: number;
    }) => api.put<{ version: number }>(`/access/users/${userId}/overrides`, { overrides, expectedVersion }),
    onSuccess: invalidate,
  });
}
