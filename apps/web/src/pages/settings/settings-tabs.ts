import { Permission, type PermissionKey } from '@lolas/shared';

export const SETTINGS_SECTIONS = [
  {
    label: 'Users & access',
    perm: Permission.ManageAccess,
    tabs: [
      { key: 'users', label: 'User logins' },
      { key: 'roles', label: 'Roles' },
      { key: 'people', label: "People's access" },
      { key: 'access-history', label: 'Access history' },
    ],
  },
  {
    label: 'Business',
    perm: Permission.EditSettingsBusiness,
    tabs: [
      { key: 'stores', label: 'Stores' },
      { key: 'locations', label: 'Locations' },
      { key: 'accommodation-directory', label: 'Accommodation Directory' },
      { key: 'reviews', label: 'Reviews' },
      { key: 'paw-card', label: 'Paw Card Establishments' },
    ],
  },
  {
    label: 'Operations',
    perm: Permission.EditSettingsOperations,
    tabs: [
      { key: 'addons', label: 'Add-ons' },
      { key: 'transfer-routes', label: 'Transfer Routes' },
      { key: 'pickup-rules', label: 'Pickup Rules' },
      { key: 'inspection-checklist', label: 'Inspection Checklist' },
      { key: 'task-categories', label: 'Task Categories' },
    ],
  },
  {
    label: 'Fleet',
    perm: Permission.EditSettingsFleet,
    tabs: [
      { key: 'vehicle-models', label: 'Vehicle Models' },
      { key: 'fleet-statuses', label: 'Fleet Statuses' },
      { key: 'maintenance-parts', label: 'Maintenance Parts' },
      { key: 'repair-costs', label: 'Repair Costs' },
      { key: 'fleet-accounting', label: 'Fleet Accounting' },
    ],
  },
  {
    label: 'Finance',
    perm: Permission.EditSettingsFinance,
    tabs: [
      { key: 'payment-methods', label: 'Payment Methods' },
      { key: 'payment-routing', label: 'Payment Routing' },
      { key: 'chart-of-accounts', label: 'Chart of Accounts' },
      { key: 'expense-categories', label: 'Expense Categories' },
      { key: 'invoices', label: 'Invoices' },
    ],
  },
  {
    label: 'HR',
    perm: Permission.EditSettingsHr,
    tabs: [
      { key: 'day-types', label: 'Day Types' },
      { key: 'leave-config', label: 'Leave Config' },
    ],
  },
] as const satisfies ReadonlyArray<{ label: string; perm: PermissionKey; tabs: ReadonlyArray<{ key: string; label: string }> }>;

export type SettingsTabKey = (typeof SETTINGS_SECTIONS)[number]['tabs'][number]['key'];

export const SETTINGS_TABS: ReadonlyArray<{ key: SettingsTabKey; label: string }> = SETTINGS_SECTIONS.flatMap(
  (s): ReadonlyArray<{ key: SettingsTabKey; label: string }> => s.tabs,
);

/** The settings sections this person can open. */
export function visibleSettingsSections(perms: readonly string[]) {
  return SETTINGS_SECTIONS.filter((s) => perms.includes(s.perm));
}
