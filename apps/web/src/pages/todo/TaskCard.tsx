import { Badge } from '../../components/common/Badge.js';
import type { TaskRow } from '../../api/todo.js';

const PRIORITY_COLOR = {
  Urgent: 'red',
  High: 'yellow',
  Medium: 'blue',
  Low: 'gray',
} as const;

const STATUS_COLOR = {
  Created: 'gray',
  Acknowledged: 'blue',
  'In Progress': 'yellow',
  'Pending Verification': 'purple',
  Closed: 'green',
} as const;

function dueLabel(d: string | null): { text: string; urgent: boolean } {
  if (!d) return { text: '', urgent: false };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { text: 'Due today', urgent: true };
  if (diff === 1) return { text: 'Due tomorrow', urgent: false };
  return { text: `Due in ${diff}d`, urgent: false };
}

interface TaskCardProps {
  task: TaskRow;
  onClick: () => void;
  showAssignee?: boolean;
}

export function TaskCard({ task, onClick, showAssignee = true }: TaskCardProps) {
  const due = dueLabel(task.dueDate);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-shadow active:shadow-md ${
        task.isEscalated ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200'
      } ${task.status === 'Created' ? 'border-l-4 border-l-orange-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{task.title}</h3>
        <Badge color={PRIORITY_COLOR[task.priority] ?? 'gray'}>{task.priority}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge color={STATUS_COLOR[task.status] ?? 'gray'}>{task.status}</Badge>
        {task.isEscalated && (
          <Badge color="red">
            Escalated{task.escalationCount > 1 ? ` ×${task.escalationCount}` : ''}
          </Badge>
        )}
        {task.categoryName && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-gray-500 bg-gray-100">
            {task.categoryName}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        {showAssignee && task.assignedToName ? (
          <span className="truncate">{task.assignedToName}</span>
        ) : (
          <span />
        )}
        {due.text && (
          <span className={due.urgent ? 'font-semibold text-red-600' : ''}>
            {due.text}
          </span>
        )}
      </div>
    </button>
  );
}
