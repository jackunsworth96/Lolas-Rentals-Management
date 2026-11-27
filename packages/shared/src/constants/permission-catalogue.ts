import { ALL_PERMISSIONS, Permission, type PermissionKey } from './permissions.js';

export type PermissionAreaId =
  | 'orders'
  | 'invoices'
  | 'customers'
  | 'transfers'
  | 'fleet'
  | 'maintenance'
  | 'cashup'
  | 'sales'
  | 'card_settlements'
  | 'expenses'
  | 'accounts'
  | 'insights'
  | 'lost_opportunities'
  | 'tasks'
  | 'timesheets'
  | 'rota'
  | 'employees'
  | 'payroll'
  | 'contracts'
  | 'directory'
  | 'partners'
  | 'settings'
  | 'access'
  | 'system'
  | 'counter';

export type PermissionGroupId = 'operations' | 'fleet' | 'finance' | 'people' | 'business' | 'administration';

export type AccessLevelId = 'none' | 'view' | 'edit' | 'manage';

export interface PermissionDefinition {
  key: PermissionKey;
  area: PermissionAreaId;
  label: string;
  description: string;
  /** Plain-English pages and actions this permission unlocks. */
  grants: readonly string[];
  /** Permissions that are switched on automatically with this one. */
  requires?: readonly PermissionKey[];
  /** Money, personal data or access control: changes are called out before saving. */
  sensitive?: boolean;
}

export interface AccessLevel {
  id: Exclude<AccessLevelId, 'none'>;
  label: string;
  /** Every permission held at this level (levels are cumulative). */
  permissions: readonly PermissionKey[];
}

export interface PermissionArea {
  id: PermissionAreaId;
  group: PermissionGroupId;
  label: string;
  description: string;
  levels: readonly AccessLevel[];
}

export const PERMISSION_GROUPS: ReadonlyArray<{ id: PermissionGroupId; label: string }> = [
  { id: 'operations', label: 'Operations' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'finance', label: 'Finance' },
  { id: 'people', label: 'People' },
  { id: 'business', label: 'Business' },
  { id: 'administration', label: 'Administration' },
];

const P = Permission;

export const PERMISSION_CATALOGUE: Readonly<Record<PermissionKey, PermissionDefinition>> = {
  // ── Orders & bookings ──
  [P.ViewInbox]: {
    key: P.ViewInbox,
    area: 'orders',
    label: 'View inbox and order details',
    description: 'See new bookings waiting to be processed and open any order to read its details.',
    grants: ['Inbox page', 'Order details, items, payments and history', "Today's pickups on the Dashboard", 'Surf rack availability', 'Inspection checklist for an order'],
  },
  [P.ViewActive]: {
    key: P.ViewActive,
    area: 'orders',
    label: 'View active rentals',
    description: 'See rentals that are currently out with customers.',
    grants: ['Active page', "Today's returns and overdue returns on the Dashboard"],
  },
  [P.ViewCompleted]: {
    key: P.ViewCompleted,
    area: 'orders',
    label: 'View completed orders',
    description: 'Browse finished and settled rentals.',
    grants: ['Completed page'],
  },
  [P.EditOrders]: {
    key: P.EditOrders,
    area: 'orders',
    label: 'Process and manage orders',
    description: 'Run the day-to-day booking workflow from inbox to settlement.',
    grants: [
      'Process inbox bookings and book walk-ins',
      'Activate and settle rentals',
      'Collect payments and issue refunds',
      'Adjust dates, swap vehicles and change add-ons',
      'Check in waivers and extend rentals',
    ],
    requires: [P.ViewInbox, P.ViewActive, P.ViewCustomers],
  },
  [P.PerformInspections]: {
    key: P.PerformInspections,
    area: 'orders',
    label: 'Run vehicle inspections',
    description: 'Complete the pre-ride inspection with the customer and record the odometer.',
    grants: ['Vehicle inspection form', "See and update a vehicle's last mileage"],
    requires: [P.ViewInbox],
  },
  [P.CancelOrders]: {
    key: P.CancelOrders,
    area: 'orders',
    label: 'Cancel and write off orders',
    description: 'Cancel bookings and write off unpaid balances.',
    grants: ['Cancel button on orders', 'Write off an outstanding balance'],
    requires: [P.ViewInbox],
    sensitive: true,
  },
  [P.ManageInvoices]: {
    key: P.ManageInvoices,
    area: 'invoices',
    label: 'Manage invoices',
    description: 'Create, edit and send invoices linked to orders.',
    grants: ['Invoices page', 'Invoice bar on orders'],
    requires: [P.ViewInbox],
  },

  // ── Customers ──
  [P.ViewCustomers]: {
    key: P.ViewCustomers,
    area: 'customers',
    label: 'View customers',
    description: 'Search customers and see their booking history and documents.',
    grants: ['Customers page', 'Customer profile and documents'],
  },
  [P.EditCustomers]: {
    key: P.EditCustomers,
    area: 'customers',
    label: 'Edit customers',
    description: "Update a customer's details, contact preferences and blacklist status.",
    grants: ['Edit customer details and WhatsApp number', 'Blacklist a customer', 'Email documents to a customer', 'Create a customer at check-in'],
    requires: [P.ViewCustomers],
  },

  // ── Transfers ──
  [P.ViewTransfers]: {
    key: P.ViewTransfers,
    area: 'transfers',
    label: 'View transfers',
    description: 'See airport and van transfer bookings.',
    grants: ['Transfers page', 'Airport transfers on the Dashboard'],
  },
  [P.EditTransfers]: {
    key: P.EditTransfers,
    area: 'transfers',
    label: 'Manage transfers',
    description: 'Create, edit, assign and settle transfers.',
    grants: ['Create and edit transfers', 'Record transfer payments and settle drivers', 'Delete transfers'],
    requires: [P.ViewTransfers],
  },

  // ── Fleet ──
  [P.ViewFleet]: {
    key: P.ViewFleet,
    area: 'fleet',
    label: 'View fleet',
    description: 'See vehicles, their status, availability and incidents.',
    grants: ['Fleet page', 'Availability finder and calendar', 'Accidents and breakdowns', 'Partner protection holds'],
  },
  [P.EditFleet]: {
    key: P.EditFleet,
    area: 'fleet',
    label: 'Manage vehicles',
    description: 'Add and edit vehicles and record what happens to them.',
    grants: ['Add and edit vehicles', 'Owner-use periods and early hold release', 'Report and update accidents and breakdowns', 'Record vehicle purchases, sales and depreciation'],
    requires: [P.ViewFleet],
  },
  [P.ViewFleetFinancials]: {
    key: P.ViewFleetFinancials,
    area: 'fleet',
    label: 'View fleet financials',
    description: 'See what vehicles cost and what they are worth now.',
    grants: ['Purchase price, book value and depreciation columns', 'Fleet cost summary', 'Asset Register', 'Utilization dashboard'],
    requires: [P.ViewFleet],
    sensitive: true,
  },
  [P.ViewMaintenance]: {
    key: P.ViewMaintenance,
    area: 'maintenance',
    label: 'View maintenance',
    description: 'See the maintenance log for every vehicle.',
    grants: ['Maintenance page'],
  },
  [P.EditMaintenance]: {
    key: P.EditMaintenance,
    area: 'maintenance',
    label: 'Log and update maintenance',
    description: 'Record repairs, parts and labour, and close maintenance jobs.',
    grants: ['Log maintenance', 'Edit and complete maintenance records'],
    requires: [P.ViewMaintenance],
  },

  // ── Cash & sales ──
  [P.ViewCashup]: {
    key: P.ViewCashup,
    area: 'cashup',
    label: 'Do the daily cash up',
    description: 'Count the till and close the day.',
    grants: ['Cash Up page', 'Submit the daily cash count'],
  },
  [P.OverrideCashup]: {
    key: P.OverrideCashup,
    area: 'cashup',
    label: 'Override and reopen cash ups',
    description: 'Correct a closed cash up and see every staff member’s totals.',
    grants: ['Reopen a closed day', 'Override cash up figures', 'Staff summary on Cash Up'],
    requires: [P.ViewCashup],
    sensitive: true,
  },
  [P.ViewMiscSales]: {
    key: P.ViewMiscSales,
    area: 'sales',
    label: 'View misc sales and merchandise',
    description: 'See sales recorded outside of rentals and the merchandise stock list.',
    grants: ['Misc Sales page', 'Merchandise page'],
  },
  [P.EditMiscSales]: {
    key: P.EditMiscSales,
    area: 'sales',
    label: 'Record misc sales',
    description: 'Record, correct and delete misc sales.',
    grants: ['Record a misc sale', 'Edit and delete misc sales'],
    requires: [P.ViewMiscSales],
  },
  [P.ManageMerchandise]: {
    key: P.ManageMerchandise,
    area: 'sales',
    label: 'Manage merchandise stock',
    description: 'Add merchandise items, change prices and adjust stock.',
    grants: ['Add and edit merchandise items', 'Adjust stock levels', 'Delete merchandise items'],
    requires: [P.ViewMiscSales],
  },
  [P.ViewCardSettlements]: {
    key: P.ViewCardSettlements,
    area: 'card_settlements',
    label: 'View card settlements',
    description: 'See card payments waiting to settle and those already settled.',
    grants: ['Card Settlements page'],
  },
  [P.EditCardSettlements]: {
    key: P.EditCardSettlements,
    area: 'card_settlements',
    label: 'Match card settlements',
    description: 'Match, combine and correct card settlement batches.',
    grants: ['Match settlements to payments', 'Combine and batch-edit settlements'],
    requires: [P.ViewCardSettlements],
  },
  [P.ViewExpenses]: {
    key: P.ViewExpenses,
    area: 'expenses',
    label: 'View expenses',
    description: 'See expenses recorded for the store.',
    grants: ['Expenses page'],
  },
  [P.EditExpenses]: {
    key: P.EditExpenses,
    area: 'expenses',
    label: 'Record and pay expenses',
    description: 'Log expenses, mark them paid and pay out staff allowances.',
    grants: ['Log and edit expenses', 'Pay expenses', 'Pay out staff allowance', 'Read payment routing'],
    requires: [P.ViewExpenses],
  },

  // ── Accounts ──
  [P.ViewAccounts]: {
    key: P.ViewAccounts,
    area: 'accounts',
    label: 'View accounts and budget',
    description: 'See the ledger, account balances, vehicle owner statements and the budget.',
    grants: ['Accounts page and account ledgers', 'Budget page', 'Vehicle owner statements'],
    sensitive: true,
  },
  [P.EditBudget]: {
    key: P.EditBudget,
    area: 'accounts',
    label: 'Edit the budget',
    description: 'Change budget lines for each period.',
    grants: ['Edit budget lines'],
    requires: [P.ViewAccounts],
  },
  [P.EditAccounts]: {
    key: P.EditAccounts,
    area: 'accounts',
    label: 'Post to the accounts',
    description: 'Make manual journals, transfers between accounts, reconciliations and owner payouts.',
    grants: ['Manual journal entries', 'Transfers, reconciliation and drawings', 'Close vehicle owner months and pay owners', 'Manager expense categories and safe account'],
    requires: [P.ViewAccounts],
    sensitive: true,
  },

  // ── Insights ──
  [P.ViewDashboard]: {
    key: P.ViewDashboard,
    area: 'insights',
    label: 'View business performance',
    description: 'See revenue, owner dashboards, analytics and marketing insights.',
    grants: ['Revenue figures on the Dashboard', 'Business and Marketing dashboard tabs', 'Analytics page', 'Chat and basket abandonment insights'],
    sensitive: true,
  },
  [P.ViewLostOpportunity]: {
    key: P.ViewLostOpportunity,
    area: 'lost_opportunities',
    label: 'View lost opportunities',
    description: 'See customers who were turned away.',
    grants: ['Lost opportunities log'],
  },
  [P.EditLostOpportunity]: {
    key: P.EditLostOpportunity,
    area: 'lost_opportunities',
    label: 'Log lost opportunities',
    description: 'Record, edit and delete turned-away customers.',
    grants: ['Log a lost opportunity', 'Edit and delete entries'],
    requires: [P.ViewLostOpportunity],
  },

  // ── Tasks ──
  [P.ViewTodo]: {
    key: P.ViewTodo,
    area: 'tasks',
    label: 'Work on tasks',
    description: 'See assigned tasks, comment on them and mark them done.',
    grants: ['To Do page', 'Comment on and complete tasks'],
  },
  [P.ManageTodo]: {
    key: P.ManageTodo,
    area: 'tasks',
    label: 'Manage tasks',
    description: 'Create, assign and verify tasks for the team.',
    grants: ['Create and assign tasks', 'Verify and reopen tasks', 'See everyone’s tasks'],
    requires: [P.ViewTodo],
  },

  // ── People ──
  [P.ViewTimesheets]: {
    key: P.ViewTimesheets,
    area: 'timesheets',
    label: 'View timesheets',
    description: 'See timesheets and cash advances for the team.',
    grants: ['Timesheets page', 'Employee list for timesheets', 'Cash advance list'],
  },
  [P.SubmitTimesheets]: {
    key: P.SubmitTimesheets,
    area: 'timesheets',
    label: 'Submit timesheets',
    description: 'Enter hours worked and submit leave.',
    grants: ['Submit timesheets', 'Submit leave', 'Send the rota to timesheets'],
    requires: [P.ViewTimesheets],
  },
  [P.ApproveTimesheets]: {
    key: P.ApproveTimesheets,
    area: 'timesheets',
    label: 'Approve timesheets',
    description: 'Approve or reject submitted timesheets.',
    grants: ['Approve and reject timesheets'],
    requires: [P.ViewTimesheets],
  },
  [P.EditTimesheets]: {
    key: P.EditTimesheets,
    area: 'timesheets',
    label: 'Edit and delete timesheets',
    description: 'Correct or remove timesheets after they are submitted.',
    grants: ['Edit timesheet entries', 'Delete timesheets'],
    requires: [P.ViewTimesheets],
  },
  [P.ManageRota]: {
    key: P.ManageRota,
    area: 'rota',
    label: 'Use the staff rota',
    description: 'Open the rota and pick days off. Editing the rota also needs the person to be a rota approver.',
    grants: ['Rota page', 'Rota picks in My Portal'],
  },
  [P.ManageEmployees]: {
    key: P.ManageEmployees,
    area: 'employees',
    label: 'Manage employees',
    description: 'Add, edit and remove employee records, including pay rates and cash advances.',
    grants: ['Employees page', 'Add, edit and remove employees', 'Grant cash advances'],
    sensitive: true,
  },
  [P.ViewPayroll]: {
    key: P.ViewPayroll,
    area: 'payroll',
    label: 'View payroll',
    description: 'See payroll runs, payslips and allowance balances.',
    grants: ['Payroll page', 'Payslips tab on employees', 'Rate history'],
    sensitive: true,
  },
  [P.ApproveStaffRequests]: {
    key: P.ApproveStaffRequests,
    area: 'payroll',
    label: 'Approve staff requests',
    description: 'Approve leave and cash advance requests and resolve disputed payslips.',
    grants: ['Approve leave and cash advance requests', 'Resolve payslip disputes', 'Pending request badges'],
    requires: [P.ViewPayroll],
  },
  [P.RunPayroll]: {
    key: P.RunPayroll,
    area: 'payroll',
    label: 'Run payroll',
    description: 'Post and void payroll runs, record remittances and adjust balances.',
    grants: ['Post and void payroll runs', 'Record government remittances', 'Adjust allowances and 13th month', 'Manage holidays and rate history'],
    requires: [P.ViewPayroll],
    sensitive: true,
  },
  [P.ManageContracts]: {
    key: P.ManageContracts,
    area: 'contracts',
    label: 'Manage business contracts',
    description: 'Create and send contracts for customers, partners and suppliers.',
    grants: ['Contracts page (business contracts)', 'Business contract templates'],
  },
  [P.ManageStaffContracts]: {
    key: P.ManageStaffContracts,
    area: 'contracts',
    label: 'Manage staff contracts',
    description: 'Create and send employment contracts.',
    grants: ['Contracts page (staff contracts)', 'Staff contract templates'],
    sensitive: true,
  },

  // ── Business ──
  [P.ViewDirectory]: {
    key: P.ViewDirectory,
    area: 'directory',
    label: 'View directory',
    description: 'See the contacts directory.',
    grants: ['Directory page'],
  },
  [P.EditDirectory]: {
    key: P.EditDirectory,
    area: 'directory',
    label: 'Edit directory',
    description: 'Add, edit and remove directory contacts.',
    grants: ['Add, edit and delete contacts'],
    requires: [P.ViewDirectory],
  },
  [P.ManagePartners]: {
    key: P.ManagePartners,
    area: 'partners',
    label: 'Manage partners',
    description: 'Run the accommodation partner programme.',
    grants: ['Partners page and partner utilization', 'Approve partners and manage their portal users', 'Partner commissions and monthly reports', 'Assign a partner to an order', 'Partner vehicle allocations'],
  },
  [P.ManageImpact]: {
    key: P.ManageImpact,
    area: 'partners',
    label: 'Manage impact articles',
    description: 'Write and publish articles on the public impact page.',
    grants: ['Impact Articles page'],
  },

  // ── Settings ──
  [P.EditSettingsBusiness]: {
    key: P.EditSettingsBusiness,
    area: 'settings',
    label: 'Business settings',
    description: 'Stores, delivery locations, accommodation directory, reviews and Paw Card establishments.',
    grants: ['Settings: Stores, Locations, Accommodation Directory, Reviews, Paw Card', 'See archived stores', 'Accommodation name aliases'],
  },
  [P.EditSettingsOperations]: {
    key: P.EditSettingsOperations,
    area: 'settings',
    label: 'Operations settings',
    description: 'Add-ons, transfer routes, pickup rules, inspection checklist and task categories.',
    grants: ['Settings: Add-ons, Transfer Routes, Pickup Rules, Inspection Checklist, Task Categories'],
  },
  [P.EditSettingsFleet]: {
    key: P.EditSettingsFleet,
    area: 'settings',
    label: 'Fleet settings',
    description: 'Vehicle models and pricing, fleet statuses, maintenance parts and repair costs.',
    grants: ['Settings: Vehicle Models, Fleet Statuses, Maintenance Parts, Repair Costs', 'Vehicle model pricing and images'],
  },
  [P.EditSettingsFinance]: {
    key: P.EditSettingsFinance,
    area: 'settings',
    label: 'Finance settings',
    description: 'Payment methods, payment routing, chart of accounts, expense categories, invoices and fleet accounting.',
    grants: ['Settings: Payment Methods, Payment Routing, Chart of Accounts, Expense Categories, Invoices, Fleet Accounting'],
    sensitive: true,
  },
  [P.EditSettingsHr]: {
    key: P.EditSettingsHr,
    area: 'settings',
    label: 'HR settings',
    description: 'Day types and leave allowances.',
    grants: ['Settings: Day Types, Leave Config'],
  },

  // ── Administration ──
  [P.ManageAccess]: {
    key: P.ManageAccess,
    area: 'access',
    label: 'Manage users and access',
    description: 'Create logins, assign roles, change role permissions and give individual exceptions.',
    grants: ['Settings: Users, Roles & Access', 'Per-person access exceptions', 'Access change history'],
    sensitive: true,
  },
  [P.ViewUIErrors]: {
    key: P.ViewUIErrors,
    area: 'system',
    label: 'Report app issues',
    description: 'Report problems and ideas about the backoffice and see what others have reported.',
    grants: ['Report a UI issue', 'See reported issues'],
  },
  [P.ManageUIErrors]: {
    key: P.ManageUIErrors,
    area: 'system',
    label: 'Resolve app issues',
    description: 'Mark reported issues as fixed.',
    grants: ['Mark issues fixed or outstanding'],
    requires: [P.ViewUIErrors],
  },
  [P.UseDevTools]: {
    key: P.UseDevTools,
    area: 'system',
    label: 'Developer tools',
    description: 'Run maintenance scripts that reset or repair data.',
    grants: ['Developer tools actions'],
    sensitive: true,
  },
  [P.UseCounter]: {
    key: P.UseCounter,
    area: 'counter',
    label: 'Reception tablet',
    description: 'Lets customers book a walk-in and sign the waiver themselves. An account with only this permission is locked to the counter screen.',
    grants: ['Counter screen'],
  },
};

const levels = (...defs: Array<[AccessLevel['id'], string, PermissionKey[]]>): AccessLevel[] => {
  const out: AccessLevel[] = [];
  let acc: PermissionKey[] = [];
  for (const [id, label, add] of defs) {
    acc = [...acc, ...add];
    out.push({ id, label, permissions: acc });
  }
  return out;
};

export const PERMISSION_AREAS: readonly PermissionArea[] = [
  {
    id: 'orders', group: 'operations', label: 'Orders & bookings',
    description: 'Inbox, active rentals, completed orders and inspections.',
    levels: levels(
      ['view', 'View', [P.ViewInbox, P.ViewActive, P.ViewCompleted]],
      ['edit', 'Process', [P.EditOrders, P.PerformInspections]],
      ['manage', 'Full', [P.CancelOrders]],
    ),
  },
  {
    id: 'invoices', group: 'operations', label: 'Invoices',
    description: 'Invoices raised against orders.',
    levels: levels(['manage', 'Manage', [P.ManageInvoices]]),
  },
  {
    id: 'customers', group: 'operations', label: 'Customers',
    description: 'Customer records and documents.',
    levels: levels(['view', 'View', [P.ViewCustomers]], ['edit', 'Edit', [P.EditCustomers]]),
  },
  {
    id: 'transfers', group: 'operations', label: 'Transfers',
    description: 'Airport and van transfers.',
    levels: levels(['view', 'View', [P.ViewTransfers]], ['edit', 'Manage', [P.EditTransfers]]),
  },
  {
    id: 'tasks', group: 'operations', label: 'Tasks',
    description: 'The team To Do list.',
    levels: levels(['view', 'Work on', [P.ViewTodo]], ['manage', 'Manage', [P.ManageTodo]]),
  },
  {
    id: 'fleet', group: 'fleet', label: 'Fleet',
    description: 'Vehicles, availability and incidents.',
    levels: levels(
      ['view', 'View', [P.ViewFleet]],
      ['edit', 'Edit', [P.EditFleet]],
      ['manage', 'Full', [P.ViewFleetFinancials]],
    ),
  },
  {
    id: 'maintenance', group: 'fleet', label: 'Maintenance',
    description: 'The maintenance log.',
    levels: levels(['view', 'View', [P.ViewMaintenance]], ['edit', 'Edit', [P.EditMaintenance]]),
  },
  {
    id: 'cashup', group: 'finance', label: 'Cash up',
    description: 'Daily till count and close.',
    levels: levels(['view', 'Do cash up', [P.ViewCashup]], ['manage', 'Full', [P.OverrideCashup]]),
  },
  {
    id: 'sales', group: 'finance', label: 'Misc sales & merchandise',
    description: 'Sales outside of rentals and merchandise stock.',
    levels: levels(
      ['view', 'View', [P.ViewMiscSales]],
      ['edit', 'Record sales', [P.EditMiscSales]],
      ['manage', 'Full', [P.ManageMerchandise]],
    ),
  },
  {
    id: 'card_settlements', group: 'finance', label: 'Card settlements',
    description: 'Matching card payments to bank settlements.',
    levels: levels(['view', 'View', [P.ViewCardSettlements]], ['edit', 'Match', [P.EditCardSettlements]]),
  },
  {
    id: 'expenses', group: 'finance', label: 'Expenses',
    description: 'Store expenses and payouts.',
    levels: levels(['view', 'View', [P.ViewExpenses]], ['edit', 'Record', [P.EditExpenses]]),
  },
  {
    id: 'accounts', group: 'finance', label: 'Accounts & budget',
    description: 'The ledger, budget and owner statements.',
    levels: levels(
      ['view', 'View', [P.ViewAccounts]],
      ['edit', 'Edit budget', [P.EditBudget]],
      ['manage', 'Full', [P.EditAccounts]],
    ),
  },
  {
    id: 'insights', group: 'business', label: 'Business performance',
    description: 'Revenue, analytics and owner dashboards.',
    levels: levels(['view', 'View', [P.ViewDashboard]]),
  },
  {
    id: 'lost_opportunities', group: 'business', label: 'Lost opportunities',
    description: 'Customers who were turned away.',
    levels: levels(['view', 'View', [P.ViewLostOpportunity]], ['edit', 'Log', [P.EditLostOpportunity]]),
  },
  {
    id: 'timesheets', group: 'people', label: 'Timesheets',
    description: 'Hours worked and leave.',
    levels: levels(
      ['view', 'View', [P.ViewTimesheets]],
      ['edit', 'Submit', [P.SubmitTimesheets]],
      ['manage', 'Full', [P.ApproveTimesheets, P.EditTimesheets]],
    ),
  },
  {
    id: 'rota', group: 'people', label: 'Rota',
    description: 'The staff schedule.',
    levels: levels(['view', 'Use', [P.ManageRota]]),
  },
  {
    id: 'employees', group: 'people', label: 'Employees',
    description: 'Employee records and pay rates.',
    levels: levels(['manage', 'Manage', [P.ManageEmployees]]),
  },
  {
    id: 'payroll', group: 'people', label: 'Payroll',
    description: 'Payroll runs, payslips and staff requests.',
    levels: levels(
      ['view', 'View', [P.ViewPayroll]],
      ['edit', 'Approve requests', [P.ApproveStaffRequests]],
      ['manage', 'Full', [P.RunPayroll]],
    ),
  },
  {
    id: 'contracts', group: 'people', label: 'Contracts',
    description: 'Business and staff contracts.',
    levels: levels(['edit', 'Business', [P.ManageContracts]], ['manage', 'Full', [P.ManageStaffContracts]]),
  },
  {
    id: 'directory', group: 'business', label: 'Directory',
    description: 'The contacts directory.',
    levels: levels(['view', 'View', [P.ViewDirectory]], ['edit', 'Edit', [P.EditDirectory]]),
  },
  {
    id: 'partners', group: 'business', label: 'Partners & impact',
    description: 'Accommodation partners and public impact articles.',
    levels: levels(['manage', 'Manage', [P.ManagePartners, P.ManageImpact]]),
  },
  {
    id: 'settings', group: 'administration', label: 'Settings',
    description: 'Business, operations, fleet, finance and HR configuration.',
    levels: levels(['manage', 'All settings', [
      P.EditSettingsBusiness, P.EditSettingsOperations, P.EditSettingsFleet, P.EditSettingsFinance, P.EditSettingsHr,
    ]]),
  },
  {
    id: 'access', group: 'administration', label: 'Users & access',
    description: 'Logins, roles and individual exceptions.',
    levels: levels(['manage', 'Manage', [P.ManageAccess]]),
  },
  {
    id: 'system', group: 'administration', label: 'App issues & tools',
    description: 'Issue reports and developer tools.',
    levels: levels(
      ['view', 'Report', [P.ViewUIErrors]],
      ['edit', 'Resolve', [P.ManageUIErrors]],
      ['manage', 'Full', [P.UseDevTools]],
    ),
  },
  {
    id: 'counter', group: 'administration', label: 'Reception tablet',
    description: 'Self-service walk-in screen.',
    levels: levels(['view', 'Enabled', [P.UseCounter]]),
  },
];

export const PERMISSION_AREA_BY_ID: Readonly<Record<PermissionAreaId, PermissionArea>> = Object.fromEntries(
  PERMISSION_AREAS.map((a) => [a.id, a]),
) as Record<PermissionAreaId, PermissionArea>;

export function getPermissionDefinition(key: string): PermissionDefinition | undefined {
  return (PERMISSION_CATALOGUE as Record<string, PermissionDefinition>)[key];
}

export function permissionsInArea(area: PermissionAreaId): PermissionKey[] {
  return ALL_PERMISSIONS.filter((k) => PERMISSION_CATALOGUE[k].area === area);
}

/** Adds every permission the given ones depend on (transitively). */
export function withRequiredPermissions(keys: Iterable<string>): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  const stack = [...keys].filter((k): k is PermissionKey => getPermissionDefinition(k) !== undefined);
  while (stack.length > 0) {
    const key = stack.pop()!;
    if (out.has(key)) continue;
    out.add(key);
    for (const dep of PERMISSION_CATALOGUE[key].requires ?? []) stack.push(dep);
  }
  return out;
}

/** Permissions that depend on `key` (transitively) and must be removed with it. */
export function dependentPermissions(key: PermissionKey): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  let frontier: PermissionKey[] = [key];
  while (frontier.length > 0) {
    const next: PermissionKey[] = [];
    for (const k of ALL_PERMISSIONS) {
      if (out.has(k) || k === key) continue;
      if ((PERMISSION_CATALOGUE[k].requires ?? []).some((r) => frontier.includes(r))) {
        out.add(k);
        next.push(k);
      }
    }
    frontier = next;
  }
  return out;
}

/** Turns a permission on or off, keeping dependencies consistent. */
export function togglePermission(selected: ReadonlySet<string>, key: PermissionKey, on: boolean): Set<PermissionKey> {
  const next = new Set([...selected].filter((k): k is PermissionKey => getPermissionDefinition(k) !== undefined));
  if (on) {
    for (const k of withRequiredPermissions([key])) next.add(k);
  } else {
    next.delete(key);
    for (const k of dependentPermissions(key)) next.delete(k);
  }
  return next;
}

/**
 * The preset level that exactly matches the selection within an area, or
 * `custom` when the selection is between presets.
 */
export function areaLevel(selected: ReadonlySet<string>, areaId: PermissionAreaId): AccessLevelId | 'custom' {
  const area = PERMISSION_AREA_BY_ID[areaId];
  const inArea = permissionsInArea(areaId).filter((k) => selected.has(k));
  if (inArea.length === 0) return 'none';
  for (const level of area.levels) {
    if (level.permissions.length === inArea.length && level.permissions.every((k) => selected.has(k))) {
      return level.id;
    }
  }
  return 'custom';
}

/** Replaces an area's permissions with the chosen preset, keeping dependencies elsewhere consistent. */
export function applyAreaLevel(selected: ReadonlySet<string>, areaId: PermissionAreaId, levelId: AccessLevelId): Set<PermissionKey> {
  let next = new Set([...selected].filter((k): k is PermissionKey => getPermissionDefinition(k) !== undefined));
  const inArea = permissionsInArea(areaId);
  const target = levelId === 'none'
    ? new Set<PermissionKey>()
    : new Set(PERMISSION_AREA_BY_ID[areaId].levels.find((l) => l.id === levelId)?.permissions ?? []);
  for (const k of inArea) {
    if (!target.has(k) && next.has(k)) next = togglePermission(next, k, false);
  }
  for (const k of target) next = togglePermission(next, k, true);
  return next;
}

export interface PermissionOverride {
  permission: string;
  effect: 'grant' | 'revoke';
  expiresAt?: string | null;
}

export function isOverrideActive(override: Pick<PermissionOverride, 'expiresAt'>, now: Date = new Date()): boolean {
  return !override.expiresAt || new Date(override.expiresAt).getTime() > now.getTime();
}

/**
 * Role permissions plus unexpired per-person grants, minus unexpired revokes.
 * Unknown keys are dropped. Grants pull in their dependencies; revokes also
 * remove whatever depends on the revoked permission.
 */
export function resolveEffectivePermissions(
  rolePermissions: Iterable<string>,
  overrides: Iterable<PermissionOverride> = [],
  now: Date = new Date(),
): PermissionKey[] {
  const active = [...overrides].filter((o) => isOverrideActive(o, now));
  const result = new Set<PermissionKey>([...rolePermissions].filter((k): k is PermissionKey => getPermissionDefinition(k) !== undefined));
  for (const k of withRequiredPermissions(active.filter((o) => o.effect === 'grant').map((o) => o.permission))) {
    result.add(k);
  }
  let resolved: Set<PermissionKey> = result;
  for (const o of active) {
    if (o.effect === 'revoke' && getPermissionDefinition(o.permission)) {
      resolved = togglePermission(resolved, o.permission as PermissionKey, false);
    }
  }
  return ALL_PERMISSIONS.filter((k) => resolved.has(k));
}
