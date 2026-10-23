import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type ReminderCategory =
  | 'offsite_delivery'
  | 'offsite_collection'
  | 'instore_pickup'
  | 'instore_return'
  | 'airport_transfer';

export interface DeliveryReminderEvent {
  source: 'order' | 'transfer';
  category: ReminderCategory;
  orderItemId: string | null;
  orderId: string | null;
  bookingToken: string | null;
  eventType: 'pickup' | 'dropoff' | null;
  transferId: string | null;
  eventDatetime: string;
  vehicleName: string | null;
  locationName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  notes: string | null;
}

export type AcknowledgePayload =
  | { orderItemId: string; eventType: 'pickup' | 'dropoff' }
  | { transferId: string };

/** Stable per-event key, used for React list keys and "seen before" tracking. */
export function reminderEventKey(event: DeliveryReminderEvent): string {
  return event.source === 'transfer'
    ? `transfer:${event.transferId}`
    : `order:${event.orderItemId}:${event.eventType}`;
}

export const DELIVERY_REMINDERS_KEY = ['delivery-reminders'] as const;

export function useDeliveryReminders() {
  return useQuery<DeliveryReminderEvent[]>({
    queryKey: DELIVERY_REMINDERS_KEY,
    queryFn: () => api.get<DeliveryReminderEvent[]>('/orders/delivery-reminders'),
    refetchInterval: 60_000,
    // Without this, polling pauses the moment the tab isn't the visible/
    // focused one — which is how this alert went unacknowledged 100% of the
    // time historically (every delivery_reminder_log row had acknowledged_at
    // = null). Keep polling even in a background tab so the alert is ready
    // the instant the user switches back, instead of depending on
    // refetchOnWindowFocus to catch up after the fact.
    refetchIntervalInBackground: true,
    staleTime: 55_000,
  });
}

export function useAcknowledgeDeliveryReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AcknowledgePayload) =>
      api.post('/orders/delivery-reminders/acknowledge', payload),
    onMutate: async (payload: AcknowledgePayload) => {
      // Optimistically remove the event so the UI responds immediately.
      await qc.cancelQueries({ queryKey: DELIVERY_REMINDERS_KEY });
      const previous = qc.getQueryData<DeliveryReminderEvent[]>(DELIVERY_REMINDERS_KEY);
      qc.setQueryData<DeliveryReminderEvent[]>(DELIVERY_REMINDERS_KEY, (old) =>
        (old ?? []).filter((e) => {
          if ('transferId' in payload) return e.transferId !== payload.transferId;
          return !(e.orderItemId === payload.orderItemId && e.eventType === payload.eventType);
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(DELIVERY_REMINDERS_KEY, ctx.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: DELIVERY_REMINDERS_KEY });
    },
  });
}
