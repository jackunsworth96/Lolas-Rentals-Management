import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store.js';

export interface PageTab {
  label: string;
  to: string;
  perm?: string;
}

export const FLEET_TABS: PageTab[] = [
  { label: 'Vehicles', to: '/fleet' },
  { label: 'Asset Register', to: '/fleet/asset-register', perm: 'can_view_accounts' },
];

export const INCIDENT_TABS: PageTab[] = [
  { label: 'Accidents', to: '/fleet/accidents' },
  { label: 'Breakdowns', to: '/fleet/breakdowns' },
];

export function PageTabs({ tabs, className = 'mb-4' }: { tabs: PageTab[]; className?: string }) {
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  const visible = tabs.filter((t) => !t.perm || perms.includes(t.perm));
  if (visible.length < 2) return null;

  return (
    <nav className={`flex gap-1 overflow-x-auto border-b border-gray-200 ${className}`} aria-label="Page sections">
      {visible.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) =>
            `-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
