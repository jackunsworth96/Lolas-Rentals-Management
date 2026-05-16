/**
 * Daily return reminder job.
 *
 * Fires at 09:00 Asia/Manila every day.
 * Finds every active rental whose dropoff_datetime falls tomorrow
 * (Asia/Manila date boundaries) and sends a WhatsApp message via
 * the respond.io outbound API.
 *
 * Sources:
 *   1. orders_raw  — web / direct / walk-in bookings
 *   2. orders + order_items + customers — staff-created bookings
 *
 * Deduplication: return_reminder_log prevents double-sending if
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
  dropoffDatetime: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalises a Philippine mobile number to E.164 format (+639XXXXXXXXX).
 * Strips spaces, dashes, and parentheses, then applies country-code rules.
 */
function sanitisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, '');

  if (digits.startsWith('+')) return digits;           // already E.164
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`; // 09XX → +639XX
  if (digits.startsWith('63')) return `+${digits}`;   // 639XX → +639XX
  return `+63${digits}`;                               // bare 9XX → +639XX
}

function formatReturnTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function buildMessage(customerName: string, returnTime: string): string {
  return (
    `Hi ${customerName} 👋 Just a reminder that your Lola's Rentals vehicle is due back tomorrow at ${returnTime}.\n\n` +
    `If you'd like to extend your rental, just reply here and our team will sort it out for you.\n\n` +
    `Heading to the airport after? Book a transfer in advance at lolasrentals.com/book/transfers 🛺\n\n` +
    `See you tomorrow!`
  );
}

async function sendRespondIoMessage(phone: string, text: string): Promise<void> {
  const baseUrl = process.env.RESPOND_IO_API_URL;
  const token = process.env.RESPOND_IO_OUTBOUND_TOKEN;

  if (!baseUrl || !token) {
    throw new Error(
      'Missing RESPOND_IO_API_URL or RESPOND_IO_OUTBOUND_TOKEN environment variable',
    );
  }

  const url = `${baseUrl}/v2/contact/phone:${encodeURIComponent(phone)}/message`;

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

async function runReturnReminderJob(): Promise<void> {
  logger.info('[return-reminder] Running...');

  const sb = getSupabaseClient();

  // ── Build tomorrow's date window in Asia/Manila ───────────────────────────

  const todayPHT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(new Date());

  const tomorrowDate = new Date(`${todayPHT}T00:00:00+08:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowPHT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(tomorrowDate);

  const windowStart = `${tomorrowPHT}T00:00:00+08:00`;
  const windowEnd   = `${tomorrowPHT}T23:59:59.999+08:00`;

  const ACTIVE_STATUSES = ['active', 'confirmed'] as const;

  // ── Query 1: orders_raw ───────────────────────────────────────────────────

  const { data: rawRows, error: rawErr } = await sb
    .from('orders_raw')
    .select('order_reference, customer_name, customer_mobile, dropoff_datetime')
    .in('status', ACTIVE_STATUSES)
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd);

  if (rawErr) {
    logger.warn({ error: rawErr.message }, '[return-reminder] orders_raw query failed');
  }

  // ── Query 2: orders + order_items + customers ─────────────────────────────

  const { data: itemRows, error: itemErr } = await sb
    .from('order_items')
    .select(
      'dropoff_datetime, orders!inner(booking_token, status, customers!inner(name, mobile))',
    )
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd)
    .in('orders.status', ACTIVE_STATUSES);

  if (itemErr) {
    logger.warn({ error: itemErr.message }, '[return-reminder] order_items query failed');
  }

  // ── Merge results ─────────────────────────────────────────────────────────

  const candidates: ReminderCandidate[] = [];

  for (const row of rawRows ?? []) {
    const name   = (row.customer_name as string | null)?.trim();
    const mobile = (row.customer_mobile as string | null)?.trim();
    const ref    = row.order_reference as string | null;
    if (!name || !mobile || !ref) continue;
    candidates.push({
      bookingReference: ref,
      customerName:     name,
      customerMobile:   mobile,
      dropoffDatetime:  row.dropoff_datetime as string,
    });
  }

  for (const row of itemRows ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!order) continue;
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    if (!customer) continue;

    const name   = (customer.name as string | null)?.trim();
    const mobile = (customer.mobile as string | null)?.trim();
    const ref    = order.booking_token as string | null;
    if (!name || !mobile || !ref) continue;

    candidates.push({
      bookingReference: ref,
      customerName:     name,
      customerMobile:   mobile,
      dropoffDatetime:  row.dropoff_datetime as string,
    });
  }

  if (!candidates.length) {
    logger.info('[return-reminder] No upcoming returns found — nothing to send');
    return;
  }

  logger.info(`[return-reminder] ${candidates.length} candidate(s) found`);

  // ── Load already-sent references from the dedup log ──────────────────────

  const allRefs = candidates.map((c) => c.bookingReference);
  const { data: sentRows, error: logErr } = await sb
    .from('return_reminder_log')
    .select('booking_reference')
    .in('booking_reference', allRefs);

  if (logErr) {
    logger.warn({ error: logErr.message }, '[return-reminder] dedup log query failed');
  }

  const alreadySent = new Set((sentRows ?? []).map((r) => r.booking_reference as string));

  // ── Send reminders ────────────────────────────────────────────────────────

  for (const candidate of candidates) {
    if (alreadySent.has(candidate.bookingReference)) {
      logger.info(
        { ref: candidate.bookingReference },
        '[return-reminder] Already sent — skipping',
      );
      continue;
    }

    let phone: string;
    try {
      phone = sanitisePhone(candidate.customerMobile);
    } catch (err) {
      logger.warn(
        { ref: candidate.bookingReference, mobile: candidate.customerMobile, err },
        '[return-reminder] Could not sanitise phone — skipping',
      );
      continue;
    }

    const returnTime = formatReturnTime(candidate.dropoffDatetime);
    const message    = buildMessage(candidate.customerName, returnTime);

    try {
      await sendRespondIoMessage(phone, message);

      await sb.from('return_reminder_log').insert({
        booking_reference: candidate.bookingReference,
        sent_at:           new Date().toISOString(),
      });

      logger.info(
        { ref: candidate.bookingReference, phone },
        '[return-reminder] Reminder sent',
      );
    } catch (err) {
      logger.warn(
        {
          ref:   candidate.bookingReference,
          phone,
          error: err instanceof Error ? err.message : String(err),
        },
        '[return-reminder] Failed to send reminder — continuing',
      );
    }
  }

  logger.info('[return-reminder] Done');
}

// ── Export ────────────────────────────────────────────────────────────────────

export function startReturnReminderJob(): void {
  cron.schedule(
    '0 9 * * *',
    () => { void runReturnReminderJob(); },
    { timezone: 'Asia/Manila' },
  );
  logger.info('[return-reminder] Job scheduled (09:00 Asia/Manila)');
}
