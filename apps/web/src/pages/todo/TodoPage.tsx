import { useState, useMemo } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useTasks, type TaskRow, type TaskFilters } from '../../api/todo.js';
import { Button } from '../../components/common/Button.js';
import { Select } from '../../components/common/Select.js';
import { TaskCard } from './TaskCard.js';
import { CreateTaskModal } from './CreateTaskModal.js';
import { TaskDetailSheet } from './TaskDetailSheet.js';
import { ReportTab } from './ReportTab.js';

type Tab = 'mine' | 'all' | 'report';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'Created', label: 'Created' },
  { value: 'Acknowledged', label: 'Acknowledged' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Pending Verification', label: 'Pending Verification' },
  { value: 'Closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'Urgent', label: 'Urgent' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
];

export default function TodoPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const employeeId = useAuthStore((s) => s.user?.employeeId) ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isManager = hasPermission('can_manage_todo');

  const [tab, setTab] = useState<Tab>('mine');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filters: TaskFilters = {};
  if (statusFilter) filters.status = statusFilter;
  if (priorityFilter) filters.priority = priorityFilter;
  if (tab === 'mine') filters.assignedTo = employeeId;

  const { data: tasks = [], isLoading } = useTasks(storeId, filters);

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.assignedToName?.toLowerCase().includes(q) ||
        t.categoryName?.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const openCount = useMemo(
    () => tasks.filter((t) => t.status !== 'Closed').length,
    [tasks],
  );

  const activeFiltersCount =
    (statusFilter ? 1 : 0) + (priorityFilter ? 1 : 0);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">{openCount} open</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          + New Task
        </Button>
      </div>

      {/* Tab bar */}
      <div className="mt-4 flex rounded-lg bg-gray-100 p-1">
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
          My Tasks
        </TabButton>
        {isManager && (
          <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
            All Tasks
          </TabButton>
        )}
        {isManager && (
          <TabButton active={tab === 'report'} onClick={() => setTab('report')}>
            Report
          </TabButton>
        )}
      </div>

      {/* Report tab */}
      {tab === 'report' && <div className="mt-4"><ReportTab /></div>}

      {/* Task list tabs */}
      {tab !== 'report' && (
        <>
          {/* Search + filter toggle */}
          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`relative rounded-lg border px-3 py-2 text-sm transition-colors ${
                showFilters || activeFiltersCount > 0
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {activeFiltersCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Collapsible filter bar */}
          {showFilters && (
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <Select
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                placeholder="All Statuses"
              />
              <Select
                options={PRIORITY_OPTIONS}
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                placeholder="All Priorities"
              />
              {(statusFilter || priorityFilter) && (
                <button
                  type="button"
                  className="col-span-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                  onClick={() => { setStatusFilter(''); setPriorityFilter(''); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Task list */}
          <div className="mt-4 space-y-3 pb-20">
            {isLoading ? (
              <div className="py-12 text-center text-gray-400">Loading tasks...</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-400">
                  {search ? 'No tasks match your search' : 'No tasks yet'}
                </p>
                {!search && (
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowCreate(true)}>
                    Create one
                  </Button>
                )}
              </div>
            ) : (
              filtered.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onClick={() => setSelectedTaskId(t.id)}
                  showAssignee={tab === 'all'}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        storeId={storeId}
        defaultAssignee={employeeId}
      />

      {selectedTaskId && (
        <TaskDetailSheet
          taskId={selectedTaskId}
          employeeId={employeeId}
          isManager={isManager}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
