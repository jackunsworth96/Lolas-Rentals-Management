/**
 * Ops reminder escalation job.
 *
 * Runs every minute. Finds near-term order pickup/dropoff events (both
 * off-site deliveries/collections AND in-store handovers) and airport
 * transfers that are approaching and have not been acknowledged via the
 * on-screen modal, and escalates to Telegram so the team is alerted even if
 * the browser is closed or the modal was missed.
 *
 * Off-site detection is location-based (see lib/transport-service.ts), not
 * fee-based: a free partner delivery (e.g. a stay-benefit drop-off) still
 * has to physically happen even though pickup_fee is 0. The previous
 * `pickup_fee > 0` filter silently excluded every one of these — including
 * the Bravo Beach Resort delivery that was missed and prompted this job's
 * rewrite.
 *
 * Escalation lead times:
 *   - Off-site delivery/collection: ~20 minutes out (needs runway to brief a driver).
 *   - In-store pickup/return: ~15 minutes out (just needs someone ready at the desk).
 *   - Airport transfer: 2.5 hours out (needs much more runway than an in-town handover).
 *
 * Firing rule: "event is due within `leadMin` and hasn't been escalated yet"
 * — deliberately NOT a tight +/- window around the exact lead-time minute.
 * A precise window can be missed outright if the server/job doesn't happen to
 * be running during that one minute (e.g. a deploy, restart, or outage). With
 * an open-ended "due within leadMin" rule, the very first tick after the
 * process comes back online still catches anything that's due soon (or
 * already overdue) and unescalated — it just fires a little late rather than
 * never. Deduplication: delivery_reminder_log / transfer_reminder_log prevent
 * re-firing once something has gone out.
 */

import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendTelegramMessage, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';
import { logger } from '../lib/logger.js';
import { buildLocationIndex, isLegOffsite } from '../lib/transport-service.js';

const OFFSITE_LEAD_MIN = 20;
const INSTORE_LEAD_MIN = 15;
const TRANSFER_LEAD_MIN = 150;

// Floor so a months-old stale row can't resurrect and escalate; otherwise
// "due within leadMin" has no lower bound (see firing rule above).
const LOOKBACK_HOURS = 24;

function dueWithin(leadMin: number, now: Date): { start: string; end: string } {
  return {
    start: new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString(),
    end: new Date(now.getTime() + leadMin * 60 * 1000).toISOString(),
  };
}

async function runOrderEventEscalations(now: Date): Promise<void> {
  const sb = getSupabaseClient();

  // Off-site and in-store events use different lead windows, so query the
  // union of both and classify + filter per-event afterwards.
  const earliestStart = dueWithin(Math.min(OFFSITE_LEAD_MIN, INSTORE_LEAD_MIN), now).start;
  const latestEnd = dueWithin(Math.max(OFFSITE_LEAD_MIN, INSTORE_LEAD_MIN), now).end;

  const [pickupResult, dropoffResult, locationsResult] = await Promise.all([
    sb
      .from('order_items')
      .select('id, order_id, store_id, vehicle_name, pickup_datetime, pickup_fee, pickup_location, pickup_location_id')
      .gte('pickup_datetime', earliestStart)
      .lte('pickup_datetime', latestEnd),
    sb
      .from('order_items')
      .select('id, order_id, store_id, vehicle_name, dropoff_datetime, dropoff_fee, dropoff_location, dropoff_location_id')
      .gte('dropoff_datetime', earliestStart)
      .lte('dropoff_datetime', latestEnd),
    sb.from('locations').select('id, name, location_type, delivery_cost, collection_cost'),
  ]);

  if (pickupResult.error || dropoffResult.error || locationsResult.error) {
    logger.warn(
      {
        pickupError: pickupResult.error?.message,
        dropoffError: dropoffResult.error?.message,
        locationsError: locationsResult.error?.message,
      },
      '[ops-reminder] order_items/locations query failed',
    );
    return;
  }

  const locationIndex = buildLocationIndex(locationsResult.data ?? []);

  type Candidate = {
    id: string;
    order_id: string;
    vehicle_name: string | null;
    eventType: 'pickup' | 'dropoff';
    eventDatetime: string;
    locationName: string | null;
    offsite: boolean;
  };

  const candidates: Candidate[] = [
    ...(pickupResult.data ?? []).map((i) => ({
      id: i.id as string,
      order_id: i.order_id as string,
      vehicle_name: i.vehicle_name as string | null,
      eventType: 'pickup' as const,
      eventDatetime: i.pickup_datetime as string,
      locationName: i.pickup_location as string | null,
      offsite: isLegOffsite(
        i.pickup_location_id as string | null,
        i.pickup_location as string | null,
        i.pickup_fee as number | null,
        locationIndex,
        { unknownNamedLocationsRequireTransport: true },
      ),
    })),
    ...(dropoffResult.data ?? []).map((i) => ({
      id: i.id as string,
      order_id: i.order_id as string,
      vehicle_name: i.vehicle_name as string | null,
      eventType: 'dropoff' as const,
      eventDatetime: i.dropoff_datetime as string,
      locationName: i.dropoff_location as string | null,
      offsite: isLegOffsite(
        i.dropoff_location_id as string | null,
        i.dropoff_location as string | null,
        i.dropoff_fee as number | null,
        locationIndex,
        { unknownNamedLocationsRequireTransport: true },
      ),
    })),
  ].filter((c) => {
    const leadMin = c.offsite ? OFFSITE_LEAD_MIN : INSTORE_LEAD_MIN;
    const { start, end } = dueWithin(leadMin, now);
    return c.eventDatetime >= start && c.eventDatetime <= end;
  });

  if (!candidates.length) return;

  const orderIds = [...new Set(candidates.map((c) => c.order_id))];
  const { data: orders, error: ordersErr } = await sb
    .from('orders')
    .select('id, status, booking_token, customer_id, web_notes, dropoff_location_note')
    .in('id', orderIds)
    .in('status', ['active', 'confirmed']);

  if (ordersErr) {
    logger.warn({ error: ordersErr.message }, '[ops-reminder] orders query failed');
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
      (candidate.eventType === 'dropoff' ? (order.dropoff_location_note as string | null) : null);

    const label = candidate.offsite
      ? candidate.eventType === 'pickup' ? '🚗 DELIVERY' : '🔁 COLLECTION'
      : candidate.eventType === 'pickup' ? '🏬 CUSTOMER ARRIVING (PICKUP)' : '🏬 CUSTOMER ARRIVING (RETURN)';
    const leadMin = candidate.offsite ? OFFSITE_LEAD_MIN : INSTORE_LEAD_MIN;

    const lines = [
      `<b>⚠️ ${label} DUE IN ~${leadMin} MIN — NOT YET ACKNOWLEDGED</b>`,
      ``,
      `🕐 <b>Time:</b> ${timeStr}`,
      `🏍️ <b>Vehicle:</b> ${escapeHtml(String(candidate.vehicle_name ?? 'Unknown'))}`,
      `📍 <b>Location:</b> ${escapeHtml(String(locationName ?? 'See booking notes'))}`,
      `👤 <b>Customer:</b> ${escapeHtml(String(customer?.name ?? 'Unknown'))}`,
      ...(customer?.mobile ? [`📞 <b>Mobile:</b> ${escapeHtml(String(customer.mobile))}`] : []),
      `🎫 <b>Ref:</b> ${escapeHtml(String((order.booking_token as string | null) ?? order.id))}`,
    ];

    // Inline "Acknowledge" button lets ops confirm directly from Telegram —
    // the on-screen backoffice modal requires an actively-watched open tab,
    // which historically never happened (every past reminder escalated to
    // Telegram with acknowledged_at left null). Telegram is where ops
    // actually looks, so acknowledgment needs to work from there too.
    void sendTelegramMessage(lines.join('\n'), getTelegramChatId('ops') ?? '', {
      inline_keyboard: [[
        { text: '✓ Acknowledge', callback_data: `ack_delivery_${candidate.id}_${candidate.eventType}` },
      ]],
    });

    await sb.from('delivery_reminder_log').upsert(
      { order_item_id: candidate.id, event_type: candidate.eventType, telegram_sent_at: now.toISOString() },
      { onConflict: 'order_item_id,event_type' },
    );

    logger.info(
      { orderItemId: candidate.id, eventType: candidate.eventType, offsite: candidate.offsite },
      '[ops-reminder] Telegram escalation sent',
    );
  }
}

function formatLeadTime(leadMin: number): string {
  if (leadMin < 60) return `${leadMin} min`;
  const hours = leadMin / 60;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

async function runTransferEscalations(now: Date): Promise<void> {
  const sb = getSupabaseClient();
  const { start, end } = dueWithin(TRANSFER_LEAD_MIN, now);

  const todayPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
  const tomorrowPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
  );

  const { data: rows, error } = await sb
    .from('transfers')
    .select('id, customer_name, contact_number, route, service_date, pickup_time, accommodation, status')
    .in('service_date', [todayPHT, tomorrowPHT])
    .not('pickup_time', 'is', null)
    .neq('status', 'cancelled');

  if (error) {
    logger.warn({ error: error.message }, '[ops-reminder] transfers query failed');
    return;
  }

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  for (const t of rows ?? []) {
    const eventDate = new Date(`${t.service_date as string}T${t.pickup_time as string}+08:00`);
    if (eventDate.getTime() < startMs || eventDate.getTime() > endMs) continue;

    const { data: log } = await sb
      .from('transfer_reminder_log')
      .select('acknowledged_at, telegram_sent_at')
      .eq('transfer_id', t.id as string)
      .maybeSingle();

    if (log?.acknowledged_at || log?.telegram_sent_at) continue;

    const timeStr = eventDate.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

    const lines = [
      `<b>⚠️ ✈️ AIRPORT TRANSFER DUE IN ~${formatLeadTime(TRANSFER_LEAD_MIN)} — NOT YET ACKNOWLEDGED</b>`,
      ``,
      `🕐 <b>Time:</b> ${timeStr}`,
      `🛣️ <b>Route:</b> ${escapeHtml(String(t.route ?? 'Unknown'))}`,
      ...(t.accommodation ? [`📍 <b>Accommodation:</b> ${escapeHtml(String(t.accommodation))}`] : []),
      `👤 <b>Customer:</b> ${escapeHtml(String(t.customer_name ?? 'Unknown'))}`,
      ...(t.contact_number ? [`📞 <b>Mobile:</b> ${escapeHtml(String(t.contact_number))}`] : []),
    ];

    void sendTelegramMessage(lines.join('\n'), getTelegramChatId('ops') ?? '', {
      inline_keyboard: [[{ text: '✓ Acknowledge', callback_data: `ack_transfer_${t.id as string}` }]],
    });

    await sb.from('transfer_reminder_log').upsert(
      { transfer_id: t.id as string, telegram_sent_at: now.toISOString() },
      { onConflict: 'transfer_id' },
    );

    logger.info({ transferId: t.id }, '[ops-reminder] Telegram transfer escalation sent');
  }
}

async function runDeliveryReminderJob(): Promise<void> {
  const now = new Date();
  await Promise.all([runOrderEventEscalations(now), runTransferEscalations(now)]);
}

export function startDeliveryReminderJob(): void {
  cron.schedule('* * * * *', () => {
    void runDeliveryReminderJob();
  });
  console.log('[ops-reminder] Job scheduled (every minute)');
}
