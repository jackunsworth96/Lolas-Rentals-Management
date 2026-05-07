import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';
import { supabase } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

/**
 * GET /orders/delivery-reminders
 *
 * Returns unacknowledged off-site pickup/dropoff events that fall within
 * a 2h-past to 35min-future window. Used by the frontend alert modal.
 * Off-site is determined by pickup_fee > 0 (delivery) or dropoff_fee > 0 (collection).
 */
router.get(
  '/',
  requirePermission(Permission.ViewInbox),
  async (req, res, next) => {
    try {
      const storeIds = req.user!.storeIds;
      const now = new Date();
      const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(now.getTime() + 35 * 60 * 1000).toISOString();

      // Two separate queries for pickup events and dropoff events.
      const [pickupResult, dropoffResult] = await Promise.all([
        supabase
          .from('order_items')
          .select(
            'id, order_id, vehicle_name, pickup_datetime, pickup_fee, pickup_location, pickup_location_id',
          )
          .in('store_id', storeIds)
          .gte('pickup_datetime', windowStart)
          .lte('pickup_datetime', windowEnd)
          .gt('pickup_fee', 0),
        supabase
          .from('order_items')
          .select(
            'id, order_id, vehicle_name, dropoff_datetime, dropoff_fee, dropoff_location, dropoff_location_id',
          )
          .in('store_id', storeIds)
          .gte('dropoff_datetime', windowStart)
          .lte('dropoff_datetime', windowEnd)
          .gt('dropoff_fee', 0),
      ]);

      if (pickupResult.error) throw new Error(`pickup query failed: ${pickupResult.error.message}`);
      if (dropoffResult.error) throw new Error(`dropoff query failed: ${dropoffResult.error.message}`);

      const pickupItems = pickupResult.data ?? [];
      const dropoffItems = dropoffResult.data ?? [];

      if (!pickupItems.length && !dropoffItems.length) {
        return res.json({ success: true, data: [] });
      }

      // Collect all order IDs and filter to active/confirmed only.
      const allOrderIds = [
        ...new Set([
          ...pickupItems.map((i) => i.order_id as string),
          ...dropoffItems.map((i) => i.order_id as string),
        ]),
      ];

      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, status, booking_token, customer_id, web_notes, dropoff_location_note')
        .in('id', allOrderIds)
        .in('status', ['active', 'confirmed']);

      if (ordersErr) throw new Error(`orders query failed: ${ordersErr.message}`);
      if (!orders?.length) return res.json({ success: true, data: [] });

      const activeOrderIds = new Set(orders.map((o) => o.id as string));
      const orderMap = new Map(orders.map((o) => [o.id as string, o]));

      const customerIds = [...new Set(orders.map((o) => o.customer_id as string))];
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, mobile')
        .in('id', customerIds);
      const customerMap = new Map((customers ?? []).map((c) => [c.id as string, c]));

      // Check which events are already acknowledged.
      const allItemIds = [
        ...new Set([...pickupItems.map((i) => i.id as string), ...dropoffItems.map((i) => i.id as string)]),
      ];
      const { data: logs } = await supabase
        .from('delivery_reminder_log')
        .select('order_item_id, event_type, acknowledged_at')
        .in('order_item_id', allItemIds);

      const acknowledgedSet = new Set(
        (logs ?? [])
          .filter((l) => l.acknowledged_at != null)
          .map((l) => `${l.order_item_id as string}:${l.event_type as string}`),
      );

      type ReminderEvent = {
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
      };

      const events: ReminderEvent[] = [];

      for (const item of pickupItems) {
        if (!activeOrderIds.has(item.order_id as string)) continue;
        if (acknowledgedSet.has(`${item.id as string}:pickup`)) continue;
        const order = orderMap.get(item.order_id as string)!;
        const customer = customerMap.get(order.customer_id as string);
        events.push({
          orderItemId: item.id as string,
          orderId: item.order_id as string,
          bookingToken: order.booking_token as string | null,
          eventType: 'pickup',
          eventDatetime: item.pickup_datetime as string,
          vehicleName: item.vehicle_name as string | null,
          locationName: item.pickup_location as string | null,
          customerName: (customer as { name?: string } | null | undefined)?.name ?? null,
          customerMobile: (customer as { mobile?: string } | null | undefined)?.mobile ?? null,
          notes: order.web_notes as string | null,
        });
      }

      for (const item of dropoffItems) {
        if (!activeOrderIds.has(item.order_id as string)) continue;
        if (acknowledgedSet.has(`${item.id as string}:dropoff`)) continue;
        const order = orderMap.get(item.order_id as string)!;
        const customer = customerMap.get(order.customer_id as string);
        events.push({
          orderItemId: item.id as string,
          orderId: item.order_id as string,
          bookingToken: order.booking_token as string | null,
          eventType: 'dropoff',
          eventDatetime: item.dropoff_datetime as string,
          vehicleName: item.vehicle_name as string | null,
          locationName:
            (item.dropoff_location as string | null) ??
            (order.dropoff_location_note as string | null),
          customerName: (customer as { name?: string } | null | undefined)?.name ?? null,
          customerMobile: (customer as { mobile?: string } | null | undefined)?.mobile ?? null,
          notes: order.web_notes as string | null,
        });
      }

      // Sort soonest first.
      events.sort(
        (a, b) =>
          new Date(a.eventDatetime).getTime() - new Date(b.eventDatetime).getTime(),
      );

      return res.json({ success: true, data: events });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /orders/delivery-reminders/acknowledge
 *
 * Marks an off-site event as acknowledged, suppressing future modal
 * appearances and the Telegram escalation for that event.
 */
const AcknowledgeSchema = z.object({
  orderItemId: z.string(),
  eventType: z.enum(['pickup', 'dropoff']),
});

router.post(
  '/acknowledge',
  requirePermission(Permission.ViewInbox),
  validateBody(AcknowledgeSchema),
  async (req, res, next) => {
    try {
      const { orderItemId, eventType } = req.body as z.infer<typeof AcknowledgeSchema>;
      const username = req.user!.username ?? null;

      const { error } = await supabase.from('delivery_reminder_log').upsert(
        {
          order_item_id: orderItemId,
          event_type: eventType,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: username,
        },
        { onConflict: 'order_item_id,event_type' },
      );

      if (error) throw new Error(`acknowledge failed: ${error.message}`);
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as deliveryReminderRoutes };
