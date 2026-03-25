import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { TaskBanners } from './TaskBanners.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useTaskRealtime } from '../../hooks/useTaskRealtime.js';

export function AppLayout() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const employeeId = useAuthStore((s) => s.user?.employeeId);

  useTaskRealtime(employeeId);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className={`flex flex-1 flex-col transition-all ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <TaskBanners />
    </div>
  );
}
