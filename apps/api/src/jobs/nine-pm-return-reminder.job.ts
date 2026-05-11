/**
 * Daily 9PM return reminder job.
 *
 * Fires at 12:00 Asia/Manila every day.
 * Finds every active rental whose dropoff_datetime falls today
 * (Asia/Manila date boundaries) AND that has the 9PM return add-on
 * selected. Sends a single WhatsApp message via respond.io.
 *
 * Sources:
 *   1. orders_raw  — web / direct bookings (addon_ids @> ARRAY[9])
 *   2. orders + order_items + order_addons + customers — staff-created
 *
 * Deduplication: nine_pm_reminder_log prevents double-sending if
 * the job is restarted or runs more than once on the same day.
 *
 * Required env vars:
 *   RESPOND_IO_API_URL         e.g. https://app.respond.io
 *   RESPOND_IO_OUTBOUND_TOKEN  Bearer token for outbound messages
 */

import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReminderCandidate {
  bookingReference: string;
  customerName: string;
  customerMobile: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, '');

  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  if (digits.startsWith('63')) return `+${digits}`;
  return `+63${digits}`;
}

function buildMessage(customerName: string): string {
  return (
    `Hi ${customerName} 👋 Just a reminder that your vehicle is due back at 9PM tonight. ` +
    `A team member will arrive at 8:15pm so you're welcome to arrive anytime from then.\n\n` +
    `A few things to keep in mind:\n\n` +
    `🛵 Please return with a full tank of fuel\n` +
    `⏰ Please do not return at an alternative time without our acknowledgement\n` +
    `⏱ If you are more than 10 minutes late, the team will wait an additional 5 minutes — after that, the deposit will not be refunded\n` +
    `🚫 Collection & Delivery is not valid on 9PM returns\n\n` +
    `Thank you for respecting our policies — see you tonight!`
  );
}

async function sendRespondIoMessage(phone: string, text: string): Promise<void> {
  const baseUrl = process.env.RESPOND_IO_API_URL;
  const token   = process.env.RESPOND_IO_OUTBOUND_TOKEN;

  if (!baseUrl || !token) {
    throw new Error(
      'Missing RESPOND_IO_API_URL or RESPOND_IO_OUTBOUND_TOKEN environment variable',
    );
  }

  const url = `${baseUrl}/v1/contact/phone:${encodeURIComponent(phone)}/message`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: { type: 'text', text } }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`respond.io API error ${res.status}: ${body}`);
  }
}

// ── Main job ──────────────────────────────────────────────────────────────────

async function runNinePmReturnReminderJob(): Promise<void> {
  logger.info('[9pm-reminder] Running...');

  const sb = getSupabaseClient();

  // ── Build today's date window in Asia/Manila ──────────────────────────────

  const todayPHT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(new Date());

  const windowStart = `${todayPHT}T00:00:00+08:00`;
  const windowEnd   = `${todayPHT}T23:59:59.999+08:00`;

  const NINE_PM_ADDON_ID = 9;
  const RAW_STATUSES     = ['unprocessed', 'processed'] as const;
  const ACTIVE_STATUSES  = ['active', 'confirmed'] as const;

  // ── Query 1: orders_raw ───────────────────────────────────────────────────

  const { data: rawRows, error: rawErr } = await sb
    .from('orders_raw')
    .select('order_reference, customer_name, customer_mobile')
    .in('status', RAW_STATUSES)
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd)
    .contains('addon_ids', [NINE_PM_ADDON_ID]);

  if (rawErr) {
    logger.warn({ error: rawErr.message }, '[9pm-reminder] orders_raw query failed');
  }

  // ── Query 2: orders + order_items + order_addons + customers ──────────────

  // 2a. Active order_items with a dropoff today
  const { data: itemRows, error: itemErr } = await sb
    .from('order_items')
    .select(
      'order_id, orders!inner(booking_token, status, customers!inner(name, mobile))',
    )
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd)
    .in('orders.status', ACTIVE_STATUSES);

  if (itemErr) {
    logger.warn({ error: itemErr.message }, '[9pm-reminder] order_items query failed');
  }

  // 2b. Of those orders, find which have the 9PM addon
  const staffOrderIds = [
    ...new Set(
      (itemRows ?? []).map((r) => r.order_id as string).filter(Boolean),
    ),
  ];

  const ninepmOrderIds = new Set<string>();

  if (staffOrderIds.length > 0) {
    const { data: addonRows, error: addonErr } = await sb
      .from('order_addons')
      .select('order_id')
      .in('order_id', staffOrderIds)
      .or('addon_name.ilike.%9pm%,addon_name.ilike.%21:00%,addon_name.ilike.%ninepm%');

    if (addonErr) {
      logger.warn({ error: addonErr.message }, '[9pm-reminder] order_addons query failed');
    }

    for (const a of (addonRows ?? []) as Array<{ order_id: string }>) {
      ninepmOrderIds.add(a.order_id);
    }
  }

  // ── Merge results ─────────────────────────────────────────────────────────

  const candidates: ReminderCandidate[] = [];

  for (const row of rawRows ?? []) {
    const name   = (row.customer_name as string | null)?.trim();
    const mobile = (row.customer_mobile as string | null)?.trim();
    const ref    = row.order_reference as string | null;
    if (!name || !mobile || !ref) continue;
    candidates.push({ bookingReference: ref, customerName: name, customerMobile: mobile });
  }

  for (const row of itemRows ?? []) {
    if (!ninepmOrderIds.has(row.order_id as string)) continue;

    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!order) continue;

    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    if (!customer) continue;

    const name   = (customer.name as string | null)?.trim();
    const mobile = (customer.mobile as string | null)?.trim();
    const ref    = order.booking_token as string | null;
    if (!name || !mobile || !ref) continue;

    candidates.push({ bookingReference: ref, customerName: name, customerMobile: mobile });
  }

  // Deduplicate within this run (one order can have multiple order_items rows)
  const seenRefs = new Set<string>();
  const uniqueCandidates = candidates.filter((c) => {
    if (seenRefs.has(c.bookingReference)) return false;
    seenRefs.add(c.bookingReference);
    return true;
  });

  if (!uniqueCandidates.length) {
    logger.info('[9pm-reminder] No 9PM returns today — nothing to send');
    return;
  }

  logger.info(`[9pm-reminder] ${uniqueCandidates.length} candidate(s) found`);

  // ── Load already-sent references from the dedup log ──────────────────────

  const allRefs = uniqueCandidates.map((c) => c.bookingReference);
  const { data: sentRows, error: logErr } = await sb
    .from('nine_pm_reminder_log')
    .select('booking_reference')
    .in('booking_reference', allRefs);

  if (logErr) {
    logger.warn({ error: logErr.message }, '[9pm-reminder] dedup log query failed');
  }

  const alreadySent = new Set((sentRows ?? []).map((r) => r.booking_reference as string));

  // ── Send reminders ────────────────────────────────────────────────────────

  for (const candidate of uniqueCandidates) {
    if (alreadySent.has(candidate.bookingReference)) {
      logger.info(
        { ref: candidate.bookingReference },
        '[9pm-reminder] Already sent — skipping',
      );
      continue;
    }

    let phone: string;
    try {
      phone = sanitisePhone(candidate.customerMobile);
    } catch (err) {
      logger.warn(
        { ref: candidate.bookingReference, mobile: candidate.customerMobile, err },
        '[9pm-reminder] Could not sanitise phone — skipping',
      );
      continue;
    }

    const message = buildMessage(candidate.customerName);

    try {
      await sendRespondIoMessage(phone, message);

      await sb.from('nine_pm_reminder_log').insert({
        booking_reference: candidate.bookingReference,
        sent_at:           new Date().toISOString(),
      });

      logger.info(
        { ref: candidate.bookingReference, phone },
        '[9pm-reminder] Reminder sent',
      );
    } catch (err) {
      logger.warn(
        {
          ref:   candidate.bookingReference,
          phone,
          error: err instanceof Error ? err.message : String(err),
        },
        '[9pm-reminder] Failed to send reminder — continuing',
      );
    }
  }

  logger.info('[9pm-reminder] Done');
}

// ── Export ────────────────────────────────────────────────────────────────────

export function startNinePmReturnReminderJob(): void {
  cron.schedule(
    '0 12 * * *',
    () => { void runNinePmReturnReminderJob(); },
    { timezone: 'Asia/Manila' },
  );
  logger.info('[9pm-reminder] Job scheduled (12:00 Asia/Manila)');
}
