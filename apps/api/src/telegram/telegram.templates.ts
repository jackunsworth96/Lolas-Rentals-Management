/**
 * Pure message-string composers for driver Telegram notifications.
 * No side effects, no imports beyond Node built-ins.
 * All times are formatted in PHT (Asia/Manila, UTC+8).
 */

export interface TransferForTemplate {
  id: string;
  customerName: string;
  contactNumber: string | null;
  route: string;
  serviceDate: string;          // YYYY-MM-DD
  flightTime: string | null;    // HH:MM or ISO
  flightNumber: string | null;  // e.g. "PR123"
  vanType: string | null;
  paxCount: number;
  accommodation: string | null;
  pickupTime: string | null;    // HH:MM in PHT
  pickupTimeEnd: string | null; // HH:MM in PHT (shared van window end)
}

// ─── Shared helpers ────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatServiceDate(serviceDate: string): string {
  const d = new Date(`${serviceDate}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function formatVanType(vanType: string | null): string {
  if (!vanType) return 'Transfer';
  const map: Record<string, string> = {
    shared_van:  'Shared Van',
    private_van: 'Private Van',
    tuktuk:      'Tuk-tuk',
  };
  return map[vanType] ?? vanType;
}

/** Returns "HH:MM" or "HH:MM–HH:MM" depending on whether there is a window. */
function formatPickupWindow(from: string, to: string | null): string {
  return to ? `${from}–${to}` : from;
}

/** Formats a relative pickup time label like "today at 04:15" or "tomorrow at 04:15". */
function relativePickupLabel(serviceDate: string, pickupTime: string): string {
  const todayPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const tomorrowDate = new Date(`${todayPHT}T00:00:00+08:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(tomorrowDate);

  if (serviceDate === todayPHT) return `today at ${pickupTime}`;
  if (serviceDate === tomorrowPHT) return `tomorrow at ${pickupTime}`;
  return `${formatServiceDate(serviceDate)} at ${pickupTime}`;
}

/** Core detail block shared by all three message types. */
function detailBlock(t: TransferForTemplate): string {
  const dateStr  = escapeHtml(formatServiceDate(t.serviceDate));
  const route    = escapeHtml(t.route);
  const name     = escapeHtml(t.customerName);
  const pax      = t.paxCount;
  const phone    = escapeHtml(t.contactNumber ?? '—');
  const address  = escapeHtml(t.accommodation ?? '—');
  const pickup   = t.pickupTime
    ? escapeHtml(formatPickupWindow(t.pickupTime, t.pickupTimeEnd))
    : '(not calculated)';

  // Show flight number and time together, e.g. "PR123 | 10:00" or just "10:00".
  const flightParts: string[] = [];
  if (t.flightNumber) flightParts.push(escapeHtml(t.flightNumber));
  if (t.flightTime) flightParts.push(escapeHtml(t.flightTime));
  const flightStr = flightParts.length > 0 ? flightParts.join(' | ') : '—';

  return (
    `${dateStr} | ${route}\n` +
    `Customer: ${name}\n` +
    `Flight: ${flightStr}\n` +
    `Pickup: <b>${pickup}</b>\n` +
    `Address: ${address}\n` +
    `${pax} pax | ${phone}`
  );
}

// ─── Message builders ──────────────────────────────────────────────────────

/**
 * Message sent to the driver channel when a new transfer is confirmed.
 *
 * Format:
 *   🚐 NEW TRANSFER — [Vehicle type]
 *   [detail block]
 */
export function buildNewBookingMessage(t: TransferForTemplate): string {
  const vanStr = escapeHtml(formatVanType(t.vanType));
  return (
    `🚐 <b>NEW TRANSFER — ${vanStr}</b>\n` +
    detailBlock(t)
  );
}

/**
 * Reminder message sent at 17:00 PHT for unconfirmed upcoming transfers.
 *
 * Format:
 *   ⏰ REMINDER — unconfirmed transfer
 *   [detail block]
 *   Pickup is [relative time]
 */
export function buildReminderMessage(t: TransferForTemplate): string {
  const relative = t.pickupTime
    ? relativePickupLabel(t.serviceDate, formatPickupWindow(t.pickupTime, t.pickupTimeEnd))
    : 'time not calculated';

  return (
    `⏰ <b>REMINDER — unconfirmed transfer</b>\n` +
    detailBlock(t) +
    `\nPickup is <b>${escapeHtml(relative)}</b>`
  );
}

/**
 * Amendment message sent when a transfer's flight time is updated.
 *
 * Format:
 *   ✏️ UPDATED — [Vehicle type] [Date]
 *   NEW pickup time: [new] (was [old])
 *   [detail block]
 *   Reason: flight time changed
 */
export function buildAmendmentMessage(t: TransferForTemplate, oldPickupTime: string): string {
  const vanStr  = escapeHtml(formatVanType(t.vanType));
  const dateStr = escapeHtml(formatServiceDate(t.serviceDate));
  const newTime = t.pickupTime
    ? escapeHtml(formatPickupWindow(t.pickupTime, t.pickupTimeEnd))
    : '(not calculated)';
  const oldTime = escapeHtml(oldPickupTime);

  return (
    `✏️ <b>UPDATED — ${vanStr} ${dateStr}</b>\n` +
    `NEW pickup time: <b>${newTime}</b> (was ${oldTime})\n` +
    detailBlock(t) +
    `\nReason: flight time changed`
  );
}
