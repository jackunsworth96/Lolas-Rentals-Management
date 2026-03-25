import { useTaskEvents, type TaskEvent } from '../../api/todo.js';

const EVENT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  created:      { label: 'Task created',       icon: '➕', color: 'bg-blue-500' },
  acknowledged: { label: 'Acknowledged',        icon: '✓',  color: 'bg-blue-500' },
  started:      { label: 'Started working',     icon: '▶',  color: 'bg-yellow-500' },
  submitted:    { label: 'Submitted for review', icon: '📤', color: 'bg-purple-500' },
  verified:     { label: 'Verified & closed',   icon: '✅', color: 'bg-green-500' },
  rejected:     { label: 'Rejected',            icon: '✗',  color: 'bg-red-500' },
  escalated:    { label: 'Escalated',           icon: '🔺', color: 'bg-red-600' },
  commented:    { label: 'Comment added',       icon: '💬', color: 'bg-gray-400' },
  reassigned:   { label: 'Reassigned',          icon: '↻',  color: 'bg-orange-500' },
  updated:      { label: 'Task updated',        icon: '✎',  color: 'bg-gray-400' },
};

interface EventTimelineProps {
  taskId: string;
}

export function EventTimeline({ taskId }: EventTimelineProps) {
  const { data: events = [], isLoading } = useTaskEvents(taskId);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading timeline...</div>;
  }

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">No events recorded</p>;
  }

  return (
    <div className="relative">
      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />

      <ul className="space-y-4">
        {events.map((ev) => (
          <TimelineItem key={ev.id} event={ev} />
        ))}
      </ul>
    </div>
  );
}

function TimelineItem({ event }: { event: TaskEvent }) {
  const cfg = EVENT_CONFIG[event.eventType] ?? {
    label: event.eventType,
    icon: '•',
    color: 'bg-gray-400',
  };

  const time = new Date(event.createdAt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <li className="relative flex gap-3 pl-8">
      <span
        className={`absolute left-1 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white ${cfg.color}`}
      >
        {cfg.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
          <time className="shrink-0 text-[11px] text-gray-400">{time}</time>
        </div>
        {event.actorName && (
          <p className="text-xs text-gray-500">by {event.actorName}</p>
        )}
        {event.detail && (
          <p className="mt-0.5 text-xs text-gray-600 italic whitespace-pre-wrap">
            {event.detail}
          </p>
        )}
      </div>
    </li>
  );
}
