import { useEffect, useRef } from 'react';
import {
  useDeliveryReminders,
  useAcknowledgeDeliveryReminder,
  type DeliveryReminderEvent,
} from '../../api/delivery-reminders.js';
import { useAuthStore } from '../../stores/auth-store.js';

function minutesUntil(datetime: string): number {
  return Math.round((new Date(datetime).getTime() - Date.now()) / 60_000);
}

function formatTime(datetime: string): string {
  return new Date(datetime).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EventRow({
  event,
  onAcknowledge,
  isPending,
}: {
  event: DeliveryReminderEvent;
  onAcknowledge: () => void;
  isPending: boolean;
}) {
  const mins = minutesUntil(event.eventDatetime);
  const isOverdue = mins < 0;
  const isDelivery = event.eventType === 'pickup';

  const badgeClass = isDelivery
    ? 'bg-blue-100 text-blue-800'
    : 'bg-purple-100 text-purple-800';

  const badgeLabel = isDelivery ? 'DELIVERY OUT' : 'COLLECTION';

  const timeLabel = isOverdue
    ? `${Math.abs(mins)} min overdue`
    : mins === 0
      ? 'NOW'
      : `in ${mins} min`;

  const timeLabelClass = isOverdue
    ? 'text-red-600 font-bold'
    : mins <= 10
      ? 'text-orange-600 font-semibold'
      : 'text-gray-700';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Badge + time */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
              {badgeLabel}
            </span>
            <span className={`text-sm ${timeLabelClass}`}>
              {formatTime(event.eventDatetime)} — {timeLabel}
            </span>
          </div>

          {/* Vehicle */}
          {event.vehicleName && (
            <p className="text-sm font-medium text-gray-900">
              🏍️ {event.vehicleName}
            </p>
          )}

          {/* Location */}
          {event.locationName && (
            <p className="text-sm text-gray-700">
              📍{' '}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-600"
              >
                {event.locationName}
              </a>
            </p>
          )}

          {/* Customer */}
          {event.customerName && (
            <p className="text-sm text-gray-700">
              👤 {event.customerName}
              {event.customerMobile && (
                <>
                  {' · '}
                  <a
                    href={`tel:${event.customerMobile}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {event.customerMobile}
                  </a>
                </>
              )}
            </p>
          )}

          {/* Notes */}
          {event.notes && (
            <p className="text-xs italic text-gray-500">📝 {event.notes}</p>
          )}

          {/* Booking ref */}
          {event.bookingToken && (
            <p className="text-xs text-gray-400">Ref: {event.bookingToken}</p>
          )}
        </div>

        {/* Acknowledge button */}
        <button
          onClick={onAcknowledge}
          disabled={isPending}
          className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : '✓ Acknowledge'}
        </button>
      </div>
    </div>
  );
}

export function DeliveryReminderModal() {
  const isLoggedIn = useAuthStore((s) => s.token !== null);
  const { data: events = [] } = useDeliveryReminders();
  const acknowledge = useAcknowledgeDeliveryReminder();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const isOpen = isLoggedIn && events.length > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isLoggedIn) return null;

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-lg rounded-xl border-0 bg-white p-0 shadow-2xl backdrop:bg-black/60"
    >
      {/* Header — urgent red banner */}
      <div className="flex items-center gap-3 rounded-t-xl bg-red-600 px-6 py-4">
        <span className="animate-pulse text-2xl">⚠️</span>
        <div>
          <h2 className="text-lg font-bold text-white">
            Action Required — Off-Site Event{events.length > 1 ? 's' : ''}
          </h2>
          <p className="text-sm text-red-100">
            Prepare your team and acknowledge each one below.
          </p>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-3 p-5">
        {events.map((event) => (
          <EventRow
            key={`${event.orderItemId}:${event.eventType}`}
            event={event}
            onAcknowledge={() =>
              acknowledge.mutate({
                orderItemId: event.orderItemId,
                eventType: event.eventType,
              })
            }
            isPending={acknowledge.isPending}
          />
        ))}
      </div>

      {/* Footer note */}
      <div className="rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-3 text-center text-xs text-gray-500">
        This alert will close once all events are acknowledged.
      </div>
    </dialog>
  );
}
