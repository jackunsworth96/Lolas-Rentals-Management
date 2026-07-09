/**
 * Daily pickup reminder job.
 *
 * Fires at 09:00 Asia/Manila every day.
 * Finds every booking whose pickup_datetime falls tomorrow
 * (Asia/Manila date boundaries) and sends a WhatsApp template message via
 * the respond.io outbound API.
 */

import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logger } from '../lib/logger.js';
import { sendRespondIoTemplateMessage } from '../services/respond-io-outbound.js';

interface ReminderCandidate {
  bookingReference: string;
  customerName: string;
  customerMobile: string;
  pickupDatetime: string;
}

const PICKUP_REMINDER_TEMPLATE_CHANNEL_ID = Number(
  process.env.RESPOND_IO_PICKUP_REMINDER_CHANNEL_ID ?? process.env.RESPOND_IO_WHATSAPP_CHANNEL_ID ?? 501809,
);
const PICKUP_REMINDER_TEMPLATE_NAME = process.env.RESPOND_IO_PICKUP_REMINDER_TEMPLATE_NAME ?? 'pickup_reminder_tomorrow';
const PICKUP_REMINDER_TEMPLATE_LANGUAGE = process.env.RESPOND_IO_PICKUP_REMINDER_TEMPLATE_LANGUAGE ?? 'en';
const PICKUP_REMINDER_TEMPLATE_BODY =
  "Hi {{1}}, we look forward to seeing you tomorrow.\n\nJust message us here if you need anything before your arrival. We will have your rental vehicle ready at {{2}}.\n\nSee you then!";

function manilaDateOffset(offsetDays: number): string {
  const todayPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const date = new Date(`${todayPHT}T00:00:00+08:00`);
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}

function formatPickupTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function runPickupReminderJob(): Promise<void> {
  logger.info('[pickup-reminder] Running...');

  const sb = getSupabaseClient();
  const pickupDatePHT = manilaDateOffset(1);
  const windowStart = `${pickupDatePHT}T00:00:00+08:00`;
  const windowEnd = `${pickupDatePHT}T23:59:59.999+08:00`;
  // Only unprocessed raw bookings are authoritative here. Once a raw booking is
  // processed, the corresponding orders/order_items rows carry the live status.
  const RAW_STATUSES = ['unprocessed'] as const;
  const ACTIVE_STATUSES = ['active', 'confirmed'] as const;

  const { data: rawRows, error: rawErr } = await sb
    .from('orders_raw')
    .select('order_reference, customer_name, customer_mobile, pickup_datetime')
    .in('status', RAW_STATUSES)
    .gte('pickup_datetime', windowStart)
    .lte('pickup_datetime', windowEnd);

  if (rawErr) {
    logger.warn({ error: rawErr.message }, '[pickup-reminder] orders_raw query failed');
  }

  const { data: itemRows, error: itemErr } = await sb
    .from('order_items')
    .select(
      'pickup_datetime, orders!inner(booking_token, status, customers!inner(name, mobile))',
    )
    .gte('pickup_datetime', windowStart)
    .lte('pickup_datetime', windowEnd)
    .in('orders.status', ACTIVE_STATUSES);

  if (itemErr) {
    logger.warn({ error: itemErr.message }, '[pickup-reminder] order_items query failed');
  }

  const candidates: ReminderCandidate[] = [];

  for (const row of rawRows ?? []) {
    const name = (row.customer_name as string | null)?.trim();
    const mobile = (row.customer_mobile as string | null)?.trim();
    const ref = row.order_reference as string | null;
    if (!name || !mobile || !ref) continue;
    candidates.push({
      bookingReference: ref,
      customerName: name,
      customerMobile: mobile,
      pickupDatetime: row.pickup_datetime as string,
    });
  }

  for (const row of itemRows ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!order) continue;
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    if (!customer) continue;

    const name = (customer.name as string | null)?.trim();
    const mobile = (customer.mobile as string | null)?.trim();
    const ref = order.booking_token as string | null;
    if (!name || !mobile || !ref) continue;

    candidates.push({
      bookingReference: ref,
      customerName: name,
      customerMobile: mobile,
      pickupDatetime: row.pickup_datetime as string,
    });
  }

  const seenRefs = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    if (seenRefs.has(candidate.bookingReference)) return false;
    seenRefs.add(candidate.bookingReference);
    return true;
  });

  if (!uniqueCandidates.length) {
    logger.info('[pickup-reminder] No pickups tomorrow found - nothing to send');
    return;
  }

  logger.info(`[pickup-reminder] ${uniqueCandidates.length} candidate(s) found`);

  const allRefs = uniqueCandidates.map((c) => c.bookingReference);
  const { data: sentRows, error: logErr } = await sb
    .from('pickup_reminder_log')
    .select('booking_reference')
    .in('booking_reference', allRefs);

  if (logErr) {
    logger.warn({ error: logErr.message }, '[pickup-reminder] dedup log query failed');
  }

  const alreadySent = new Set((sentRows ?? []).map((r) => r.booking_reference as string));

  for (const candidate of uniqueCandidates) {
    if (alreadySent.has(candidate.bookingReference)) {
      logger.info({ ref: candidate.bookingReference }, '[pickup-reminder] Already sent - skipping');
      continue;
    }

    const pickupTime = formatPickupTime(candidate.pickupDatetime);

    try {
      const result = await sendRespondIoTemplateMessage({
        phone: candidate.customerMobile,
        channelId: PICKUP_REMINDER_TEMPLATE_CHANNEL_ID,
        templateName: PICKUP_REMINDER_TEMPLATE_NAME,
        languageCode: PICKUP_REMINDER_TEMPLATE_LANGUAGE,
        bodyText: PICKUP_REMINDER_TEMPLATE_BODY,
        parameters: [candidate.customerName, pickupTime],
        logContext: { ref: candidate.bookingReference },
      });

      if (result.delivered) {
        await sb.from('pickup_reminder_log').insert({
          booking_reference: candidate.bookingReference,
          sent_at: new Date().toISOString(),
        });
      }

      logger.info(
        { ref: candidate.bookingReference, delivered: result.delivered },
        result.delivered ? '[pickup-reminder] Reminder sent' : '[pickup-reminder] Reminder simulated',
      );
    } catch (err) {
      logger.warn(
        {
          ref: candidate.bookingReference,
          error: err instanceof Error ? err.message : String(err),
        },
        '[pickup-reminder] Failed to send - continuing',
      );
    }
  }

  logger.info('[pickup-reminder] Done');
}

export function startPickupReminderJob(): void {
  cron.schedule(
    '0 9 * * *',
    () => { void runPickupReminderJob(); },
    { timezone: 'Asia/Manila' },
  );
  logger.info('[pickup-reminder] Job scheduled (09:00 Asia/Manila)');
}
