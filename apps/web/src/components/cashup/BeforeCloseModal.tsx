import { useState, useMemo } from 'react';
import { useLateReturnsCheck, useUpsertLateReturnAssignment } from '../../api/cashup.js';
import { useEmployees, type EmployeeRow } from '../../api/hr.js';
import { useTasks, useCloseTask, type TaskRow } from '../../api/todo.js';

interface Props {
  storeId: string;
  date: string;
  onProceed: () => void;
  onCancel: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-gray-100 text-gray-600',
};

function CheckBadge({ done }: { done: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done
          ? 'bg-green-500 text-white'
          : 'border-2 border-gray-300 text-transparent'
      }`}
    >
      ✓
    </span>
  );
}

function SectionHeader({
  step,
  title,
  done,
}: {
  step: string;
  title: string;
  done: boolean;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <CheckBadge done={done} />
      <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
        {step}
      </span>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    </div>
  );
}

export function BeforeCloseModal({ storeId, date, onProceed, onCancel }: Props) {
  /* ─────────────────────────────── Section 1: Late Returns ─────────────────────────────── */
  const { data: lateReturnsCheck, isLoading: lateCheckLoading } = useLateReturnsCheck(storeId, date);
  const hasLateReturns = lateReturnsCheck?.hasLateReturns ?? false;

  const { data: employees = [] } = useEmployees(storeId) as { data: EmployeeRow[] | undefined };
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'Active'),
    [employees],
  );

  const [lateEmployeeId, setLateEmployeeId] = useState('');
  const [lateNote, setLateNote] = useState('');
  const [lateSaved, setLateSaved] = useState(false);

  const upsertLateReturn = useUpsertLateReturnAssignment();

  const lateAcked = !hasLateReturns || (!!lateEmployeeId && lateSaved);

  function handleSaveLateReturn() {
    if (!lateEmployeeId) return;
    upsertLateReturn.mutate(
      { storeId, date, employeeId: lateEmployeeId, note: lateNote.trim() || undefined },
      { onSuccess: () => setLateSaved(true) },
    );
  }

  /* ─────────────────────────────── Section 2: Open Tasks ───────────────────────────────── */
  const { data: allTasks = [] } = useTasks(storeId, {}) as { data: TaskRow[] | undefined };

  const openTodayTasks = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          t.dueDate === date &&
          t.status !== 'Pending Verification' &&
          t.status !== 'Closed',
      ),
    [allTasks, date],
  );

  const [acknowledgedTasks, setAcknowledgedTasks] = useState(false);
  const [closedTaskIds, setClosedTaskIds] = useState<Set<string>>(new Set());
  const closeTask = useCloseTask();

  const allTasksDone =
    openTodayTasks.length === 0 ||
    openTodayTasks.every((t) => closedTaskIds.has(t.id)) ||
    acknowledgedTasks;

  function handleCloseTask(id: string) {
    closeTask.mutate(id, {
      onSuccess: () =>
        setClosedTaskIds((prev) => new Set(prev).add(id)),
    });
  }

  /* ─────────────────────────────── Overall gate ────────────────────────────────────────── */
  const allAcked = lateAcked && allTasksDone;

  if (lateCheckLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-xl bg-white p-10 shadow-xl">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Before You Close</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Complete both sections before proceeding to cash up.
          </p>
        </div>

        <div className="divide-y divide-gray-100 px-6">
          {/* ─── Section 1 ─── */}
          <div className="py-5">
            <SectionHeader step="1" title="Late Returns" done={lateAcked} />
            {hasLateReturns ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  There {lateReturnsCheck!.count === 1 ? 'is' : 'are'}{' '}
                  <strong>{lateReturnsCheck!.count}</strong> late return
                  {lateReturnsCheck!.count !== 1 ? 's' : ''} tonight (after 8 PM).
                  Who is handling it?
                </p>
                <div className="flex gap-2">
                  <select
                    value={lateEmployeeId}
                    onChange={(e) => {
                      setLateEmployeeId(e.target.value);
                      setLateSaved(false);
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select employee…</option>
                    {activeEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={lateNote}
                  onChange={(e) => {
                    setLateNote(e.target.value);
                    setLateSaved(false);
                  }}
                  placeholder="Notes, e.g. arranged for 9:30 PM (optional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {lateSaved ? (
                  <p className="text-sm font-medium text-green-600">✓ Assignment saved</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveLateReturn}
                    disabled={!lateEmployeeId || upsertLateReturn.isPending}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {upsertLateReturn.isPending ? 'Saving…' : 'Save Assignment'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No late returns tonight ✓</p>
            )}
          </div>

          {/* ─── Section 2 ─── */}
          <div className="py-5">
            <SectionHeader step="2" title="Open Tasks" done={allTasksDone} />
            {openTodayTasks.length === 0 ? (
              <p className="text-sm text-gray-400">All tasks complete ✓</p>
            ) : (
              <div className="space-y-3">
                <ul className="space-y-2">
                  {openTodayTasks.map((task) => {
                    const isDone = closedTaskIds.has(task.id);
                    return (
                      <li
                        key={task.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                          isDone
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate font-medium ${
                              isDone ? 'text-green-700 line-through' : 'text-gray-900'
                            }`}
                          >
                            {task.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {task.assignedToName ?? 'Unassigned'}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {task.priority}
                        </span>
                        {isDone ? (
                          <span className="shrink-0 text-xs font-medium text-green-600">✓</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCloseTask(task.id)}
                            disabled={closeTask.isPending}
                            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Mark complete
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {!openTodayTasks.every((t) => closedTaskIds.has(t.id)) &&
                  !acknowledgedTasks && (
                    <button
                      type="button"
                      onClick={() => setAcknowledgedTasks(true)}
                      className="text-sm text-gray-500 underline"
                    >
                      Acknowledge outstanding tasks and proceed
                    </button>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onProceed}
            disabled={!allAcked}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Proceed to Cash Up →
          </button>
        </div>
      </div>
    </div>
  );
}
