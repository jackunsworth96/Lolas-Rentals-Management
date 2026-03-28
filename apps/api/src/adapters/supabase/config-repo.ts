import { getSupabaseClient } from './client.js';
import type {
  ConfigRepository,
  Store,
  Addon,
  Location,
  PaymentMethod,
  VehicleModel,
  ModelPricing,
  FleetStatus,
  ExpenseCategory,
  TaskCategory,
  TransferRoute,
  DayType,
  Account,
  Establishment,
  WorkType,
  LeaveConfig,
  Role,
  AppUser,
} from '@lolas/domain';

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return result;
}

function camelToSnake(obj: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value;
  }
  return result;
}

const sb = () => getSupabaseClient();

async function selectAll<T>(table: string): Promise<T[]> {
  const { data, error } = await sb().from(table).select('*');
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return (data ?? []).map((r) => snakeToCamel(r) as T);
}

async function selectAllActive<T>(table: string): Promise<T[]> {
  const { data, error } = await sb().from(table).select('*').eq('is_active', true);
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return (data ?? []).map((r) => snakeToCamel(r) as T);
}

async function selectWhere<T>(table: string, column: string, value: string): Promise<T[]> {
  const { data, error } = await sb().from(table).select('*').eq(column, value);
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return (data ?? []).map((r) => snakeToCamel(r) as T);
}

async function selectWhereActive<T>(table: string, column: string, value: string): Promise<T[]> {
  const { data, error } = await sb().from(table).select('*').eq(column, value).eq('is_active', true);
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return (data ?? []).map((r) => snakeToCamel(r) as T);
}

function rowFromCamel(obj: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(camelToSnake(obj) as Record<string, unknown>).filter(([, v]) => v !== undefined),
  );
}

/** Natural / text primary keys — caller always supplies id (e.g. payment_methods, chart_of_accounts). */
async function upsertRow(table: string, obj: object): Promise<void> {
  const row = rowFromCamel(obj);
  const { error } = await sb().from(table).upsert(row);
  if (error) throw new Error(`Failed to save to ${table}: ${error.message}`);
}

/**
 * Serial integer PK: without a positive numeric id, INSERT a new row.
 * Blind `.upsert()` on these tables can otherwise target the same PK row and overwrite the only list item.
 */
async function upsertRowSerialPk(table: string, obj: object): Promise<void> {
  const row = rowFromCamel(obj);
  const id = row.id;
  const insertNew =
    id === undefined ||
    id === null ||
    id === '' ||
    id === 0 ||
    (typeof id === 'number' && (!Number.isFinite(id) || id < 1));
  if (insertNew) {
    delete row.id;
    const { error } = await sb().from(table).insert(row);
    if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`);
    return;
  }
  const { error } = await sb().from(table).upsert(row);
  if (error) throw new Error(`Failed to save to ${table}: ${error.message}`);
}

async function softDelete(table: string, id: string | number): Promise<void> {
  const { error } = await sb().from(table).update({ is_active: false }).eq('id', id);
  if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`);
}

async function hardDelete(table: string, id: string | number): Promise<void> {
  const { error } = await sb().from(table).delete().eq('id', id);
  if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`);
}

export function createConfigRepo(): ConfigRepository {
  return {
    // ── Reads (only active rows so soft-deleted items disappear from UI) ──
    getStores: () => selectAllActive<Store>('stores'),
    async getStoreByBookingToken(token: string): Promise<Store | null> {
      const { data, error } = await sb()
        .from('stores')
        .select('*')
        .eq('booking_token', token)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new Error(`Failed to look up store by token: ${error.message}`);
      return data ? (snakeToCamel(data) as unknown as Store) : null;
    },
    async getAddons(storeId: string) {
      const { data, error } = await sb()
        .from('addons')
        .select('*')
        .eq('is_active', true)
        .or(`store_id.eq.${storeId},store_id.is.null`);
      if (error) throw new Error(`Failed to fetch addons: ${error.message}`);
      return (data ?? []).map((r) => snakeToCamel(r) as unknown as Addon);
    },
    async getLocations(storeId: string) {
      const { data, error } = await sb()
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .or(`store_id.eq.${storeId},store_id.is.null`);
      if (error) throw new Error(`Failed to fetch locations: ${error.message}`);
      return (data ?? []).map((r) => snakeToCamel(r) as unknown as Location);
    },
    getPaymentMethods: () => selectAllActive<PaymentMethod>('payment_methods'),
    getVehicleModels: () => selectAllActive<VehicleModel>('vehicle_models'),

    async getVehicleModelById(id: string): Promise<VehicleModel | null> {
      const { data, error } = await sb()
        .from('vehicle_models')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch vehicle model: ${error.message}`);
      if (!data) return null;
      return snakeToCamel(data) as unknown as VehicleModel;
    },

    async getModelPricing(modelId, storeId) {
      const { data, error } = await sb()
        .from('vehicle_model_pricing')
        .select('*')
        .eq('model_id', modelId)
        .eq('store_id', storeId);
      if (error) throw new Error(`Failed to fetch model pricing: ${error.message}`);
      return (data ?? []).map((r) => snakeToCamel(r) as unknown as ModelPricing);
    },

    async getStorePricing(storeId) {
      const { data, error } = await sb()
        .from('vehicle_model_pricing')
        .select('*')
        .eq('store_id', storeId);
      if (error) throw new Error(`Failed to fetch store pricing: ${error.message}`);
      return (data ?? []).map((r) => snakeToCamel(r) as unknown as ModelPricing);
    },

    getFleetStatuses: () => selectAll<FleetStatus>('fleet_statuses'),
    getExpenseCategories: () => selectAllActive<ExpenseCategory>('expense_categories'),
    getTaskCategories: () => selectAllActive<TaskCategory>('task_categories'),
    getTransferRoutes: (storeId) => selectWhereActive<TransferRoute>('transfer_routes', 'store_id', storeId),
    getDayTypes: () => selectAll<DayType>('day_types'),
    getChartOfAccounts: () => selectAllActive<Account>('chart_of_accounts'),
    async getPawCardEstablishments() {
      const { data, error } = await sb()
        .from('paw_card_establishments')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw new Error(`Failed to fetch paw_card_establishments: ${error.message}`);
      return (data ?? []).map((r) => snakeToCamel(r) as unknown as Establishment);
    },
    getMaintenanceWorkTypes: () => selectAllActive<WorkType>('maintenance_work_types'),

    async getLeaveConfigByStore(storeId: string) {
      const { data, error } = await sb()
        .from('leave_config')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch leave config: ${error.message}`);
      return data ? (snakeToCamel(data) as unknown as LeaveConfig) : null;
    },

    getRoles: () => selectAll<Role>('roles'),

    async getRolePermissions(roleId) {
      const { data, error } = await sb()
        .from('role_permissions')
        .select('permission')
        .eq('role_id', roleId);
      if (error) throw new Error(`Failed to fetch role permissions: ${error.message}`);
      return (data ?? []).map((r) => r.permission as string);
    },

    async getUsers() {
      const { data, error } = await sb()
        .from('users')
        .select('id, username, employee_id, role_id, is_active')
        .eq('is_active', true);
      if (error) throw new Error(`Failed to fetch users: ${error.message}`);
      return (data ?? []).map((r) => snakeToCamel(r) as unknown as AppUser);
    },

    // ── Writes ──
    saveStore: (store) => upsertRow('stores', store),
    deleteStore: (id) => softDelete('stores', id),
    saveAddon: (addon) => upsertRowSerialPk('addons', addon),
    deleteAddon: (id) => softDelete('addons', id),
    saveLocation: (location) => upsertRowSerialPk('locations', location),
    deleteLocation: (id) => softDelete('locations', id),
    savePaymentMethod: (pm) => upsertRow('payment_methods', pm),
    deletePaymentMethod: (id) => softDelete('payment_methods', id),
    saveVehicleModel: (model) => upsertRow('vehicle_models', model),
    deleteVehicleModel: (id) => softDelete('vehicle_models', id),
    saveModelPricing: (pricing) => upsertRowSerialPk('vehicle_model_pricing', pricing),
    deleteModelPricing: (id) => hardDelete('vehicle_model_pricing', id),
    saveFleetStatus: (status) => upsertRow('fleet_statuses', status),
    deleteFleetStatus: (id) => hardDelete('fleet_statuses', id),
    saveExpenseCategory: (cat) => upsertRowSerialPk('expense_categories', cat),
    deleteExpenseCategory: (id) => softDelete('expense_categories', id),
    saveTaskCategory: (cat) => upsertRowSerialPk('task_categories', cat),
    deleteTaskCategory: (id) => softDelete('task_categories', id),
    saveTransferRoute: (route) => upsertRowSerialPk('transfer_routes', route),
    deleteTransferRoute: (id) => softDelete('transfer_routes', id),
    saveDayType: (dt) => upsertRow('day_types', dt),
    deleteDayType: (id) => hardDelete('day_types', id),
    saveAccount: (account) => {
      const normalized = { ...account, storeId: account.storeId === '' ? null : account.storeId };
      return upsertRow('chart_of_accounts', normalized);
    },
    deleteAccount: (id) => softDelete('chart_of_accounts', id),
    saveEstablishment: (est) => upsertRowSerialPk('paw_card_establishments', est),
    deleteEstablishment: (id) => softDelete('paw_card_establishments', id),
    saveWorkType: (wt) => upsertRowSerialPk('maintenance_work_types', wt),
    deleteWorkType: (id) => softDelete('maintenance_work_types', id),
    async saveLeaveConfig(config) {
      const row = rowFromCamel(config);
      delete row.id;
      const { error } = await sb().from('leave_config').upsert(row, { onConflict: 'store_id' });
      if (error) throw new Error(`Failed to save leave config: ${error.message}`);
    },
    saveRole: (role) => upsertRow('roles', role),
    deleteRole: (id) => hardDelete('roles', id),

    async saveRolePermissions(roleId, permissions) {
      const client = sb();
      const { error: delError } = await client
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId);
      if (delError) throw new Error(`Failed to clear role permissions: ${delError.message}`);

      if (permissions.length > 0) {
        const rows = permissions.map((p) => ({ role_id: roleId, permission: p }));
        const { error: insError } = await client.from('role_permissions').insert(rows);
        if (insError) throw new Error(`Failed to insert role permissions: ${insError.message}`);
      }
    },

    async saveUser(user) {
      const row = camelToSnake(user) as Record<string, unknown>;
      if (!row.pin_hash) delete row.pin_hash;
      const clean = Object.fromEntries(
        Object.entries(row).filter(([, v]) => v !== undefined),
      ) as Record<string, unknown>;
      const { error } = await sb()
        .from('users')
        .upsert(clean, { onConflict: 'username' });
      if (error) {
        const msg = error.message;
        if (msg.includes('foreign key') || msg.includes('violates foreign key'))
          throw new Error('Employee ID or Role not found. Use an existing Employee ID (e.g. emp-admin-1) and choose a Role from the list.');
        if (msg.includes('unique') || msg.includes('duplicate key'))
          throw new Error('Username already exists. Choose a different username.');
        throw new Error(`Failed to save user: ${msg}`);
      }
    },

    deleteUser: (id) => softDelete('users', id),
  };
}
