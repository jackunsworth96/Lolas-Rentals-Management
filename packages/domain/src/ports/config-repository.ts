export interface Store {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
  defaultFloatAmount: number;
  bookingToken: string;
  publicBookingEnabled: boolean;
}

export interface Addon {
  id: number | string;
  name: string;
  pricePerDay: number;
  priceOneTime: number;
  addonType: 'per_day' | 'one_time';
  storeId: string | null;
  mutualExclusivityGroup: string | null;
  isActive: boolean;
  applicableModelIds: string[] | null;
}

export interface Location {
  id: number | string;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
  storeId: string | null;
  isActive: boolean;
}

export interface PaymentMethod {
  id: string;
  name: string;
  isDepositEligible: boolean;
  isActive: boolean;
  surchargePercent: number;
}

export interface VehicleModel {
  id: string;
  name: string;
  isActive: boolean;
  /** Refundable security deposit (PHP); not included in rental grand total */
  securityDeposit?: number;
}

export interface ModelPricing {
  id: number | string;
  modelId: string;
  storeId: string;
  minDays: number;
  maxDays: number;
  dailyRate: number;
}

export interface FleetStatus {
  id: string;
  name: string;
  isRentable: boolean;
}

export interface ExpenseCategory {
  id: number | string;
  name: string;
  mainCategory: string | null;
  accountId: string | null;
  isActive: boolean;
}

export interface TaskCategory {
  id: number | string;
  name: string;
  colour: string;
  isActive: boolean;
}

export interface TransferRoute {
  id: number | string;
  route: string;
  vanType: string | null;
  price: number;
  storeId: string | null;
  isActive: boolean;
  pricingType: string;
}

export interface DayType {
  id: string;
  name: string;
}

export interface Account {
  id: string;
  name: string;
  accountType: string;
  storeId: string | null;
  isActive: boolean;
}

export interface Establishment {
  id: number | string;
  name: string;
  isActive: boolean;
}

export interface WorkType {
  id: number | string;
  name: string;
  isActive: boolean;
}

export interface LeaveConfig {
  id?: number | string;
  storeId: string;
  resetMonth: number;
  resetDay: number;
  defaultHolidayAllowance: number;
  defaultSickAllowance: number;
}

export interface Role {
  id: string;
  name: string;
}

export interface AppUser {
  id: string;
  username: string;
  pinHash?: string;
  employeeId: string;
  roleId: string;
  isActive: boolean;
}

export interface ConfigRepository {
  // Reads
  getStores(): Promise<Store[]>;
  getStoreByBookingToken(token: string): Promise<Store | null>;
  getAddons(storeId: string): Promise<Addon[]>;
  getLocations(storeId: string): Promise<Location[]>;
  getPaymentMethods(): Promise<PaymentMethod[]>;
  getVehicleModels(): Promise<VehicleModel[]>;
  getVehicleModelById(id: string): Promise<VehicleModel | null>;
  getModelPricing(modelId: string, storeId: string): Promise<ModelPricing[]>;
  getStorePricing(storeId: string): Promise<ModelPricing[]>;
  getFleetStatuses(): Promise<FleetStatus[]>;
  getExpenseCategories(): Promise<ExpenseCategory[]>;
  getTaskCategories(): Promise<TaskCategory[]>;
  getTransferRoutes(storeId: string): Promise<TransferRoute[]>;
  getDayTypes(): Promise<DayType[]>;
  getChartOfAccounts(): Promise<Account[]>;
  getPawCardEstablishments(): Promise<Establishment[]>;
  getMaintenanceWorkTypes(): Promise<WorkType[]>;
  getLeaveConfigByStore(storeId: string): Promise<LeaveConfig | null>;
  getRoles(): Promise<Role[]>;
  getRolePermissions(roleId: string): Promise<string[]>;
  getUsers(): Promise<AppUser[]>;

  // Writes
  saveStore(store: Store): Promise<void>;
  deleteStore(id: string): Promise<void>;
  saveAddon(addon: Addon): Promise<void>;
  deleteAddon(id: number | string): Promise<void>;
  saveLocation(location: Location): Promise<void>;
  deleteLocation(id: number | string): Promise<void>;
  savePaymentMethod(pm: PaymentMethod): Promise<void>;
  deletePaymentMethod(id: string): Promise<void>;
  saveVehicleModel(model: VehicleModel): Promise<void>;
  deleteVehicleModel(id: string): Promise<void>;
  saveModelPricing(pricing: ModelPricing): Promise<void>;
  deleteModelPricing(id: number | string): Promise<void>;
  saveFleetStatus(status: FleetStatus): Promise<void>;
  deleteFleetStatus(id: string): Promise<void>;
  saveExpenseCategory(cat: ExpenseCategory): Promise<void>;
  deleteExpenseCategory(id: number | string): Promise<void>;
  saveTaskCategory(cat: TaskCategory): Promise<void>;
  deleteTaskCategory(id: number | string): Promise<void>;
  saveTransferRoute(route: TransferRoute): Promise<void>;
  deleteTransferRoute(id: number | string): Promise<void>;
  saveDayType(dt: DayType): Promise<void>;
  deleteDayType(id: string): Promise<void>;
  saveAccount(account: Account): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  saveEstablishment(est: Establishment): Promise<void>;
  deleteEstablishment(id: number | string): Promise<void>;
  saveWorkType(wt: WorkType): Promise<void>;
  deleteWorkType(id: number | string): Promise<void>;
  saveLeaveConfig(config: LeaveConfig): Promise<void>;
  saveRole(role: Role): Promise<void>;
  deleteRole(id: string): Promise<void>;
  saveRolePermissions(roleId: string, permissions: string[]): Promise<void>;
  saveUser(user: AppUser): Promise<void>;
  deleteUser(id: string): Promise<void>;
}
