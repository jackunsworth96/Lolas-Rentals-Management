/**
 * Daily post-rental review request job.
 *
 * Fires at 10:00 Asia/Manila every day.
 * Finds every completed rental whose dropoff_datetime fell yesterday
 * (Asia/Manila date boundaries) and sends a WhatsApp review request
 * via the respond.io outbound API.
 *
 * Sources:
 *   1. orders_raw  — web / direct bookings (status = 'processed')
 *   2. orders + order_items + customers — staff-created bookings
 *
 * Deduplication: post_rental_review_log prevents double-sending if
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

interface ReviewCandidate {
  bookingReference: string;
  customerName: string;
  customerMobile: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalises a Philippine mobile number to E.164 format (+639XXXXXXXXX).
 * Strips spaces, dashes, and parentheses, then applies country-code rules.
 */
function sanitisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, '');

  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  if (digits.startsWith('63')) return `+${digits}`;
  return `+63${digits}`;
}

function buildMessage(customerName: string): string {
  return (
    `Hey ${customerName}! Hope you had an amazing time on Siargao 🌊\n\n` +
    `If you enjoyed your time with Lola's Rentals, a quick Google review would mean a lot to us — ` +
    `and if you snapped any photos on the road, throw them in too.\n\n` +
    `g.page/r/CXtJhZFnjqBIEBM/review\n\n` +
    `Thanks for riding with us — hope to see you back on the island! 🤙`
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

async function runPostRentalReviewJob(): Promise<void> {
  logger.info('[post-rental-review] Running...');

  const sb = getSupabaseClient();

  // ── Build yesterday's date window in Asia/Manila ──────────────────────────

  const todayPHT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(new Date());

  const yesterdayDate = new Date(`${todayPHT}T00:00:00+08:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayPHT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(yesterdayDate);

  const windowStart = `${yesterdayPHT}T00:00:00+08:00`;
  const windowEnd   = `${yesterdayPHT}T23:59:59.999+08:00`;

  // ── Query 1: orders_raw ───────────────────────────────────────────────────

  const { data: rawRows, error: rawErr } = await sb
    .from('orders_raw')
    .select('order_reference, customer_name, customer_mobile')
    .eq('status', 'processed')
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd);

  if (rawErr) {
    logger.warn({ error: rawErr.message }, '[post-rental-review] orders_raw query failed');
  }

  // ── Query 2: orders + order_items + customers ─────────────────────────────

  const { data: itemRows, error: itemErr } = await sb
    .from('order_items')
    .select(
      'dropoff_datetime, orders!inner(booking_token, status, customers!inner(name, mobile))',
    )
    .gte('dropoff_datetime', windowStart)
    .lte('dropoff_datetime', windowEnd)
    .eq('orders.status', 'completed');

  if (itemErr) {
    logger.warn({ error: itemErr.message }, '[post-rental-review] order_items query failed');
  }

  // ── Merge results ─────────────────────────────────────────────────────────

  const candidates: ReviewCandidate[] = [];

  for (const row of rawRows ?? []) {
    const name   = (row.customer_name as string | null)?.trim();
    const mobile = (row.customer_mobile as string | null)?.trim();
    const ref    = row.order_reference as string | null;
    if (!name || !mobile || !ref) continue;
    candidates.push({ bookingReference: ref, customerName: name, customerMobile: mobile });
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
    });
  }

  // Deduplicate within this run (one order can have multiple order_items rows)
  const seenRefs = new Set<string>();
  const uniqueCandidates = candidates.filter((c) => {
    if (seenRefs.has(c.bookingReference)) return false;
    seenRefs.add(c.bookingReference);
    return true;
  });

  if (!uniqueCandidates.length) {
    logger.info('[post-rental-review] No completed rentals yesterday — nothing to send');
    return;
  }

  logger.info(`[post-rental-review] ${uniqueCandidates.length} candidate(s) found`);

  // ── Load already-sent references from the dedup log ──────────────────────

  const allRefs = uniqueCandidates.map((c) => c.bookingReference);
  const { data: sentRows, error: logErr } = await sb
    .from('post_rental_review_log')
    .select('booking_reference')
    .in('booking_reference', allRefs);

  if (logErr) {
    logger.warn({ error: logErr.message }, '[post-rental-review] dedup log query failed');
  }

  const alreadySent = new Set((sentRows ?? []).map((r) => r.booking_reference as string));

  // ── Send review requests ──────────────────────────────────────────────────

  for (const candidate of uniqueCandidates) {
    if (alreadySent.has(candidate.bookingReference)) {
      logger.info(
        { ref: candidate.bookingReference },
        '[post-rental-review] Already sent — skipping',
      );
      continue;
    }

    let phone: string;
    try {
      phone = sanitisePhone(candidate.customerMobile);
    } catch (err) {
      logger.warn(
        { ref: candidate.bookingReference, mobile: candidate.customerMobile, err },
        '[post-rental-review] Could not sanitise phone — skipping',
      );
      continue;
    }

    const message = buildMessage(candidate.customerName);

    try {
      await sendRespondIoMessage(phone, message);

      await sb.from('post_rental_review_log').insert({
        booking_reference: candidate.bookingReference,
        sent_at:           new Date().toISOString(),
      });

      logger.info(
        { ref: candidate.bookingReference, phone },
        '[post-rental-review] Review request sent',
      );
    } catch (err) {
      logger.warn(
        {
          ref:   candidate.bookingReference,
          phone,
          error: err instanceof Error ? err.message : String(err),
        },
        '[post-rental-review] Failed to send — continuing',
      );
    }
  }

  logger.info('[post-rental-review] Done');
}

// ── Export ────────────────────────────────────────────────────────────────────

export function startPostRentalReviewJob(): void {
  cron.schedule(
    '0 10 * * *',
    () => { void runPostRentalReviewJob(); },
    { timezone: 'Asia/Manila' },
  );
  logger.info('[post-rental-review] Job scheduled (10:00 Asia/Manila)');
}
