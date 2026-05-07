/**
 * Delivery reminder escalation job.
 *
 * Runs every minute. Finds off-site pickup/dropoff events that are
 * approximately 20 minutes away (T-19 to T-21 window). If the event
 * has not been acknowledged via the on-screen modal, fires a single
 * Telegram alert to the ops channel so the team is alerted even if
 * the browser is closed or the modal was missed.
 *
 * Off-site detection: pickup_fee > 0 (delivery) / dropoff_fee > 0 (collection).
 * Deduplication: delivery_reminder_log.telegram_sent_at prevents re-firing.
 */

import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';
import { logger } from '../lib/logger.js';

async function runDeliveryReminderJob(): Promise<void> {
  const sb = getSupabaseClient();
  const now = new Date();

  // Target window: events that are ~20 minutes away (±1 min tolerance).
  const windowStart = new Date(now.getTime() + 19 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 21 * 60 * 1000).toISOString();

  const [pickupResult, dropoffResult] = await Promise.all([
    sb
      .from('order_items')
      .select('id, order_id, vehicle_name, pickup_datetime, pickup_fee, pickup_location')
      .gte('pickup_datetime', windowStart)
      .lte('pickup_datetime', windowEnd)
      .gt('pickup_fee', 0),
    sb
      .from('order_items')
      .select('id, order_id, vehicle_name, dropoff_datetime, dropoff_fee, dropoff_location')
      .gte('dropoff_datetime', windowStart)
      .lte('dropoff_datetime', windowEnd)
      .gt('dropoff_fee', 0),
  ]);

  if (pickupResult.error) {
    logger.warn({ error: pickupResult.error.message }, '[delivery-reminder] pickup query failed');
    return;
  }
  if (dropoffResult.error) {
    logger.warn({ error: dropoffResult.error.message }, '[delivery-reminder] dropoff query failed');
    return;
  }

  type Candidate = {
    id: string;
    order_id: string;
    vehicle_name: string | null;
    eventType: 'pickup' | 'dropoff';
    eventDatetime: string;
    locationName: string | null;
  };

  const candidates: Candidate[] = [
    ...(pickupResult.data ?? []).map((i) => ({
      id: i.id as string,
      order_id: i.order_id as string,
      vehicle_name: i.vehicle_name as string | null,
      eventType: 'pickup' as const,
      eventDatetime: i.pickup_datetime as string,
      locationName: i.pickup_location as string | null,
    })),
    ...(dropoffResult.data ?? []).map((i) => ({
      id: i.id as string,
      order_id: i.order_id as string,
      vehicle_name: i.vehicle_name as string | null,
      eventType: 'dropoff' as const,
      eventDatetime: i.dropoff_datetime as string,
      locationName: i.dropoff_location as string | null,
    })),
  ];

  if (!candidates.length) return;

  const orderIds = [...new Set(candidates.map((c) => c.order_id))];
  const { data: orders, error: ordersErr } = await sb
    .from('orders')
    .select('id, status, booking_token, customer_id, web_notes, dropoff_location_note')
    .in('id', orderIds)
    .in('status', ['active', 'confirmed']);

  if (ordersErr) {
    logger.warn({ error: ordersErr.message }, '[delivery-reminder] orders query failed');
    return;
  }
  if (!orders?.length) return;

  const activeIds = new Set(orders.map((o) => o.id as string));
  const orderMap = new Map(orders.map((o) => [o.id as string, o]));

  const customerIds = [...new Set(orders.map((o) => o.customer_id as string))];
  const { data: customers } = await sb
    .from('customers')
    .select('id, name, mobile')
    .in('id', customerIds);
  const customerMap = new Map((customers ?? []).map((c) => [c.id as string, c]));

  for (const candidate of candidates) {
    if (!activeIds.has(candidate.order_id)) continue;

    // Check acknowledgment / previous Telegram send.
    const { data: log } = await sb
      .from('delivery_reminder_log')
      .select('acknowledged_at, telegram_sent_at')
      .eq('order_item_id', candidate.id)
      .eq('event_type', candidate.eventType)
      .maybeSingle();

    if (log?.acknowledged_at || log?.telegram_sent_at) continue;

    const order = orderMap.get(candidate.order_id)!;
    const customer = customerMap.get(order.customer_id as string) as
      | { name?: string; mobile?: string }
      | null
      | undefined;

    const timeStr = new Date(candidate.eventDatetime).toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
    });

    const locationName =
      candidate.locationName ??
      (candidate.eventType === 'dropoff'
        ? (order.dropoff_location_note as string | null)
        : null);

    const label = candidate.eventType === 'pickup' ? '🚗 DELIVERY' : '🔁 COLLECTION';
    const lines = [
      `<b>⚠️ ${label} DUE IN ~20 MIN — NOT YET ACKNOWLEDGED</b>`,
      ``,
      `🕐 <b>Time:</b> ${timeStr}`,
      `🏍️ <b>Vehicle:</b> ${escapeHtml(String(candidate.vehicle_name ?? 'Unknown'))}`,
      `📍 <b>Location:</b> ${escapeHtml(String(locationName ?? 'See booking notes'))}`,
      `👤 <b>Customer:</b> ${escapeHtml(String(customer?.name ?? 'Unknown'))}`,
      ...(customer?.mobile
        ? [`📞 <b>Mobile:</b> ${escapeHtml(String(customer.mobile))}`]
        : []),
      `🎫 <b>Ref:</b> ${escapeHtml(String((order.booking_token as string | null) ?? order.id))}`,
    ];

    void sendTelegramAlert(lines.join('\n'), getTelegramChatId('ops'));

    await sb.from('delivery_reminder_log').upsert(
      {
        order_item_id: candidate.id,
        event_type: candidate.eventType,
        telegram_sent_at: now.toISOString(),
      },
      { onConflict: 'order_item_id,event_type' },
    );

    logger.info(
      { orderItemId: candidate.id, eventType: candidate.eventType },
      '[delivery-reminder] Telegram escalation sent',
    );
  }
}

export function startDeliveryReminderJob(): void {
  cron.schedule('* * * * *', () => {
    void runDeliveryReminderJob();
  });
  console.log('[delivery-reminder] Job scheduled (every minute)');
}
