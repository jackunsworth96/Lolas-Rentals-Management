import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { Permission, resolveStoreFromSource } from '@lolas/shared';
import { z } from 'zod';
import { supabase } from '../adapters/supabase/client.js';
import { buildLocationIndex, isLegOffsite } from '../lib/transport-service.js';
import { ORDERS_RAW_INBOX_COLUMNS } from '../lib/orders-raw-columns.js';
import {
  ACTIVATION_LEAD_MS,
  NEW_ORDER_LOOKBACK_MS,
  buildInboxAlerts,
  type InboxAlertRow,
} from '../lib/inbox-alerts.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(authenticate);

export type ReminderCategory =
  | 'offsite_delivery'
  | 'offsite_collection'
  | 'instore_pickup'
  | 'instore_return'
  | 'airport_transfer'
  | 'new_order'
  | 'activation_due';

export interface ReminderEvent {
  source: 'order' | 'transfer' | 'inbox';
  category: ReminderCategory;
  // Order-sourced events are keyed by (orderItemId, eventType); transfer
  // events are keyed by transferId. Both are always present on an event so
  // the frontend can build a single acknowledge payload without branching.
  orderItemId: string | null;
  eventType: 'pickup' | 'dropoff' | null;
  transferId: string | null;
  /** orders_raw id, for Inbox events (new order / activation due). */
  orderRawId: string | null;
  orderId: string | null;
  bookingToken: string | null;
  eventDatetime: string;
  vehicleName: string | null;
  locationName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  notes: string | null;
  /** Pickup time for new-order alerts, whose eventDatetime is when the order arrived. */
  pickupDatetime?: string | null;
}

// How far ahead each category starts surfacing in the modal:
//   - Order pickups/returns (off-site or in-store): 1h out, so the vehicle can
//     be prepared in time (the Telegram job still escalates at ~20 min).
//   - Airport transfer: 2.5h out — transfers need much more lead time than a
//     same-building handover (traffic, van dispatch, etc).
const OFFSITE_FUTURE_MS = 60 * 60 * 1000;
const INSTORE_FUTURE_MS = 60 * 60 * 1000;
const TRANSFER_FUTURE_MS = 150 * 60 * 1000;

// There is deliberately NO "look-back" cutoff tied to how long ago the event
// was due. An unacknowledged event must keep showing no matter how late
// someone logs in — otherwise "the backoffice was offline/unattended and
// nobody saw it" (the exact Bravo Beach Resort failure mode) can recur simply
// because too much time passed before anyone opened the app. The only floor
// is "today" (Asia/Manila), so the list doesn't resurrect ancient stale rows.
function startOfTodayManilaIso(now: Date): string {
  const todayPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
  return new Date(`${todayPHT}T00:00:00+08:00`).toISOString();
}

/**
 * Inbox events: new web orders, and unactivated orders whose pickup is under
 * an hour away. Returns nothing (rather than undismissable alerts) if the
 * inbox_alert_log migration hasn't been applied yet.
 */
async function loadInboxEvents(
  storeIds: string[],
  now: Date,
  dayStart: string,
  locationIndex: ReturnType<typeof buildLocationIndex>,
): Promise<ReminderEvent[]> {
  const newSince = new Date(now.getTime() - NEW_ORDER_LOOKBACK_MS).toISOString();
  const pickupBy = new Date(now.getTime() + ACTIVATION_LEAD_MS).toISOString();
  const { data: rows, error } = await supabase
    .from('orders_raw')
    .select(ORDERS_RAW_INBOX_COLUMNS)
    .eq('status', 'unprocessed')
    .or(`created_at.gte.${newSince},and(pickup_datetime.gte.${dayStart},pickup_datetime.lte.${pickupBy})`);
  if (error) throw new Error(`inbox query failed: ${error.message}`);

  const allowed = new Set(storeIds);
  const scoped = ((rows ?? []) as unknown as Array<InboxAlertRow & { store_id: string | null; source: string }>).filter((r) =>
    allowed.has(r.store_id ?? resolveStoreFromSource(r.source)),
  );
  if (scoped.length === 0) return [];

  const [logResult, modelsResult] = await Promise.all([
    supabase.from('inbox_alert_log').select('order_raw_id, event_type, acknowledged_at').in('order_raw_id', scoped.map((r) => r.id)),
    supabase.from('vehicle_models').select('id, name'),
  ]);
  if (logResult.error) {
    logger.warn({ err: logResult.error.message }, 'inbox_alert_log unavailable; skipping inbox alerts');
    return [];
  }
  const acknowledged = new Set(
    (logResult.data ?? [])
      .filter((l) => l.acknowledged_at != null)
      .map((l) => `${l.order_raw_id as string}:${l.event_type as string}`),
  );
  const modelNames = new Map(((modelsResult.data ?? []) as Array<{ id: string; name: string }>).map((m) => [m.id, m.name]));

  return buildInboxAlerts({ rows: scoped, acknowledged, nowMs: now.getTime(), dayStartMs: Date.parse(dayStart) }).map(
    ({ type, row, eventDatetime }) => ({
      source: 'inbox',
      category: type,
      orderItemId: null,
      eventType: null,
      transferId: null,
      orderRawId: row.id,
      orderId: null,
      bookingToken: row.order_reference,
      eventDatetime,
      vehicleName: row.vehicle_model_id ? modelNames.get(row.vehicle_model_id) ?? null : null,
      locationName:
        row.pickup_location_address ??
        (row.pickup_location_id != null ? locationIndex.byId.get(String(row.pickup_location_id))?.name ?? null : null),
      customerName: row.customer_name,
      customerMobile: row.customer_mobile,
      notes: row.customer_extra_comments,
      pickupDatetime: row.pickup_datetime,
    }),
  );
}

/**
 * GET /orders/delivery-reminders
 *
 * Returns every unacknowledged near-term order pickup/dropoff event AND
 * airport transfer, across *all* of them — not just the off-site ones with
 * a non-zero fee. (A free partner delivery, e.g. a stay-benefit drop-off at
 * a partner resort, still has to physically happen; charging $0 for it
 * doesn't make the vehicle appear there on its own. The previous
 * `pickup_fee > 0` filter silently excluded every one of these.)
 *
 * Categories, from the location (not the fee):
 *   - offsite_delivery / offsite_collection: vehicle must be driven to/from
 *     a non-store address.
 *   - instore_pickup / instore_return: customer is coming to/leaving the
 *     store directly.
 *   - airport_transfer: a booked van/car transfer is due soon.
 */
router.get(
  '/',
  requirePermission(Permission.ViewInbox),
  async (req, res, next) => {
    try {
      const storeIds = req.user!.storeIds;
      const now = new Date();
      const dayStart = startOfTodayManilaIso(now);
      // Query the widest bound any category needs (today -> now+35min for
      // order items); the narrower in-store future bound is applied per-event below.
      const windowStart = dayStart;
      const windowEnd = new Date(now.getTime() + OFFSITE_FUTURE_MS).toISOString();

      const [pickupResult, dropoffResult, locationsResult] = await Promise.all([
        supabase
          .from('order_items')
          .select(
            'id, order_id, store_id, vehicle_name, pickup_datetime, pickup_fee, pickup_location, pickup_location_id',
          )
          .in('store_id', storeIds)
          .gte('pickup_datetime', windowStart)
          .lte('pickup_datetime', windowEnd),
        supabase
          .from('order_items')
          .select(
            'id, order_id, store_id, vehicle_name, dropoff_datetime, dropoff_fee, dropoff_location, dropoff_location_id',
          )
          .in('store_id', storeIds)
          .gte('dropoff_datetime', windowStart)
          .lte('dropoff_datetime', windowEnd),
        supabase
          .from('locations')
          .select('id, name, location_type, delivery_cost, collection_cost')
          .or(`store_id.in.(${storeIds.join(',')}),store_id.is.null`),
      ]);

      if (pickupResult.error) throw new Error(`pickup query failed: ${pickupResult.error.message}`);
      if (dropoffResult.error) throw new Error(`dropoff query failed: ${dropoffResult.error.message}`);
      if (locationsResult.error) throw new Error(`locations query failed: ${locationsResult.error.message}`);

      const pickupItems = pickupResult.data ?? [];
      const dropoffItems = dropoffResult.data ?? [];
      const locationIndex = buildLocationIndex(locationsResult.data ?? []);

      const allOrderIds = [
        ...new Set([
          ...pickupItems.map((i) => i.order_id as string),
          ...dropoffItems.map((i) => i.order_id as string),
        ]),
      ];

      const events: ReminderEvent[] = [];

      if (allOrderIds.length > 0) {
        const { data: orders, error: ordersErr } = await supabase
          .from('orders')
          .select('id, status, booking_token, customer_id, web_notes, dropoff_location_note, partner_ref')
          .in('id', allOrderIds)
          .in('status', ['active', 'confirmed']);
        if (ordersErr) throw new Error(`orders query failed: ${ordersErr.message}`);

        if (orders?.length) {
          const activeOrderIds = new Set(orders.map((o) => o.id as string));
          const orderMap = new Map(orders.map((o) => [o.id as string, o]));

          const customerIds = [...new Set(orders.map((o) => o.customer_id as string))];
          const { data: customers } = await supabase
            .from('customers')
            .select('id, name, mobile')
            .in('id', customerIds);
          const customerMap = new Map((customers ?? []).map((c) => [c.id as string, c]));

          const allItemIds = [
            ...new Set([...pickupItems.map((i) => i.id as string), ...dropoffItems.map((i) => i.id as string)]),
          ];
          const { data: logs } = await supabase
            .from('delivery_reminder_log')
            .select('order_item_id, event_type, acknowledged_at')
            .in('order_item_id', allItemIds.length ? allItemIds : ['__none__']);
          const acknowledgedSet = new Set(
            (logs ?? [])
              .filter((l) => l.acknowledged_at != null)
              .map((l) => `${l.order_item_id as string}:${l.event_type as string}`),
          );

          for (const item of pickupItems) {
            if (!activeOrderIds.has(item.order_id as string)) continue;
            if (acknowledgedSet.has(`${item.id as string}:pickup`)) continue;
            const order = orderMap.get(item.order_id as string)!;

            const offsite = isLegOffsite(
              item.pickup_location_id as string | null,
              item.pickup_location as string | null,
              item.pickup_fee as number | null,
              locationIndex,
              // Any named, unresolved location (typically a partner
              // establishment with a free-delivery benefit) is treated as
              // off-site. False positives here just mean an extra alert;
              // false negatives mean a vehicle silently never shows up.
              { unknownNamedLocationsRequireTransport: true },
            );
            const category: ReminderCategory = offsite ? 'offsite_delivery' : 'instore_pickup';

            const eventMs = new Date(item.pickup_datetime as string).getTime();
            // In-store events use a tighter look-ahead than off-site ones;
            // the dayStart floor (applied at query level) is the only "how
            // far back" bound for either — see startOfTodayManilaIso above.
            if (!offsite && eventMs > now.getTime() + INSTORE_FUTURE_MS) continue;

            const customer = customerMap.get(order.customer_id as string);
            events.push({
              source: 'order',
              category,
              orderItemId: item.id as string,
            eventType: 'pickup',
            transferId: null,
            orderRawId: null,
            orderId: item.order_id as string,
              bookingToken: order.booking_token as string | null,
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

            const offsite = isLegOffsite(
              item.dropoff_location_id as string | null,
              item.dropoff_location as string | null,
              item.dropoff_fee as number | null,
              locationIndex,
              { unknownNamedLocationsRequireTransport: true },
            );
            const category: ReminderCategory = offsite ? 'offsite_collection' : 'instore_return';

            const eventMs = new Date(item.dropoff_datetime as string).getTime();
            if (!offsite && eventMs > now.getTime() + INSTORE_FUTURE_MS) continue;

            const customer = customerMap.get(order.customer_id as string);
            events.push({
              source: 'order',
              category,
              orderItemId: item.id as string,
              eventType: 'dropoff',
              transferId: null,
              orderRawId: null,
              orderId: item.order_id as string,
              bookingToken: order.booking_token as string | null,
              eventDatetime: item.dropoff_datetime as string,
              vehicleName: item.vehicle_name as string | null,
              locationName:
                (item.dropoff_location as string | null) ?? (order.dropoff_location_note as string | null),
              customerName: (customer as { name?: string } | null | undefined)?.name ?? null,
              customerMobile: (customer as { mobile?: string } | null | undefined)?.mobile ?? null,
              notes: order.web_notes as string | null,
            });
          }
        }
      }

      // ── Airport transfers ──
      // Combine service_date (date) + pickup_time (time, no tz) as Asia/Manila
      // local time, same convention as the existing transfer-reminder job.
      // Floor is "today" (same as order events, see startOfTodayManilaIso);
      // ceiling is the 2.5h look-ahead.
      const transferWindowStart = new Date(dayStart);
      const transferWindowEnd = new Date(now.getTime() + TRANSFER_FUTURE_MS);
      const todayPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
      const tomorrowPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
      );

      const { data: transferRows, error: transferErr } = await supabase
        .from('transfers')
        .select('id, customer_name, contact_number, route, service_date, pickup_time, accommodation, status, store_id')
        .in('store_id', storeIds)
        .in('service_date', [todayPHT, tomorrowPHT])
        .not('pickup_time', 'is', null)
        .neq('status', 'cancelled');
      if (transferErr) throw new Error(`transfers query failed: ${transferErr.message}`);

      const candidateTransfers = (transferRows ?? []).filter((t) => {
        const eventDate = new Date(`${t.service_date as string}T${t.pickup_time as string}+08:00`);
        return eventDate >= transferWindowStart && eventDate <= transferWindowEnd;
      });

      if (candidateTransfers.length) {
        const transferIds = candidateTransfers.map((t) => t.id as string);
        const { data: transferLogs } = await supabase
          .from('transfer_reminder_log')
          .select('transfer_id, acknowledged_at')
          .in('transfer_id', transferIds);
        const transferAcknowledged = new Set(
          (transferLogs ?? [])
            .filter((l) => l.acknowledged_at != null)
            .map((l) => l.transfer_id as string),
        );

        for (const t of candidateTransfers) {
          if (transferAcknowledged.has(t.id as string)) continue;
          const eventDate = new Date(`${t.service_date as string}T${t.pickup_time as string}+08:00`);
          events.push({
            source: 'transfer',
            category: 'airport_transfer',
            orderItemId: null,
            eventType: null,
            transferId: t.id as string,
            orderRawId: null,
            orderId: null,
            bookingToken: null,
            eventDatetime: eventDate.toISOString(),
            vehicleName: null,
            locationName: `${t.route as string}${t.accommodation ? ` · ${t.accommodation as string}` : ''}`,
            customerName: t.customer_name as string | null,
            customerMobile: t.contact_number as string | null,
            notes: null,
          });
        }
      }

      events.push(...(await loadInboxEvents(storeIds, now, dayStart, locationIndex)));

      events.sort((a, b) => new Date(a.eventDatetime).getTime() - new Date(b.eventDatetime).getTime());

      return res.json({ success: true, data: events });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /orders/delivery-reminders/acknowledge
 *
 * Marks a near-term event (order pickup/dropoff OR airport transfer) as
 * acknowledged, suppressing future modal appearances and the Telegram
 * escalation for that event.
 */
const AcknowledgeSchema = z.union([
  z.object({ orderItemId: z.string(), eventType: z.enum(['pickup', 'dropoff']) }),
  z.object({ transferId: z.string() }),
  z.object({ orderRawId: z.string().uuid(), eventType: z.enum(['new_order', 'activation_due']) }),
]);

router.post(
  '/acknowledge',
  requirePermission(Permission.ViewInbox),
  validateBody(AcknowledgeSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof AcknowledgeSchema>;
      const username = req.user!.username ?? null;

      if ('transferId' in body) {
        const { error } = await supabase.from('transfer_reminder_log').upsert(
          {
            transfer_id: body.transferId,
            acknowledged_at: new Date().toISOString(),
            acknowledged_by: username,
          },
          { onConflict: 'transfer_id' },
        );
        if (error) throw new Error(`acknowledge failed: ${error.message}`);
        return res.json({ success: true });
      }

      if ('orderRawId' in body) {
        const acknowledgedAt = new Date().toISOString();
        // Preparing for pickup implies the order has been seen, so it shouldn't re-alert as new.
        const types = body.eventType === 'activation_due' ? ['activation_due', 'new_order'] : ['new_order'];
        const { error } = await supabase.from('inbox_alert_log').upsert(
          types.map((event_type) => ({
            order_raw_id: body.orderRawId,
            event_type,
            acknowledged_at: acknowledgedAt,
            acknowledged_by: username,
          })),
          { onConflict: 'order_raw_id,event_type' },
        );
        if (error) throw new Error(`acknowledge failed: ${error.message}`);
        return res.json({ success: true });
      }

      const { orderItemId, eventType } = body;
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
