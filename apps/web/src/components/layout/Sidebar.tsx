import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  Car,
  CheckSquare,
  Plane,
  AlertCircle,
  Wrench,
  ParkingSquare,
  DollarSign,
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
  AlertTriangle,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useUnseenTaskCount } from '../../api/todo.js';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import bassLogo from '../../assets/BASS Logo .svg';
import combinedLogo from '../../assets/Lola.BASS.Logo.svg';

interface NavItem {
  label: string;
  path: string;
  perm: string | null;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', path: '/dashboard', perm: null, icon: LayoutDashboard },
      { label: 'Inbox', path: '/orders/inbox', perm: 'can_view_inbox', icon: Inbox },
      { label: 'Active', path: '/orders/active', perm: 'can_view_active', icon: Car },
      { label: 'Completed', path: '/orders/completed', perm: 'can_view_completed', icon: CheckSquare },
      { label: 'Transfers', path: '/transfers', perm: 'can_view_transfers', icon: Plane },
      { label: 'To Do', path: '/todo', perm: 'can_view_todo', icon: ListTodo },
      { label: 'Lost Opportunity', path: '/lost-opportunity', perm: 'can_view_lostopportunity', icon: AlertCircle },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { label: 'Fleet', path: '/fleet', perm: 'can_view_fleet', icon: ParkingSquare },
      { label: 'Maintenance', path: '/maintenance', perm: 'can_view_maintenance', icon: Wrench },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Accounts', path: '/accounts', perm: 'can_view_accounts', icon: DollarSign },
      { label: 'Card Settlements', path: '/card-settlements', perm: 'can_view_cardsettlements', icon: CreditCard },
      { label: 'Cash Up', path: '/cashup', perm: 'can_view_cashup', icon: Calculator },
      { label: 'Expenses', path: '/expenses', perm: 'can_view_expenses', icon: Receipt },
      { label: 'Misc Sales', path: '/misc-sales', perm: 'can_view_miscsales', icon: ShoppingBag },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'Employees', path: '/hr/employees', perm: 'can_manage_employees', icon: Users },
      { label: 'Timesheets', path: '/hr/timesheets', perm: 'can_view_timesheets', icon: Clock },
      { label: 'Payroll', path: '/hr/payroll', perm: 'can_view_payroll', icon: Wallet },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Merchandise', path: '/merchandise', perm: 'can_view_miscsales', icon: Package },
      { label: 'Directory', path: '/directory', perm: null, icon: BookOpen },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'UI Errors', path: '/ui-errors', perm: 'can_view_uierrors', icon: AlertTriangle },
      { label: 'Settings', path: '/settings', perm: null, icon: Settings },
    ],
  },
];

export function Sidebar() {
  const open = useUIStore((s) => s.sidebarOpen);
  const selectedStoreId = useUIStore((s) => s.selectedStoreId);
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  const employeeId = useAuthStore((s) => s.user?.employeeId) ?? '';
  const { data: unseenData } = useUnseenTaskCount(employeeId);
  const todoCount = (unseenData as { count?: number } | undefined)?.count ?? 0;

  const logo =
    selectedStoreId === 'store-bass' ? bassLogo :
    selectedStoreId === 'store-lolas' ? lolasLogo :
    combinedLogo;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-gray-200 bg-white transition-all ${
        open ? 'w-64' : 'w-16'
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-gray-100 px-4">
        {open ? (
          <img src={logo} alt="Store logo" className="h-10 w-auto object-contain" />
        ) : (
          <img src={logo} alt="Store logo" className="h-8 w-8 object-contain" />
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group, groupIdx) => {
          const visibleItems = group.items.filter(
            (item) => !item.perm || perms.includes(item.perm),
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              {groupIdx > 0 && <div className="mx-3 my-1 h-px bg-gray-100" />}

              {open && (
                <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {group.label}
                </p>
              )}

              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={!open ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {open && <span>{item.label}</span>}
                  {open && item.label === 'To Do' && todoCount > 0 && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {todoCount > 99 ? '99+' : todoCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
