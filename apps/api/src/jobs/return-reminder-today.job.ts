/**
 * Daily same-day return reminder job.
 *
 * Fires at 09:00 Asia/Manila every day.
 * Finds every active rental whose dropoff_datetime falls today
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
  dropoffDatetime: string;
  orderId: string | null;
  hasNinePmReturnAddon: boolean;
}

const RETURN_REMINDER_TODAY_TEMPLATE_CHANNEL_ID = Number(
  process.env.RESPOND_IO_RETURN_REMINDER_TODAY_CHANNEL_ID ?? process.env.RESPOND_IO_WHATSAPP_CHANNEL_ID ?? 501809,
);
const RETURN_REMINDER_TODAY_TEMPLATE_NAME = process.env.RESPOND_IO_RETURN_REMINDER_TODAY_TEMPLATE_NAME ?? 'return_reminder_today';
const RETURN_REMINDER_TODAY_TEMPLATE_LANGUAGE = process.env.RESPOND_IO_RETURN_REMINDER_TODAY_TEMPLATE_LANGUAGE ?? 'en';
const RETURN_REMINDER_TODAY_TEMPLATE_BODY =
  "Hey {{1}}, hope you're still enjoying the island! 🌴\n\nJust a friendly reminder that your rental is due back today at {{2}}.\n\nNeed a little more island time? Just reply here with how long you'd like to extend, and we'll help sort it out.\n\nAny questions, just message us!";
const NINE_PM_RETURN_ADDON_ID = 9;

function todayManilaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

function formatReturnTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function runReturnReminderTodayJob(): Promise<void> {
  logger.info('[return-reminder-today] Running...');

  const sb = getSupabaseClient();
  const todayPHT = todayManilaDate();
  const windowStart = `${todayPHT}T00:00:00+08:00`;
  const windowEnd = `${todayPHT}T23:59:59.999+08:00`;
  const ACTIVE_STATUSES = ['active', 'confirmed'] as const;

  const { data: rawRows, error: rawErr } = await sb
    .from('orders_raw')
    .select('order_reference, customer_name, customer_mobile, dropoff_datetime, addon_ids')
    .in('status', ACTIVE_STATUSES)
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd);

  if (rawErr) {
    logger.warn({ error: rawErr.message }, '[return-reminder-today] orders_raw query failed');
  }

  const { data: itemRows, error: itemErr } = await sb
    .from('order_items')
    .select(
      'order_id, dropoff_datetime, orders!inner(booking_token, status, customers!inner(name, mobile))',
    )
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd)
    .in('orders.status', ACTIVE_STATUSES);

  if (itemErr) {
    logger.warn({ error: itemErr.message }, '[return-reminder-today] order_items query failed');
  }

  const staffOrderIds = [
    ...new Set((itemRows ?? []).map((row) => row.order_id as string | null).filter(Boolean)),
  ];
  const ninePmOrderIds = new Set<string>();

  if (staffOrderIds.length > 0) {
    const { data: addonRows, error: addonErr } = await sb
      .from('order_addons')
      .select('order_id')
      .in('order_id', staffOrderIds)
      .or('addon_name.ilike.%9pm%,addon_name.ilike.%21:00%,addon_name.ilike.%ninepm%');

    if (addonErr) {
      logger.warn({ error: addonErr.message }, '[return-reminder-today] order_addons query failed');
    }

    for (const addon of (addonRows ?? []) as Array<{ order_id: string }>) {
      ninePmOrderIds.add(addon.order_id);
    }
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
      dropoffDatetime: row.dropoff_datetime as string,
      orderId: null,
      hasNinePmReturnAddon: Array.isArray(row.addon_ids)
        && row.addon_ids.includes(NINE_PM_RETURN_ADDON_ID),
    });
  }

  for (const row of itemRows ?? []) {
    const orderId = row.order_id as string | null;
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
      dropoffDatetime: row.dropoff_datetime as string,
      orderId,
      hasNinePmReturnAddon: !!orderId && ninePmOrderIds.has(orderId),
    });
  }

  const seenRefs = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    if (seenRefs.has(candidate.bookingReference)) return false;
    seenRefs.add(candidate.bookingReference);
    return true;
  });

  if (!uniqueCandidates.length) {
    logger.info('[return-reminder-today] No returns today found - nothing to send');
    return;
  }

  logger.info(`[return-reminder-today] ${uniqueCandidates.length} candidate(s) found`);

  const allRefs = uniqueCandidates.map((c) => c.bookingReference);
  const { data: sentRows, error: logErr } = await sb
    .from('return_reminder_today_log')
    .select('booking_reference')
    .in('booking_reference', allRefs);

  if (logErr) {
    logger.warn({ error: logErr.message }, '[return-reminder-today] dedup log query failed');
  }

  const alreadySent = new Set((sentRows ?? []).map((r) => r.booking_reference as string));

  for (const candidate of uniqueCandidates) {
    if (candidate.hasNinePmReturnAddon) {
      logger.info(
        { ref: candidate.bookingReference, orderId: candidate.orderId },
        '[return-reminder-today] 9PM return add-on found - dedicated 9PM reminder will handle this booking',
      );
      continue;
    }

    if (alreadySent.has(candidate.bookingReference)) {
      logger.info({ ref: candidate.bookingReference }, '[return-reminder-today] Already sent - skipping');
      continue;
    }

    const returnTime = formatReturnTime(candidate.dropoffDatetime);

    try {
      const result = await sendRespondIoTemplateMessage({
        phone: candidate.customerMobile,
        channelId: RETURN_REMINDER_TODAY_TEMPLATE_CHANNEL_ID,
        templateName: RETURN_REMINDER_TODAY_TEMPLATE_NAME,
        languageCode: RETURN_REMINDER_TODAY_TEMPLATE_LANGUAGE,
        bodyText: RETURN_REMINDER_TODAY_TEMPLATE_BODY,
        parameters: [candidate.customerName, returnTime],
        logContext: { ref: candidate.bookingReference },
      });

      if (result.delivered) {
        await sb.from('return_reminder_today_log').insert({
          booking_reference: candidate.bookingReference,
          sent_at: new Date().toISOString(),
        });
      }

      logger.info(
        { ref: candidate.bookingReference, delivered: result.delivered },
        result.delivered ? '[return-reminder-today] Reminder sent' : '[return-reminder-today] Reminder simulated',
      );
    } catch (err) {
      logger.warn(
        {
          ref: candidate.bookingReference,
          error: err instanceof Error ? err.message : String(err),
        },
        '[return-reminder-today] Failed to send - continuing',
      );
    }
  }

  logger.info('[return-reminder-today] Done');
}

export function startReturnReminderTodayJob(): void {
  cron.schedule(
    '0 9 * * *',
    () => { void runReturnReminderTodayJob(); },
    { timezone: 'Asia/Manila' },
  );
  logger.info('[return-reminder-today] Job scheduled (09:00 Asia/Manila)');
}
