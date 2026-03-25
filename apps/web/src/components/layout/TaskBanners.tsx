import { useTaskNotificationStore } from '../../stores/task-notification-store.js';

const TYPE_COLORS: Record<string, string> = {
  assigned: 'bg-blue-600',
  rejected: 'bg-red-600',
  escalated: 'bg-red-700',
  overdue: 'bg-orange-600',
  comment: 'bg-gray-700',
};

export function TaskBanners() {
  const banners = useTaskNotificationStore((s) => s.banners);
  const dismiss = useTaskNotificationStore((s) => s.dismissBanner);

  if (banners.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2 sm:right-6 sm:top-6">
      {banners.map((b) => (
        <div
          key={b.id}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${TYPE_COLORS[b.type] ?? 'bg-gray-700'}`}
          role="alert"
        >
          <span className="flex-1">{b.message}</span>
          <button
            onClick={() => dismiss(b.id)}
            className="shrink-0 rounded p-0.5 hover:bg-white/20"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
