export const SETTINGS_SECTIONS = [
  {
    label: 'Business',
    tabs: [
      { key: 'stores', label: 'Stores' },
      { key: 'users', label: 'Users' },
      { key: 'roles', label: 'Roles & Permissions' },
      { key: 'locations', label: 'Locations' },
      { key: 'accommodation-directory', label: 'Accommodation Directory' },
      { key: 'reviews', label: 'Reviews' },
      { key: 'paw-card', label: 'Paw Card Establishments' },
    ],
  },
  {
    label: 'Operations',
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
    tabs: [
      { key: 'day-types', label: 'Day Types' },
      { key: 'leave-config', label: 'Leave Config' },
    ],
  },
] as const;

export type SettingsTabKey = (typeof SETTINGS_SECTIONS)[number]['tabs'][number]['key'];

export const SETTINGS_TABS: ReadonlyArray<{ key: SettingsTabKey; label: string }> = SETTINGS_SECTIONS.flatMap(
  (s): ReadonlyArray<{ key: SettingsTabKey; label: string }> => s.tabs,
);
