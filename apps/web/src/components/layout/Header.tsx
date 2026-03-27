import { useAuthStore } from '../../stores/auth-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { StoreFilter } from './StoreFilter.js';

export function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <button onClick={toggleSidebar} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Toggle sidebar">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <StoreFilter />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{user?.username ?? user?.employeeId}</span>
        <button onClick={logout} className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
          Log out
        </button>
      </div>
    </header>
  );
}
