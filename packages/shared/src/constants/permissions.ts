/**
 * Every permission key the backoffice understands. Labels, grouping and
 * descriptions live in `permission-catalogue.ts`; the catalogue is typed over
 * these keys, so a key without a catalogue entry fails to compile.
 *
 * Adding a key also needs a migration that inserts it into `public.permissions`
 * (enforced by the catalogue integrity test).
 */
export const Permission = {
  // Orders & bookings
  ViewInbox: 'can_view_inbox',
  ViewActive: 'can_view_active',
  ViewCompleted: 'can_view_completed',
  EditOrders: 'can_edit_orders',
  PerformInspections: 'can_perform_inspections',
  CancelOrders: 'can_cancel_orders',
  ManageInvoices: 'can_manage_invoices',

  // Customers
  ViewCustomers: 'can_view_customers',
  EditCustomers: 'can_edit_customers',

  // Transfers
  ViewTransfers: 'can_view_transfers',
  EditTransfers: 'can_edit_transfers',

  // Fleet & maintenance
  ViewFleet: 'can_view_fleet',
  EditFleet: 'can_edit_fleet',
  ViewFleetFinancials: 'can_view_fleet_financials',
  ViewMaintenance: 'can_view_maintenance',
  EditMaintenance: 'can_edit_maintenance',

  // Cash & sales
  ViewCashup: 'can_view_cashup',
  OverrideCashup: 'can_override_cashup',
  ViewMiscSales: 'can_view_miscsales',
  EditMiscSales: 'can_edit_miscsales',
  ManageMerchandise: 'can_manage_merchandise',
  ViewCardSettlements: 'can_view_cardsettlements',
  EditCardSettlements: 'can_edit_cardsettlements',
  ViewExpenses: 'can_view_expenses',
  EditExpenses: 'can_edit_expenses',

  // Accounts
  ViewAccounts: 'can_view_accounts',
  EditBudget: 'can_edit_budget',
  EditAccounts: 'can_edit_accounts',

  // Insights
  ViewDashboard: 'can_view_dashboard',
  ViewLostOpportunity: 'can_view_lostopportunity',
  EditLostOpportunity: 'can_edit_lostopportunity',

  // Tasks
  ViewTodo: 'can_view_todo',
  ManageTodo: 'can_manage_todo',

  // People
  ViewTimesheets: 'can_view_timesheets',
  SubmitTimesheets: 'can_submit_timesheets',
  ApproveTimesheets: 'can_approve_timesheets',
  EditTimesheets: 'can_edit_timesheets',
  /** Open the staff rota page. Editing also needs the employee to be a rota approver in rota_settings. */
  ManageRota: 'can_manage_rota',
  ManageEmployees: 'can_manage_employees',
  ViewPayroll: 'can_view_payroll',
  /** Post and void payroll runs, record remittances, adjust allowance balances. */
  RunPayroll: 'can_run_payroll',
  /** Approve staff leave and cash advance requests, and resolve disputed payslips. */
  ApproveStaffRequests: 'can_approve_staff_requests',
  ManageContracts: 'can_manage_contracts',
  ManageStaffContracts: 'can_manage_staff_contracts',

  // Business
  ViewDirectory: 'can_view_directory',
  EditDirectory: 'can_edit_directory',
  ManagePartners: 'can_manage_partners',
  ManageImpact: 'can_manage_impact',

  // Settings
  EditSettingsBusiness: 'can_edit_settings_business',
  EditSettingsOperations: 'can_edit_settings_operations',
  EditSettingsFleet: 'can_edit_settings_fleet',
  EditSettingsFinance: 'can_edit_settings_finance',
  EditSettingsHr: 'can_edit_settings_hr',

  // Administration
  ManageAccess: 'can_manage_access',
  ViewUIErrors: 'can_view_uierrors',
  ManageUIErrors: 'can_manage_uierrors',
  UseDevTools: 'can_use_dev_tools',

  /** The reception tablet: customers book a walk-in themselves and sign the waiver. */
  UseCounter: 'can_use_counter',
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];
/** @deprecated Use `PermissionKey`. */
export type PermissionType = PermissionKey;

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.freeze(
  Array.from(new Set(Object.values(Permission))),
);

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

/**
 * Keys that existed before the permissions overhaul, mapped to the keys that
 * replaced them. The migration backfills roles from this map, and the database
 * `has_permission()` helper honours it so older RLS policies keep working.
 */
export const LEGACY_PERMISSION_ALIASES: Readonly<Record<string, readonly PermissionKey[]>> = {
  can_edit_settings: [
    Permission.EditSettingsBusiness,
    Permission.EditSettingsOperations,
    Permission.EditSettingsFleet,
    Permission.EditSettingsFinance,
    Permission.EditSettingsHr,
    Permission.ManagePartners,
    Permission.ManageImpact,
    Permission.EditDirectory,
    Permission.ManageAccess,
    Permission.UseDevTools,
  ],
  can_view_fleet_book_value: [Permission.ViewFleetFinancials],
};

/**
 * One-off grants applied when the split permissions were introduced: any role
 * holding the source key also received the target keys, so nobody lost access.
 */
export const PERMISSION_SPLIT_BACKFILL: ReadonlyArray<{ from: string; grant: readonly PermissionKey[] }> = [
  ...Object.entries(LEGACY_PERMISSION_ALIASES).map(([from, grant]) => ({ from, grant })),
  { from: Permission.ViewAccounts, grant: [Permission.ViewFleetFinancials, Permission.EditBudget] },
  { from: Permission.ViewMiscSales, grant: [Permission.EditMiscSales, Permission.ManageMerchandise] },
  { from: Permission.ViewCardSettlements, grant: [Permission.EditCardSettlements] },
  { from: Permission.ViewLostOpportunity, grant: [Permission.EditLostOpportunity] },
  { from: Permission.ViewUIErrors, grant: [Permission.ManageUIErrors] },
  { from: Permission.ViewInbox, grant: [Permission.ViewCustomers] },
  { from: Permission.EditOrders, grant: [Permission.EditCustomers, Permission.PerformInspections] },
];

/**
 * Adds the replacements for any retired keys. With `splitBackfill`, also adds
 * the grants the overhaul migration gives existing roles, for databases where
 * that migration has not run yet.
 */
export function expandLegacyPermissions(keys: Iterable<string>, options: { splitBackfill?: boolean } = {}): string[] {
  const out = new Set(keys);
  const rules = options.splitBackfill
    ? PERMISSION_SPLIT_BACKFILL
    : Object.entries(LEGACY_PERMISSION_ALIASES).map(([from, grant]) => ({ from, grant }));
  for (const rule of rules) {
    if (out.has(rule.from)) for (const k of rule.grant) out.add(k);
  }
  return [...out];
}
