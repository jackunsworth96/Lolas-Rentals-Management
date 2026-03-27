import { Badge } from '../../components/common/Badge.js';
import { Button } from '../../components/common/Button.js';
import {
  useTask,
  useAcknowledgeTask,
  useStartTask,
  useSubmitTask,
  useVerifyTask,
  useRejectTask,
  useEscalateTask,
  useUpdateTask,
} from '../../api/todo.js';
import { useState } from 'react';
import { CommentThread } from './CommentThread.js';
import { EventTimeline } from './EventTimeline.js';
import { useConfigEmployees, useTaskCategories } from '../../api/config.js';

const STATUS_COLOR = {
  Created: 'gray',
  Acknowledged: 'blue',
  'In Progress': 'yellow',
  'Pending Verification': 'purple',
  Closed: 'green',
} as const;

const PRIORITY_COLOR = {
  Urgent: 'red',
  High: 'yellow',
  Medium: 'blue',
  Low: 'gray',
} as const;

type SheetTab = 'details' | 'comments' | 'timeline';

interface TaskDetailSheetProps {
  taskId: string;
  employeeId: string;
  isManager: boolean;
  onClose: () => void;
}

export function TaskDetailSheet({ taskId, employeeId, isManager, onClose }: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTask(taskId);
  const acknowledge = useAcknowledgeTask();
  const start = useStartTask();
  const submit = useSubmitTask();
  const verify = useVerifyTask();
  const reject = useRejectTask();
  const escalate = useEscalateTask();

  const updateTask = useUpdateTask();
  const { data: employees = [] } = useConfigEmployees();
  const { data: categories = [] } = useTaskCategories();

  const [activeTab, setActiveTab] = useState<SheetTab>('details');
  const [rejectReason, setRejectReason] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <Sheet onClose={onClose}>
        <div className="flex min-h-0 flex-1 items-center justify-center text-gray-400">Loading...</div>
      </Sheet>
    );
  }

  if (!task) {
    return (
      <Sheet onClose={onClose}>
        <div className="flex min-h-0 flex-1 items-center justify-center text-gray-400">Task not found</div>
      </Sheet>
    );
  }

  const isAssignee = task.assignedTo === employeeId;

  const handleAction = (
    fn: { mutate: (arg: string, opts?: { onSuccess?: () => void }) => void },
    id: string,
  ) => {
    fn.mutate(id);
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    reject.mutate(
      { id: task.id, reason: rejectReason.trim() },
      { onSuccess: () => { setRejectReason(''); setShowReject(false); } },
    );
  };

  const handleEscalate = () => {
    if (!escalateReason.trim()) return;
    escalate.mutate(
      { id: task.id, reason: escalateReason.trim() },
      { onSuccess: () => { setEscalateReason(''); setShowEscalate(false); } },
    );
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header — fixed above scroll */}
        <div className="shrink-0 border-b border-gray-100 pb-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-900">{task.title}</h2>
            <Badge color={PRIORITY_COLOR[task.priority] ?? 'gray'}>{task.priority}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge color={STATUS_COLOR[task.status] ?? 'gray'}>{task.status}</Badge>
            {task.isEscalated && (
              <Badge color="red">
                Escalated{task.escalationCount > 1 ? ` ×${task.escalationCount}` : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Tab bar — fixed */}
        <div className="shrink-0 py-3">
          <div className="flex rounded-lg bg-gray-100 p-1">
            {(['details', 'comments', 'timeline'] as SheetTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  activeTab === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content — scrolls inside fixed-height shell */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {activeTab === 'details' && !editing && (
          <div className="space-y-5">
            {task.description && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Detail label="Assigned To" value={task.assignedToName ?? '—'} />
              <Detail label="Assigned By" value={task.assignedByName ?? '—'} />
              <Detail label="Category" value={task.categoryName ?? '—'} />
              <Detail
                label="Due Date"
                value={task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
              />
              <Detail label="Created" value={new Date(task.dateCreated).toLocaleDateString()} />
              {task.dateCompleted && (
                <Detail
                  label="Completed"
                  value={new Date(task.dateCompleted).toLocaleDateString()}
                />
              )}
            </dl>

            {(isManager || isAssignee) && task.status !== 'Closed' && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setEditForm({
                    title: task.title,
                    description: task.description ?? '',
                    assignedTo: task.assignedTo,
                    categoryId: task.categoryId != null ? String(task.categoryId) : '',
                    priority: task.priority,
                    dueDate: task.dueDate ?? '',
                  });
                  setEditing(true);
                }}
              >
                Edit Task
              </Button>
            )}

            {/* Staff actions */}
            {isAssignee && task.status !== 'Closed' && (
              <div className="space-y-2">
                {task.status === 'Created' && (
                  <Button
                    className="w-full"
                    onClick={() => handleAction(acknowledge, task.id)}
                    loading={acknowledge.isPending}
                  >
                    Acknowledge Task
                  </Button>
                )}
                {task.status === 'Acknowledged' && (
                  <Button
                    className="w-full"
                    onClick={() => handleAction(start, task.id)}
                    loading={start.isPending}
                  >
                    Start Working
                  </Button>
                )}
                {task.status === 'In Progress' && (
                  <Button
                    className="w-full"
                    onClick={() => handleAction(submit, task.id)}
                    loading={submit.isPending}
                  >
                    Mark as Done
                  </Button>
                )}
              </div>
            )}

            {/* Manager actions */}
            {isManager && task.status !== 'Closed' && (
              <div className="space-y-2">
                {task.status === 'Pending Verification' && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => handleAction(verify, task.id)}
                      loading={verify.isPending}
                    >
                      Verify & Close
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={() => setShowReject(true)}
                    >
                      Reject
                    </Button>
                  </div>
                )}

                {!showEscalate && task.status !== 'Pending Verification' && (
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowEscalate(true)}
                  >
                    Escalate
                  </Button>
                )}

                {showEscalate && (
                  <ReasonForm
                    label="Escalation Reason"
                    value={escalateReason}
                    onChange={setEscalateReason}
                    onConfirm={handleEscalate}
                    onCancel={() => { setShowEscalate(false); setEscalateReason(''); }}
                    loading={escalate.isPending}
                    confirmLabel="Confirm Escalate"
                  />
                )}
              </div>
            )}

            {showReject && (
              <ReasonForm
                label="Rejection Reason"
                value={rejectReason}
                onChange={setRejectReason}
                onConfirm={handleReject}
                onCancel={() => { setShowReject(false); setRejectReason(''); }}
                loading={reject.isPending}
                confirmLabel="Confirm Rejection"
              />
            )}
          </div>
        )}

        {activeTab === 'details' && editing && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
              <input
                value={editForm.title ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
              <textarea
                rows={3}
                value={editForm.description ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Assigned To</label>
                <select
                  value={editForm.assignedTo ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {(employees as Array<{ id: string; fullName?: string; full_name?: string }>).map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName ?? emp.full_name ?? emp.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
                <select
                  value={editForm.categoryId ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {(categories as Array<{ id: number; name: string }>).map((cat) => (
                    <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Priority</label>
                <select
                  value={editForm.priority ?? 'Medium'}
                  onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {['Low', 'Medium', 'High', 'Urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Due Date</label>
                <input
                  type="date"
                  value={editForm.dueDate ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {updateTask.isError && (
              <p className="text-sm text-red-600">Failed to update task.</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                loading={updateTask.isPending}
                onClick={() => {
                  updateTask.mutate(
                    {
                      id: task.id,
                      title: editForm.title?.trim() || undefined,
                      description: editForm.description?.trim() || null,
                      assignedTo: editForm.assignedTo || undefined,
                      categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,
                      priority: editForm.priority || undefined,
                      dueDate: editForm.dueDate || null,
                    },
                    { onSuccess: () => setEditing(false) },
                  );
                }}
              >
                Save Changes
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <CommentThread
            taskId={taskId}
            employeeId={employeeId}
            isClosed={task.status === 'Closed'}
          />
        )}

        {activeTab === 'timeline' && <EventTimeline taskId={taskId} />}
        </div>
      </div>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-700">{value}</dd>
    </div>
  );
}

function ReasonForm({
  label,
  value,
  onChange,
  onConfirm,
  onCancel,
  loading,
  confirmLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  confirmLabel: string;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
      <label className="block text-sm font-medium text-red-800">{label} *</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        placeholder={`Why is this being ${label.toLowerCase().replace(' reason', '')}?`}
      />
      <div className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          className="flex-1"
          onClick={onConfirm}
          loading={loading}
          disabled={!value.trim()}
        >
          {confirmLabel}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-[min(85vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-end border-b border-gray-100 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}
