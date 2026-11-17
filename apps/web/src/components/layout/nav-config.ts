import {
  LayoutDashboard,
  Inbox,
  Car,
  CheckSquare,
  Plane,
  Wrench,
  ParkingSquare,
  DollarSign,
  BarChart2,
  CreditCard,
  Calculator,
  Receipt,
  ShoppingBag,
  Users,
  Clock,
  Wallet,
  ListTodo,
  Package,
  BookOpen,
  Settings,
  UserSearch,
  Hotel,
  LineChart,
  Heart,
  Siren,
  FileText,
  FileSignature,
  UserCircle,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  /** Shown when the user has this permission, or any of them for a list. */
  perm: string | string[] | null;
  icon: LucideIcon;
  /** Path prefixes that count as this item being active. Defaults to `[path]`. */
  match?: string[];
  /** Extra search terms for quick search. */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function hasNavPermission(perm: NavItem['perm'], perms: string[]): boolean {
  if (!perm) return true;
  return Array.isArray(perm) ? perm.some((p) => perms.includes(p)) : perms.includes(perm);
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', path: '/dashboard', perm: null, icon: LayoutDashboard, keywords: ['home', 'today'] },
      { label: 'My Portal', path: '/me', perm: null, icon: UserCircle, keywords: ['payslip', 'leave', 'me'] },
      { label: 'To Do', path: '/todo', perm: 'can_view_todo', icon: ListTodo, keywords: ['tasks'] },
      { label: 'Inbox', path: '/orders/inbox', perm: 'can_view_inbox', icon: Inbox, keywords: ['orders', 'bookings', 'new'] },
      { label: 'Active', path: '/orders/active', perm: 'can_view_active', icon: Car, keywords: ['orders', 'rentals', 'returns'] },
      { label: 'Completed', path: '/orders/completed', perm: 'can_view_completed', icon: CheckSquare, keywords: ['orders', 'history'] },
      { label: 'Invoices', path: '/invoices', perm: 'can_manage_invoices', icon: FileText },
      { label: 'Transfers', path: '/transfers', perm: 'can_view_transfers', icon: Plane, keywords: ['airport', 'van', 'driver'] },
    ],
  },
  {
    label: 'Fleet',
    items: [
      {
        label: 'Fleet',
        path: '/fleet',
        perm: 'can_view_fleet',
        icon: ParkingSquare,
        keywords: ['vehicles', 'asset register', 'depreciation', 'utilization'],
      },
      { label: 'Maintenance', path: '/maintenance', perm: 'can_view_maintenance', icon: Wrench, keywords: ['repairs', 'service'] },
      {
        label: 'Incidents',
        path: '/fleet/accidents',
        perm: 'can_view_fleet',
        icon: Siren,
        match: ['/fleet/accidents', '/fleet/breakdowns'],
        keywords: ['accidents', 'breakdowns', 'damage'],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Accounts',
        path: '/accounts',
        perm: 'can_view_accounts',
        icon: DollarSign,
        match: ['/accounts', '/journal'],
        keywords: ['journal entry', 'ledger', 'balances', 'reconcile'],
      },
      { label: 'Budget', path: '/budget', perm: 'can_view_accounts', icon: BarChart2 },
      { label: 'Card Settlements', path: '/card-settlements', perm: 'can_view_cardsettlements', icon: CreditCard },
      { label: 'Cash Up', path: '/cashup', perm: 'can_view_cashup', icon: Calculator, keywords: ['close', 'till'] },
      { label: 'Expenses', path: '/expenses', perm: 'can_view_expenses', icon: Receipt },
      { label: 'Misc Sales', path: '/misc-sales', perm: 'can_view_miscsales', icon: ShoppingBag },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'Employees', path: '/hr/employees', perm: 'can_manage_employees', icon: Users, keywords: ['staff'] },
      { label: 'Rota', path: '/hr/rota', perm: 'can_manage_rota', icon: CalendarDays, keywords: ['schedule', 'shifts', 'day off', 'roster'] },
      { label: 'Timesheets', path: '/hr/timesheets', perm: 'can_view_timesheets', icon: Clock },
      { label: 'Payroll', path: '/hr/payroll', perm: 'can_view_payroll', icon: Wallet, keywords: ['payslips', 'salary'] },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Customers', path: '/customers', perm: null, icon: UserSearch },
      { label: 'Partners', path: '/partners', perm: 'can_edit_settings', icon: Hotel, keywords: ['utilization', 'affiliates', 'accommodation', 'commission'] },
      { label: 'Contracts', path: '/contracts', perm: ['can_manage_contracts', 'can_manage_staff_contracts'], icon: FileSignature },
      { label: 'Analytics', path: '/analytics', perm: 'can_view_dashboard', icon: LineChart, keywords: ['reports'] },
      { label: 'Impact Articles', path: '/impact', perm: 'can_edit_settings', icon: Heart, keywords: ['charity', 'blog'] },
      { label: 'Merchandise', path: '/merchandise', perm: 'can_view_miscsales', icon: Package },
      { label: 'Directory', path: '/directory', perm: 'can_view_directory', icon: BookOpen, keywords: ['contacts'] },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  label: 'Settings',
  path: '/settings',
  perm: 'can_edit_settings',
  icon: Settings,
};

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

const DEFAULT_PIN_PATHS = ['/dashboard', '/orders/inbox', '/orders/active', '/todo', '/cashup', '/me', '/fleet'];
export const MAX_PINS = 5;

export function defaultPins(perms: string[]): string[] {
  return DEFAULT_PIN_PATHS.filter((p) => {
    const item = ALL_NAV_ITEMS.find((i) => i.path === p);
    return item && hasNavPermission(item.perm, perms);
  }).slice(0, MAX_PINS);
}

/** The nav item whose match prefix is the longest match for `pathname`, so `/fleet/accidents` picks Incidents over Fleet. */
export function activeNavPath(pathname: string): string | null {
  let best: { path: string; len: number } | null = null;
  for (const item of ALL_NAV_ITEMS) {
    for (const m of item.match ?? [item.path]) {
      if ((pathname === m || pathname.startsWith(`${m}/`)) && (!best || m.length > best.len)) {
        best = { path: item.path, len: m.length };
      }
    }
  }
  return best?.path ?? null;
}
