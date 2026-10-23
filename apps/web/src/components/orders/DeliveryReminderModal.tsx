import { useEffect, useRef } from 'react';
import {
  useDeliveryReminders,
  useAcknowledgeDeliveryReminder,
  reminderEventKey,
  type DeliveryReminderEvent,
  type ReminderCategory,
} from '../../api/delivery-reminders.js';
import { useAuthStore } from '../../stores/auth-store.js';

/**
 * Plays a short attention-grabbing chime using the Web Audio API — no
 * external asset needed. Best-effort only: browsers may block audio until
 * the user has interacted with the page at least once, which is fine here
 * since this just adds to the (still-shown) visual modal rather than
 * replacing it.
 *
 * `urgent` plays a louder, 3-note variant used for the periodic re-nag (see
 * REPEAT_ALERT_MS below) and for anything already overdue, so the sound
 * itself communicates escalating urgency rather than feeling identical
 * every time.
 */
function playAlertChime(urgent = false) {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = urgent ? [880, 660, 880] : [880, 660];
    const gainLevel = urgent ? 0.28 : 0.15;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = gainLevel;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + i * 0.18;
      osc.start(start);
      osc.stop(start + 0.15);
    });
  } catch {
    // Audio not available — the visual modal (and title flash) still apply.
  }
}

/**
 * Shows a system-level notification so the alert surfaces even if this tab
 * isn't focused — `requireInteraction` keeps it on screen until someone
 * dismisses it (rather than auto-vanishing after a few seconds), and the
 * shared `tag` means repeated calls refresh/re-bubble the same notification
 * instead of stacking duplicates.
 */
function notifyIfHidden(count: number) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
    return;
  }
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    new Notification('⚠️ Action required on the back office', {
      body: `${count} event${count > 1 ? 's' : ''} need acknowledgment right now.`,
      tag: 'delivery-reminder',
      requireInteraction: true,
    } as NotificationOptions);
  } catch {
    // Notifications unsupported/blocked — the audio/title-flash loop while the tab is open still applies.
  }
}

// How often to re-nag while events remain unacknowledged and the modal is
// still open. Telegram was meant to be the fallback for "nobody's watching
// the browser tab" — but on this team Telegram notifications are routinely
// missed on the work phone, so the backoffice tab itself has to be the
// primary, relentless channel: it re-sounds, re-fires the system
// notification, and flashes the tab title on a loop until someone
// acknowledges every event — not just once when it first appears.
const REPEAT_ALERT_MS = 45_000;
const TITLE_FLASH_MS = 900;

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

const CATEGORY_META: Record<ReminderCategory, { label: string; badgeClass: string; icon: string }> = {
  offsite_delivery: { label: 'DELIVERY OUT', badgeClass: 'bg-blue-100 text-blue-800', icon: '🚗' },
  offsite_collection: { label: 'COLLECTION', badgeClass: 'bg-purple-100 text-purple-800', icon: '🔁' },
  instore_pickup: { label: 'CUSTOMER ARRIVING — PICKUP', badgeClass: 'bg-green-100 text-green-800', icon: '🏬' },
  instore_return: { label: 'CUSTOMER ARRIVING — RETURN', badgeClass: 'bg-amber-100 text-amber-800', icon: '🏬' },
  airport_transfer: { label: 'AIRPORT TRANSFER', badgeClass: 'bg-sky-100 text-sky-800', icon: '✈️' },
};

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

  const { label: badgeLabel, badgeClass } = CATEGORY_META[event.category];

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
  const seenKeysRef = useRef<Set<string>>(new Set());
  const baseTitleRef = useRef<string>(typeof document !== 'undefined' ? document.title : '');

  const isOpen = isLoggedIn && events.length > 0;
  const anyOverdue = events.some((e) => minutesUntil(e.eventDatetime) < 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Alert (sound + system notification) whenever a *new* event enters the
  // list — not on every poll — so a silently-opened <dialog> can't go
  // unnoticed on a backgrounded/unfocused tab. This is the modal's biggest
  // historical gap: it previously relied entirely on someone already
  // looking at the screen, with zero acknowledgments ever recorded.
  useEffect(() => {
    if (!isLoggedIn) return;
    const currentKeys = events.map(reminderEventKey);
    const hasNew = currentKeys.some((k) => !seenKeysRef.current.has(k));
    if (hasNew && events.length > 0) {
      playAlertChime();
      notifyIfHidden(events.length);
    }
    seenKeysRef.current = new Set(currentKeys);
  }, [events, isLoggedIn]);

  // Re-nag on a loop for as long as anything remains unacknowledged. Relying
  // on Telegram as the "someone isn't watching the browser" fallback doesn't
  // hold up in practice here — Telegram notifications are routinely missed
  // on the team's work phone. So the backoffice tab has to carry the full
  // weight itself: it keeps re-sounding and re-flashing on its own, rather
  // than alerting once and going quiet.
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      playAlertChime(true);
      notifyIfHidden(events.length);
    }, REPEAT_ALERT_MS);
    return () => clearInterval(interval);
  }, [isOpen, events.length]);

  // Flash the browser tab title while anything is unacknowledged, so the
  // alert is visible even if this tab is minimized or sitting behind
  // another window — not just when the modal itself is in view.
  useEffect(() => {
    if (!isOpen) {
      document.title = baseTitleRef.current;
      return;
    }
    const alertTitle = `🚨 (${events.length}) ACTION REQUIRED`;
    let showingAlert = false;
    const interval = setInterval(() => {
      showingAlert = !showingAlert;
      document.title = showingAlert ? alertTitle : baseTitleRef.current;
    }, TITLE_FLASH_MS);
    return () => {
      clearInterval(interval);
      document.title = baseTitleRef.current;
    };
  }, [isOpen, events.length]);

  if (!isLoggedIn) return null;

  return (
    <dialog
      ref={dialogRef}
      className={`w-full max-w-lg rounded-xl border-0 bg-white p-0 shadow-2xl backdrop:bg-black/60 ${
        anyOverdue ? 'ring-4 ring-red-500' : ''
      }`}
    >
      {/* Header — urgent red banner */}
      <div className="flex items-center gap-3 rounded-t-xl bg-red-600 px-6 py-4">
        <span className="animate-pulse text-2xl">⚠️</span>
        <div>
          <h2 className="text-lg font-bold text-white">
            Action Required — {events.length} Event{events.length > 1 ? 's' : ''} Today
          </h2>
          <p className="text-sm text-red-100">
            {anyOverdue
              ? 'One or more events are already overdue — acknowledge and action now.'
              : 'Prepare your team and acknowledge each one below.'}
          </p>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-3 p-5">
        {events.map((event) => (
          <EventRow
            key={reminderEventKey(event)}
            event={event}
            onAcknowledge={() =>
              acknowledge.mutate(
                event.source === 'transfer'
                  ? { transferId: event.transferId! }
                  : { orderItemId: event.orderItemId!, eventType: event.eventType! },
              )
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
