import {
  type ConfigRepository,
  type Store,
  type Addon,
  type Location,
  type PaymentMethod,
  type VehicleModel,
  type ModelPricing,
  type FleetStatus,
  type ExpenseCategory,
  type TransferRoute,
  type DayType,
  type Account,
  type Establishment,
  type WorkType,
  type LeaveConfig,
  type Role,
} from '@lolas/domain';

export interface ConfigDeps {
  config: ConfigRepository;
}

export async function getStores(deps: ConfigDeps): Promise<Store[]> {
  return deps.config.getStores();
}

export async function getAddons(
  storeId: string,
  deps: ConfigDeps,
): Promise<Addon[]> {
  return deps.config.getAddons(storeId);
}

export async function getLocations(
  storeId: string,
  deps: ConfigDeps,
): Promise<Location[]> {
  return deps.config.getLocations(storeId);
}

export async function getPaymentMethods(
  deps: ConfigDeps,
): Promise<PaymentMethod[]> {
  return deps.config.getPaymentMethods();
}

export async function getVehicleModels(
  deps: ConfigDeps,
): Promise<VehicleModel[]> {
  return deps.config.getVehicleModels();
}

export async function getModelPricing(
  modelId: string,
  storeId: string,
  deps: ConfigDeps,
): Promise<ModelPricing[]> {
  return deps.config.getModelPricing(modelId, storeId);
}

export async function getFleetStatuses(
  deps: ConfigDeps,
): Promise<FleetStatus[]> {
  return deps.config.getFleetStatuses();
}

export async function getExpenseCategories(
  storeId: string,
  deps: ConfigDeps,
): Promise<ExpenseCategory[]> {
  return deps.config.getExpenseCategories(storeId);
}

export async function getTransferRoutes(
  storeId: string,
  deps: ConfigDeps,
): Promise<TransferRoute[]> {
  return deps.config.getTransferRoutes(storeId);
}

export async function getDayTypes(deps: ConfigDeps): Promise<DayType[]> {
  return deps.config.getDayTypes();
}

export async function getChartOfAccounts(
  deps: ConfigDeps,
): Promise<Account[]> {
  return deps.config.getChartOfAccounts();
}

export async function getPawCardEstablishments(
  deps: ConfigDeps,
): Promise<Establishment[]> {
  return deps.config.getPawCardEstablishments();
}

export async function getMaintenanceWorkTypes(
  deps: ConfigDeps,
): Promise<WorkType[]> {
  return deps.config.getMaintenanceWorkTypes();
}

export async function getLeaveConfigByStore(
  storeId: string,
  deps: ConfigDeps,
): Promise<LeaveConfig | null> {
  return deps.config.getLeaveConfigByStore(storeId);
}

export async function getRoles(deps: ConfigDeps): Promise<Role[]> {
  return deps.config.getRoles();
}

export async function getRolePermissions(
  roleId: string,
  deps: ConfigDeps,
): Promise<string[]> {
  return deps.config.getRolePermissions(roleId);
}
