import { NavLink } from 'react-router-dom';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useUnseenTaskCount } from '../../api/todo.js';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', perm: null },
  { label: 'Inbox', path: '/orders/inbox', perm: 'can_view_inbox' },
  { label: 'Active', path: '/orders/active', perm: 'can_view_active' },
  { label: 'Completed', path: '/orders/completed', perm: 'can_view_completed' },
  { label: 'Fleet', path: '/fleet', perm: 'can_view_fleet' },
  { label: 'Maintenance', path: '/maintenance', perm: 'can_view_maintenance' },
  { label: 'Transfers', path: '/transfers', perm: 'can_view_transfers' },
  { label: 'Accounts', path: '/accounts', perm: 'can_view_accounts' },
  { label: 'Card Settlements', path: '/card-settlements', perm: 'can_view_cardsettlements' },
  { label: 'Cash Up', path: '/cashup', perm: 'can_view_cashup' },
  { label: 'Employees', path: '/hr/employees', perm: 'can_view_timesheets' },
  { label: 'Timesheets', path: '/hr/timesheets', perm: 'can_view_timesheets' },
  { label: 'Payroll', path: '/hr/payroll', perm: 'can_view_payroll' },
  { label: 'Expenses', path: '/expenses', perm: 'can_view_expenses' },
  { label: 'To Do', path: '/todo', perm: 'can_view_todo' },
  { label: 'Misc Sales', path: '/misc-sales', perm: 'can_view_miscsales' },
  { label: 'Merchandise', path: '/merchandise', perm: 'can_view_miscsales' },
  { label: 'Lost Opportunity', path: '/lost-opportunity', perm: 'can_view_lostopportunity' },
  { label: 'UI Errors', path: '/ui-errors', perm: 'can_view_uierrors' },
  { label: 'Settings', path: '/settings', perm: null },
];

export function Sidebar() {
  const open = useUIStore((s) => s.sidebarOpen);
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  const employeeId = useAuthStore((s) => s.user?.employeeId) ?? '';
  const { data: unseenData } = useUnseenTaskCount(employeeId);
  const todoCount = (unseenData as { count?: number } | undefined)?.count ?? 0;

  const visible = NAV_ITEMS.filter((item) => !item.perm || perms.includes(item.perm));

  return (
    <aside className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-gray-200 bg-white transition-all ${open ? 'w-64' : 'w-16'}`}>
      <div className="flex h-16 items-center justify-center border-b border-gray-200 px-4">
        <span className={`font-bold text-blue-600 ${open ? 'text-lg' : 'text-xs'}`}>
          {open ? "Lola's Rentals" : 'LR'}
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        {visible.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${isActive ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`
            }
          >
            <span className={open ? '' : 'sr-only'}>{item.label}</span>
            {item.path === '/todo' && todoCount > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {todoCount > 99 ? '99+' : todoCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
