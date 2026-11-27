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
import { ROUTE_PERMISSIONS } from '../../lib/route-permissions.js';

export interface NavItem {
  label: string;
  path: string;
  /** Shown when the user has this permission, or any of them for a list. */
  perm: string | readonly string[] | null;
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
  return typeof perm === 'string' ? perms.includes(perm) : perm.some((p) => perms.includes(p));
}

/** Nav-only flag (never stored in the database) for pages that exist only for staff, not owners or developers. */
export const STAFF_ONLY = 'nav:staff_only';

/** The permissions nav visibility checks against: the role's permissions plus STAFF_ONLY for staff. */
export function navPermissions(user: { permissions?: string[]; personType?: string } | null | undefined): string[] {
  const perms = user?.permissions ?? [];
  return (user?.personType ?? 'staff') === 'staff' ? [...perms, STAFF_ONLY] : perms;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', path: '/dashboard', perm: ROUTE_PERMISSIONS['/dashboard'], icon: LayoutDashboard, keywords: ['home', 'today'] },
      { label: 'My Portal', path: '/me', perm: STAFF_ONLY, icon: UserCircle, keywords: ['payslip', 'leave', 'me'] },
      { label: 'To Do', path: '/todo', perm: ROUTE_PERMISSIONS['/todo'], icon: ListTodo, keywords: ['tasks'] },
      { label: 'Inbox', path: '/orders/inbox', perm: ROUTE_PERMISSIONS['/orders/inbox'], icon: Inbox, keywords: ['orders', 'bookings', 'new'] },
      { label: 'Active', path: '/orders/active', perm: ROUTE_PERMISSIONS['/orders/active'], icon: Car, keywords: ['orders', 'rentals', 'returns'] },
      { label: 'Completed', path: '/orders/completed', perm: ROUTE_PERMISSIONS['/orders/completed'], icon: CheckSquare, keywords: ['orders', 'history'] },
      { label: 'Invoices', path: '/invoices', perm: ROUTE_PERMISSIONS['/invoices'], icon: FileText },
      { label: 'Transfers', path: '/transfers', perm: ROUTE_PERMISSIONS['/transfers'], icon: Plane, keywords: ['airport', 'van', 'driver'] },
    ],
  },
  {
    label: 'Fleet',
    items: [
      {
        label: 'Fleet',
        path: '/fleet',
        perm: ROUTE_PERMISSIONS['/fleet'],
        icon: ParkingSquare,
        keywords: ['vehicles', 'asset register', 'depreciation', 'utilization'],
      },
      { label: 'Maintenance', path: '/maintenance', perm: ROUTE_PERMISSIONS['/maintenance'], icon: Wrench, keywords: ['repairs', 'service'] },
      {
        label: 'Incidents',
        path: '/fleet/accidents',
        perm: ROUTE_PERMISSIONS['/fleet/accidents'],
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
        perm: ROUTE_PERMISSIONS['/accounts'],
        icon: DollarSign,
        match: ['/accounts', '/journal'],
        keywords: ['journal entry', 'ledger', 'balances', 'reconcile'],
      },
      { label: 'Budget', path: '/budget', perm: ROUTE_PERMISSIONS['/budget'], icon: BarChart2 },
      { label: 'Card Settlements', path: '/card-settlements', perm: ROUTE_PERMISSIONS['/card-settlements'], icon: CreditCard },
      { label: 'Cash Up', path: '/cashup', perm: ROUTE_PERMISSIONS['/cashup'], icon: Calculator, keywords: ['close', 'till'] },
      { label: 'Expenses', path: '/expenses', perm: ROUTE_PERMISSIONS['/expenses'], icon: Receipt },
      { label: 'Misc Sales', path: '/misc-sales', perm: ROUTE_PERMISSIONS['/misc-sales'], icon: ShoppingBag },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'Employees', path: '/hr/employees', perm: ROUTE_PERMISSIONS['/hr/employees'], icon: Users, keywords: ['staff'] },
      { label: 'Rota', path: '/hr/rota', perm: ROUTE_PERMISSIONS['/hr/rota'], icon: CalendarDays, keywords: ['schedule', 'shifts', 'day off', 'roster'] },
      { label: 'Timesheets', path: '/hr/timesheets', perm: ROUTE_PERMISSIONS['/hr/timesheets'], icon: Clock },
      { label: 'Payroll', path: '/hr/payroll', perm: ROUTE_PERMISSIONS['/hr/payroll'], icon: Wallet, keywords: ['payslips', 'salary'] },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Customers', path: '/customers', perm: ROUTE_PERMISSIONS['/customers'], icon: UserSearch },
      { label: 'Partners', path: '/partners', perm: ROUTE_PERMISSIONS['/partners'], icon: Hotel, keywords: ['utilization', 'affiliates', 'accommodation', 'commission'] },
      { label: 'Contracts', path: '/contracts', perm: ROUTE_PERMISSIONS['/contracts'], icon: FileSignature },
      { label: 'Analytics', path: '/analytics', perm: ROUTE_PERMISSIONS['/analytics'], icon: LineChart, keywords: ['reports'] },
      { label: 'Impact Articles', path: '/impact', perm: ROUTE_PERMISSIONS['/impact'], icon: Heart, keywords: ['charity', 'blog'] },
      { label: 'Merchandise', path: '/merchandise', perm: ROUTE_PERMISSIONS['/merchandise'], icon: Package },
      { label: 'Directory', path: '/directory', perm: ROUTE_PERMISSIONS['/directory'], icon: BookOpen, keywords: ['contacts'] },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  label: 'Settings',
  path: '/settings',
  perm: ROUTE_PERMISSIONS['/settings'],
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
