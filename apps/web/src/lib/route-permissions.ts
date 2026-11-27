import { Permission, type PermissionKey } from '@lolas/shared';

/** null = any signed-in user; a list = any one of them. */
export type PermissionRule = PermissionKey | readonly PermissionKey[] | null;

export function allows(rule: PermissionRule, perms: readonly string[]): boolean {
  if (!rule) return true;
  return typeof rule === 'string' ? perms.includes(rule) : rule.some((p) => perms.includes(p));
}

/** Holding any of these opens the Settings page (each section is gated separately). */
export const SETTINGS_PERMISSIONS = [
  Permission.EditSettingsBusiness,
  Permission.EditSettingsOperations,
  Permission.EditSettingsFleet,
  Permission.EditSettingsFinance,
  Permission.EditSettingsHr,
  Permission.ManageAccess,
] as const satisfies readonly PermissionKey[];

/**
 * The single source of truth for which permission opens each backoffice page.
 * The router guards and the sidebar both read from here, and the API enforces
 * the same keys on the data each page loads.
 */
export const ROUTE_PERMISSIONS = {
  '/dashboard': null,
  '/me': null,
  '/todo': Permission.ViewTodo,
  '/orders/inbox': Permission.ViewInbox,
  '/orders/active': Permission.ViewActive,
  '/orders/completed': Permission.ViewCompleted,
  '/invoices': Permission.ManageInvoices,
  '/transfers': Permission.ViewTransfers,
  '/fleet': Permission.ViewFleet,
  '/fleet/utilization': Permission.ViewFleetFinancials,
  '/fleet/asset-register': Permission.ViewFleetFinancials,
  '/fleet/accidents': Permission.ViewFleet,
  '/fleet/breakdowns': Permission.ViewFleet,
  '/maintenance': Permission.ViewMaintenance,
  '/accounts': Permission.ViewAccounts,
  '/accounts/vehicle-owners': Permission.ViewAccounts,
  '/accounts/:id': Permission.ViewAccounts,
  '/journal': Permission.EditAccounts,
  '/budget': Permission.ViewAccounts,
  '/card-settlements': Permission.ViewCardSettlements,
  '/cashup': Permission.ViewCashup,
  '/expenses': Permission.ViewExpenses,
  '/misc-sales': Permission.ViewMiscSales,
  '/merchandise': Permission.ViewMiscSales,
  '/hr/employees': Permission.ManageEmployees,
  '/hr/rota': Permission.ManageRota,
  '/hr/timesheets': Permission.ViewTimesheets,
  '/hr/payroll': Permission.ViewPayroll,
  '/customers': Permission.ViewCustomers,
  '/partners': Permission.ManagePartners,
  '/partners/utilization': Permission.ManagePartners,
  '/contracts': [Permission.ManageContracts, Permission.ManageStaffContracts],
  '/analytics': Permission.ViewDashboard,
  '/impact': Permission.ManageImpact,
  '/directory': Permission.ViewDirectory,
  '/settings': SETTINGS_PERMISSIONS,
  '/counter': Permission.UseCounter,
} as const satisfies Record<string, PermissionRule>;

export type BackofficePath = keyof typeof ROUTE_PERMISSIONS;
