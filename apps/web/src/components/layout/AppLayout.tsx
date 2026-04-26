import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { TaskBanners } from './TaskBanners.js';
import { MidayLostOpportunityBanner } from './MidayLostOpportunityBanner.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useTaskRealtime } from '../../hooks/useTaskRealtime.js';

export function AppLayout() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const selectedStoreId = useUIStore((s) => s.selectedStoreId);
  const employeeId = useAuthStore((s) => s.user?.employeeId);

  useTaskRealtime(employeeId);

  return (
    <div className="flex h-screen w-full min-w-0 overflow-hidden bg-gray-50">
      <MidayLostOpportunityBanner storeId={selectedStoreId ?? ''} />
      <Sidebar />
      {/*
        min-w-0: flex item default is min-width:auto (content size) — without this,
        wide tables/headers force the main column past the viewport. Individual pages
        use overflow-x-auto on their own scroll containers (e.g. Table component).
      */}
      <div
        className={`flex min-w-0 flex-1 flex-col transition-all ${
          sidebarOpen ? 'ml-52' : 'ml-0 md:ml-16'
        }`}
      >
        <Header />
        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
      <TaskBanners />
    </div>
  );
}
