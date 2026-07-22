/**
 * Daily post-rental review request job.
 *
 * Fires at 10:00 Asia/Manila every day.
 * Finds every completed rental whose dropoff_datetime fell yesterday
 * (Asia/Manila date boundaries) and sends a WhatsApp template review request
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
import { sendRespondIoTemplateMessage } from '../services/respond-io-outbound.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewCandidate {
  bookingReference: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string | null;
  customerId: string | null;
  whatsappReviewOptOut: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const POST_RENTAL_REVIEW_TEMPLATE_CHANNEL_ID = Number(
  process.env.RESPOND_IO_POST_RENTAL_REVIEW_CHANNEL_ID
    ?? process.env.RESPOND_IO_WHATSAPP_CHANNEL_ID
    ?? 501809,
);
const POST_RENTAL_REVIEW_TEMPLATE_NAME =
  process.env.RESPOND_IO_POST_RENTAL_REVIEW_TEMPLATE_NAME ?? 'post_rental_review';
const POST_RENTAL_REVIEW_TEMPLATE_LANGUAGE =
  process.env.RESPOND_IO_POST_RENTAL_REVIEW_TEMPLATE_LANGUAGE ?? 'en';
const POST_RENTAL_REVIEW_TEMPLATE_BODY =
  "Hey {{1}}! Hope you had an amazing time on Siargao 🌊\n\n" +
  "If you enjoyed your time with Lola's Rentals, a quick Google review would mean a lot to us — " +
  "and if you snapped any photos on the road, throw them in too.\n\n" +
  "g.page/r/CXtJhZFnjqBIEBM/review\n\n" +
  "Thanks for riding with us — hope to see you back on the island! 🤙";

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

// ── Main job ──────────────────────────────────────────────────────────────────

export async function runPostRentalReviewJob(): Promise<void> {
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
    .select('order_reference, customer_name, customer_email, customer_mobile')
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
      'dropoff_datetime, orders!inner(booking_token, status, customer_id, customers!inner(name, email, mobile, whatsapp_review_opt_out))',
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
    const email  = (row.customer_email as string | null)?.trim() || null;
    const ref    = row.order_reference as string | null;
    if (!name || !mobile || !ref) continue;
    candidates.push({
      bookingReference: ref,
      customerName: name,
      customerMobile: mobile,
      customerEmail: email,
      customerId: null,
      whatsappReviewOptOut: false,
    });
  }

  for (const row of itemRows ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!order) continue;
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    if (!customer) continue;

    const name   = (customer.name as string | null)?.trim();
    const mobile = (customer.mobile as string | null)?.trim();
    const email  = (customer.email as string | null)?.trim() || null;
    const ref    = order.booking_token as string | null;
    if (!name || !mobile || !ref) continue;

    candidates.push({
      bookingReference: ref,
      customerName:     name,
      customerMobile:   mobile,
      customerEmail:    email,
      customerId:       (order.customer_id as string | null) ?? null,
      whatsappReviewOptOut: Boolean(customer.whatsapp_review_opt_out),
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

    if (candidate.whatsappReviewOptOut) {
      logger.info(
        { ref: candidate.bookingReference, customerId: candidate.customerId },
        '[post-rental-review] Customer opted out — skipping',
      );
      continue;
    }

    if (!candidate.customerId && (candidate.customerEmail || candidate.customerMobile)) {
      let optOutQuery = sb
        .from('customers')
        .select('id, whatsapp_review_opt_out')
        .limit(1);

      if (candidate.customerEmail) {
        optOutQuery = optOutQuery.ilike('email', escapeIlike(candidate.customerEmail));
      } else {
        optOutQuery = optOutQuery.ilike('mobile', escapeIlike(candidate.customerMobile));
      }

      const { data: customerRows, error: customerErr } = await optOutQuery;
      if (customerErr) {
        logger.warn(
          { ref: candidate.bookingReference, error: customerErr.message },
          '[post-rental-review] Customer opt-out lookup failed - defaulting to send',
        );
      }

      const matchedCustomer = (customerRows ?? [])[0] as
        | { id: string; whatsapp_review_opt_out?: boolean | null }
        | undefined;
      if (matchedCustomer?.whatsapp_review_opt_out) {
        logger.info(
          { ref: candidate.bookingReference, customerId: matchedCustomer.id },
          '[post-rental-review] Matched raw customer opted out — skipping',
        );
        continue;
      }
    }

    try {
      const result = await sendRespondIoTemplateMessage({
        phone: candidate.customerMobile,
        channelId: POST_RENTAL_REVIEW_TEMPLATE_CHANNEL_ID,
        templateName: POST_RENTAL_REVIEW_TEMPLATE_NAME,
        languageCode: POST_RENTAL_REVIEW_TEMPLATE_LANGUAGE,
        bodyText: POST_RENTAL_REVIEW_TEMPLATE_BODY,
        parameters: [candidate.customerName],
        logContext: { ref: candidate.bookingReference },
      });

      if (result.delivered) {
        await sb.from('post_rental_review_log').insert({
          booking_reference: candidate.bookingReference,
          sent_at:           new Date().toISOString(),
        });
      }

      logger.info(
        { ref: candidate.bookingReference, delivered: result.delivered },
        result.delivered
          ? '[post-rental-review] Review request sent'
          : '[post-rental-review] Review request simulated',
      );
    } catch (err) {
      logger.warn(
        {
          ref:   candidate.bookingReference,
          phone: candidate.customerMobile,
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
