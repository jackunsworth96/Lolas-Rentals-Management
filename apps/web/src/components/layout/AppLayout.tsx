import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { TaskBanners } from './TaskBanners.js';
import { MidayLostOpportunityBanner } from './MidayLostOpportunityBanner.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useTaskRealtime } from '../../hooks/useTaskRealtime.js';
import { isArchivePath } from '../../utils/archive-mode.js';

export function AppLayout() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const selectedStoreId = useUIStore((s) => s.selectedStoreId);
  const employeeId = useAuthStore((s) => s.user?.employeeId);
  const archiveMode = useUIStore((s) => s.archiveMode);
  const archivedStoreName = useUIStore((s) => s.archivedStoreName);
  const exitArchiveMode = useUIStore((s) => s.exitArchiveMode);
  const location = useLocation();
  const navigate = useNavigate();

  useTaskRealtime(employeeId);

  useEffect(() => {
    if (archiveMode && !isArchivePath(location.pathname)) navigate('/orders/completed', { replace: true });
  }, [archiveMode, location.pathname, navigate]);

  return (
    <div className="flex h-screen w-full min-w-0 overflow-hidden bg-gray-50">
      {!archiveMode && <MidayLostOpportunityBanner storeId={selectedStoreId ?? ''} />}
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
        {archiveMode && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950 sm:px-6" role="status">
            <span><strong>Archived: {archivedStoreName ?? 'Store'}</strong> — read-only historical workspace</span>
            <button
              type="button"
              data-archive-allowed
              onClick={() => { exitArchiveMode(); navigate('/dashboard'); }}
              className="shrink-0 rounded-md border border-amber-500 bg-white px-3 py-1 font-medium hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-600"
            >
              Exit archive
            </button>
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
      <TaskBanners />
    </div>
  );
}
