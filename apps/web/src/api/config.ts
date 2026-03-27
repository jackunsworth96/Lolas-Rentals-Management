import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { COMPANY_STORE_ID } from '@lolas/shared';

// ── Query hooks ──

export function useStores(opts?: { includeCompany?: boolean }) {
  const includeCompany = !!opts?.includeCompany;
  return useQuery({
    queryKey: ['config', 'stores', includeCompany ? 'with-company' : 'operational'],
    queryFn: async () => {
      const rows = await api.get<Array<{ id: string; name: string }>>('/config/stores');
      if (!Array.isArray(rows)) return [];
      if (includeCompany) return rows;
      return rows.filter((s) => s.id !== COMPANY_STORE_ID);
    },
  });
}
export function useAddons(storeId: string) {
  return useQuery({ queryKey: ['config', 'addons', storeId], queryFn: () => api.get(`/config/addons?storeId=${storeId}`), enabled: !!storeId });
}
export function useLocations(storeId: string) {
  return useQuery({ queryKey: ['config', 'locations', storeId], queryFn: () => api.get(`/config/locations?storeId=${storeId}`), enabled: !!storeId });
}
export function usePaymentMethods() {
  return useQuery({ queryKey: ['config', 'payment-methods'], queryFn: () => api.get('/config/payment-methods') });
}
export function useVehicleModels() {
  return useQuery({ queryKey: ['config', 'vehicle-models'], queryFn: () => api.get('/config/vehicle-models') });
}
export function useModelPricing(modelId: string, storeId: string) {
  return useQuery({ queryKey: ['config', 'model-pricing', modelId, storeId], queryFn: () => api.get(`/config/model-pricing?modelId=${modelId}&storeId=${storeId}`), enabled: !!modelId && !!storeId });
}
export function useStorePricing(storeId: string) {
  return useQuery({ queryKey: ['config', 'store-pricing', storeId], queryFn: () => api.get(`/config/store-pricing?storeId=${storeId}`), enabled: !!storeId });
}
export function useFleetStatuses() {
  return useQuery({ queryKey: ['config', 'fleet-statuses'], queryFn: () => api.get('/config/fleet-statuses') });
}
export function useExpenseCategories() {
  return useQuery({ queryKey: ['config', 'expense-categories'], queryFn: () => api.get('/config/expense-categories') });
}
export function useTransferRoutes(storeId: string) {
  return useQuery({ queryKey: ['config', 'transfer-routes', storeId], queryFn: () => api.get(`/config/transfer-routes?storeId=${storeId}`), enabled: !!storeId });
}
export function useChartOfAccounts() {
  return useQuery({ queryKey: ['config', 'chart-of-accounts'], queryFn: () => api.get('/config/chart-of-accounts') });
}
export function usePawCardEstablishments() {
  return useQuery({ queryKey: ['config', 'paw-card-establishments'], queryFn: () => api.get('/config/paw-card-establishments') });
}
export function useDayTypes() {
  return useQuery({ queryKey: ['config', 'day-types'], queryFn: () => api.get('/config/day-types') });
}
export function useLeaveConfig(storeId: string | undefined) {
  return useQuery({
    queryKey: ['config', 'leave-config', storeId],
    queryFn: () => api.get(`/config/leave-config?storeId=${encodeURIComponent(storeId!)}`),
    enabled: !!storeId,
  });
}
export function useRoles() {
  return useQuery({ queryKey: ['config', 'roles'], queryFn: () => api.get('/config/roles') });
}
export function useRolePermissions(roleId: string) {
  return useQuery({ queryKey: ['config', 'role-permissions', roleId], queryFn: () => api.get(`/config/roles/${roleId}/permissions`), enabled: !!roleId });
}
export function useUsers() {
  return useQuery({ queryKey: ['config', 'users'], queryFn: () => api.get('/config/users') });
}
export function useTaskCategories() {
  return useQuery<Array<{ id: number; name: string; colour: string; isActive: boolean }>>({
    queryKey: ['config', 'task-categories'],
    queryFn: () => api.get('/config/task-categories'),
  });
}
export function useMaintenanceWorkTypes() {
  return useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['config', 'maintenance-work-types'],
    queryFn: () => api.get('/config/maintenance-work-types'),
  });
}
export function useConfigEmployees() {
  return useQuery<Array<{ id: string; fullName: string; storeId: string | null }>>({
    queryKey: ['config', 'employees'],
    queryFn: () => api.get('/config/employees'),
  });
}

// ── Mutation factory ──

function useSave(endpoint: string, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      const id = body._id ?? body.id;
      const isUpdate = body._method === 'PUT';
      const { _method, _id, ...payload } = body;
      void _method;
      void _id;
      if (isUpdate && id != null) return api.put(`/config/${endpoint}/${id}`, payload);
      return api.post(`/config/${endpoint}`, payload);
    },
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: ['config', k] })),
  });
}

function useDelete(endpoint: string, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => api.delete(`/config/${endpoint}/${id}`),
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: ['config', k] })),
  });
}

// ── Per-domain mutations ──

export function useSaveStore() { return useSave('stores', ['stores']); }
export function useDeleteStore() { return useDelete('stores', ['stores']); }

/** Store PUT for toggles / partial edits — omits defaultFloatAmount so older DBs without that column still work. */
export function usePatchStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      name: string;
      location: string | null;
      isActive: boolean;
      publicBookingEnabled: boolean;
    }) => {
      const { id, ...body } = vars;
      return api.put(`/config/stores/${id}`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'stores'] }),
  });
}

export function useRegenerateBookingToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => api.post<{ bookingToken: string }>(`/config/stores/${storeId}/regenerate-token`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'stores'] }),
  });
}

export function useSaveAddon() { return useSave('addons', ['addons']); }
export function useDeleteAddon() { return useDelete('addons', ['addons']); }

export function useSaveLocation() { return useSave('locations', ['locations']); }
export function useDeleteLocation() { return useDelete('locations', ['locations']); }

export function useSavePaymentMethod() { return useSave('payment-methods', ['payment-methods']); }
export function useDeletePaymentMethod() { return useDelete('payment-methods', ['payment-methods']); }

export function useSaveVehicleModel() { return useSave('vehicle-models', ['vehicle-models']); }
export function useDeleteVehicleModel() { return useDelete('vehicle-models', ['vehicle-models']); }

export function useSaveModelPricing() { return useSave('model-pricing', ['model-pricing']); }
export function useDeleteModelPricing() { return useDelete('model-pricing', ['model-pricing']); }

export function useSaveFleetStatus() { return useSave('fleet-statuses', ['fleet-statuses']); }
export function useDeleteFleetStatus() { return useDelete('fleet-statuses', ['fleet-statuses']); }

export function useSaveExpenseCategory() { return useSave('expense-categories', ['expense-categories']); }
export function useDeleteExpenseCategory() { return useDelete('expense-categories', ['expense-categories']); }

export function useSaveTransferRoute() { return useSave('transfer-routes', ['transfer-routes']); }
export function useDeleteTransferRoute() { return useDelete('transfer-routes', ['transfer-routes']); }

export function useSaveDayType() { return useSave('day-types', ['day-types']); }
export function useDeleteDayType() { return useDelete('day-types', ['day-types']); }

export function useSaveAccount() { return useSave('chart-of-accounts', ['chart-of-accounts']); }
export function useDeleteAccount() { return useDelete('chart-of-accounts', ['chart-of-accounts']); }

export function useSaveEstablishment() { return useSave('paw-card-establishments', ['paw-card-establishments']); }
export function useDeleteEstablishment() { return useDelete('paw-card-establishments', ['paw-card-establishments']); }

export function useSaveMaintenancePart() { return useSave('maintenance-work-types', ['maintenance-work-types']); }
export function useDeleteMaintenancePart() { return useDelete('maintenance-work-types', ['maintenance-work-types']); }

export function useSaveTaskCategory() { return useSave('task-categories', ['task-categories']); }
export function useDeleteTaskCategory() { return useDelete('task-categories', ['task-categories']); }

export function useSaveLeaveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put('/config/leave-config', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'leave-config'] }),
  });
}

export function useSaveRole() { return useSave('roles', ['roles']); }
export function useDeleteRole() { return useDelete('roles', ['roles']); }

export function useSaveRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: string; permissions: string[] }) =>
      api.put(`/config/roles/${roleId}/permissions`, { permissions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'role-permissions'] }),
  });
}

export function useSaveUser() { return useSave('users', ['users']); }
export function useDeleteUser() { return useDelete('users', ['users']); }

// ── Payment Routing ──

export interface PaymentRoutingRule {
  id: number;
  storeId: string;
  paymentMethodId: string;
  receivedIntoAccountId: string | null;
  cardSettlementAccountId: string | null;
}

export interface PaymentRoutingData {
  rules: PaymentRoutingRule[];
  storeDefaults: Record<string, {
    cardFeeAccountId: string | null;
    defaultCashAccountId: string | null;
  }>;
}

export function usePaymentRoutingConfig() {
  return useQuery<PaymentRoutingData>({
    queryKey: ['config', 'payment-routing'],
    queryFn: () => api.get('/config/payment-routing'),
  });
}

export function useSavePaymentRouting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      rules: Array<{
        storeId: string;
        paymentMethodId: string;
        receivedIntoAccountId?: string | null;
        cardSettlementAccountId?: string | null;
      }>;
      storeDefaults?: {
        storeId: string;
        cardFeeAccountId?: string | null;
        defaultCashAccountId?: string | null;
      };
    }) => api.put('/config/payment-routing', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'payment-routing'] }),
  });
}
