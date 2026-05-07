import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface DeliveryReminderEvent {
  orderItemId: string;
  orderId: string;
  bookingToken: string | null;
  eventType: 'pickup' | 'dropoff';
  eventDatetime: string;
  vehicleName: string | null;
  locationName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  notes: string | null;
}

export const DELIVERY_REMINDERS_KEY = ['delivery-reminders'] as const;

export function useDeliveryReminders() {
  return useQuery<DeliveryReminderEvent[]>({
    queryKey: DELIVERY_REMINDERS_KEY,
    queryFn: () => api.get<DeliveryReminderEvent[]>('/orders/delivery-reminders'),
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
}

export function useAcknowledgeDeliveryReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderItemId,
      eventType,
    }: {
      orderItemId: string;
      eventType: 'pickup' | 'dropoff';
    }) => api.post('/orders/delivery-reminders/acknowledge', { orderItemId, eventType }),
    onMutate: async ({ orderItemId, eventType }) => {
      // Optimistically remove the event so the UI responds immediately.
      await qc.cancelQueries({ queryKey: DELIVERY_REMINDERS_KEY });
      const previous = qc.getQueryData<DeliveryReminderEvent[]>(DELIVERY_REMINDERS_KEY);
      qc.setQueryData<DeliveryReminderEvent[]>(DELIVERY_REMINDERS_KEY, (old) =>
        (old ?? []).filter(
          (e) => !(e.orderItemId === orderItemId && e.eventType === eventType),
        ),
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
