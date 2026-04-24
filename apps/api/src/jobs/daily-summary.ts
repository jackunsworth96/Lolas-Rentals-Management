import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate, formatManilaDateTime } from '../utils/manila-date.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';
import { triggerEveningNotifications } from './evening-trigger.js';

// ─── Shared helpers ────────────────────────────────────────────────────────

function manilaHour(isoString: string): number {
  return new Date(
    new Date(isoString).toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
  ).getHours();
}

function formatBalanceLine(balanceDue: number | string | null): string {
  const n = Number(balanceDue ?? 0);
  if (n <= 0) return '';
  return ` — Balance: ₱${n.toLocaleString('en-PH')}`;
}

function formatDropoffTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function buildDateWindow(dateStr: string) {
  return {
    start: `${dateStr}T00:00:00+08:00`,
    end: `${dateStr}T23:59:59.999+08:00`,
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────

type ReturningRow = {
  order_id: string;
  vehicle_name: string | null;
  dropoff_datetime: string;
  dropoff_location: string | null;
};

type OrderMeta = {
  customer_id: string;
  booking_token: string | null;
  balance_due: number | null;
  dropoff_location_note: string | null;
};

// ─── Shared query: returning orders for a given date window ────────────────

async function fetchReturnsForDate(dateStr: string): Promise<{
  lines: Array<{
    ref: string;
    name: string;
    vehicle: string;
    time: string;
    location: string;
    note: string | null;
    balanceDue: number;
    hour: number;
  }>;
}> {
  const sb = getSupabaseClient();
  const { start, end } = buildDateWindow(dateStr);

  const { data: items, error: itemsErr } = await sb
    .from('order_items')
    .select('order_id, vehicle_name, dropoff_datetime, dropoff_location')
    .gte('dropoff_datetime', start)
    .lte('dropoff_datetime', end);

  if (itemsErr) throw new Error(itemsErr.message);

  const rows = (items ?? []) as ReturningRow[];
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  if (orderIds.length === 0) return { lines: [] };

  const { data: orders } = await sb
    .from('orders')
    .select('id, customer_id, booking_token, balance_due, dropoff_location_note, status')
    .in('id', orderIds)
    .eq('status', 'active');

  const orderMap = new Map<string, OrderMeta>();
  for (const o of (orders ?? []) as Array<{ id: string; customer_id: string; booking_token: string | null; balance_due: number | null; dropoff_location_note: string | null }>) {
    orderMap.set(o.id, {
      customer_id: o.customer_id,
      booking_token: o.booking_token,
      balance_due: o.balance_due,
      dropoff_location_note: o.dropoff_location_note,
    });
  }

  const custIds = [...new Set([...orderMap.values()].map((o) => o.customer_id).filter(Boolean))];
  const custNameMap = new Map<string, string>();
  if (custIds.length > 0) {
    const { data: custs } = await sb.from('customers').select('id, name').in('id', custIds);
    for (const c of (custs ?? []) as Array<{ id: string; name: string | null }>) {
      custNameMap.set(c.id, c.name ?? '—');
    }
  }

  const lines = rows
    .filter((r) => orderMap.has(r.order_id))
    .sort((a, b) => (a.dropoff_datetime < b.dropoff_datetime ? -1 : 1))
    .map((r) => {
      const meta = orderMap.get(r.order_id)!;
      return {
        ref: meta.booking_token ?? '—',
        name: custNameMap.get(meta.customer_id) ?? '—',
        vehicle: r.vehicle_name ?? '—',
        time: formatDropoffTime(r.dropoff_datetime),
        location: r.dropoff_location ?? 'Lola\'s Rentals',
        note: meta.dropoff_location_note ?? null,
        balanceDue: Number(meta.balance_due ?? 0),
        hour: manilaHour(r.dropoff_datetime),
      };
    });

  return { lines };
}

function formatReturnLine(r: { ref: string; name: string; vehicle: string; time: string; location: string; note: string | null; balanceDue: number }): string {
  const locPart = r.note
    ? `${escapeHtml(r.location)} (${escapeHtml(r.note)})`
    : escapeHtml(r.location);
  const balancePart = formatBalanceLine(r.balanceDue);
  return `• ${escapeHtml(r.ref)} — ${escapeHtml(r.name)} — ${escapeHtml(r.vehicle)} — ${escapeHtml(r.time)}\n  📍 ${locPart}${balancePart}`;
}

// ─── 7 AM morning briefing ─────────────────────────────────────────────────

export function startDailySummaryJob(): void {
  // Morning briefing: active counts + today's returns (with 9 PM called out)
  cron.schedule(
    '0 7 * * *',
    () => { void runMorningSummary(); },
    { timezone: 'Asia/Manila' },
  );

  // End-of-day fallback: fires at 18:00 only if cash-up was never reconciled.
  // The primary trigger is POST /cashup/reconcile via evening-trigger.ts.
  cron.schedule(
    '0 18 * * *',
    () => { void triggerEveningNotifications('fallback'); },
    { timezone: 'Asia/Manila' },
  );

  console.log('[daily-summary] Jobs scheduled (07:00 morning + 18:00 fallback, Asia/Manila)');
}

export async function runMorningSummary(): Promise<void> {
  console.log('[daily-summary] Running morning summary...');
  try {
    const chatId = getTelegramChatId('daily');
    if (!chatId) {
      console.warn('[daily-summary] TELEGRAM_DAILY_CHAT_ID missing — skipping morning summary');
      return;
    }

    const sb = getSupabaseClient();
    const todayStr = formatManilaDate();
    const timestamp = formatManilaDateTime(new Date());

    // 1. Active orders count + outstanding balances
    let activeCount = 0;
    let outstandingBalance = 0;
    try {
      const { data: activeOrders, error } = await sb
        .from('orders')
        .select('id, balance_due')
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      const rows = (activeOrders ?? []) as Array<{ balance_due: number | string | null }>;
      activeCount = rows.length;
      outstandingBalance = rows.reduce((sum, r) => sum + Number(r.balance_due ?? 0), 0);
    } catch (err) {
      console.error('[daily-summary] active orders query failed:', err);
    }

    // 2. Inbox (unprocessed) count
    let inboxCount = 0;
    try {
      const { count, error } = await sb
        .from('orders_raw')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'unprocessed');
      if (error) throw new Error(error.message);
      inboxCount = count ?? 0;
    } catch (err) {
      console.error('[daily-summary] inbox count query failed:', err);
    }

    // 3. Today's returns (all) + 9 PM called out separately
    let allReturnLines: string[] = [];
    let eveningReturnLines: string[] = [];
    let eveningCount = 0;
    try {
      const { lines } = await fetchReturnsForDate(todayStr);
      allReturnLines = lines.map(formatReturnLine);
      const eveningReturns = lines.filter((r) => r.hour >= 21);
      eveningCount = eveningReturns.length;
      eveningReturnLines = eveningReturns.map(formatReturnLine);
    } catch (err) {
      console.error('[daily-summary] returning-today query failed:', err);
    }

    const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━';
    const dayHeader = formatManilaDateTime(new Date()).split(',').slice(0, 2).join(',');

    const returningSection = allReturnLines.length > 0
      ? allReturnLines.join('\n')
      : '• None scheduled';

    const eveningSection = eveningReturnLines.length > 0
      ? eveningReturnLines.join('\n')
      : '• None';

    const message =
      `🌅 <b>Good morning! Lola's Daily Briefing</b>\n` +
      `📅 ${escapeHtml(dayHeader)}\n` +
      `${divider}\n` +
      `🛵 Active rentals: ${activeCount}\n` +
      `📥 Inbox (unprocessed): ${inboxCount}\n` +
      `💰 Outstanding balances: ₱${outstandingBalance.toLocaleString('en-PH')}\n` +
      `${divider}\n` +
      `<b>Returns today:</b>\n` +
      `${returningSection}\n` +
      `${divider}\n` +
      `<b>🌙 9 PM returns tonight (${eveningCount}):</b>\n` +
      `${eveningSection}\n` +
      `${divider}\n` +
      `🕐 ${escapeHtml(timestamp)}\n` +
      `Have a great day! 🐾`;

    await sendTelegramAlert(message, chatId);
    console.log('[daily-summary] Morning summary sent');
  } catch (err) {
    console.error('[daily-summary] Morning job error:', err);
  }
}

// ─── 6 PM end-of-day snapshot ──────────────────────────────────────────────

export async function runEveningSnapshot(): Promise<void> {
  console.log('[daily-summary] Running evening snapshot...');
  try {
    const chatId = getTelegramChatId('daily');
    if (!chatId) {
      console.warn('[daily-summary] TELEGRAM_DAILY_CHAT_ID missing — skipping evening snapshot');
      return;
    }

    const sb = getSupabaseClient();
    const todayStr = formatManilaDate();
    const tomorrowDate = new Date(`${todayStr}T00:00:00+08:00`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrowStr = formatManilaDate(tomorrowDate);
    const timestamp = formatManilaDateTime(new Date());

    // 1. Tonight's 9 PM returns — final confirmed count
    let eveningCount = 0;
    let eveningLines: string[] = [];
    try {
      const { lines } = await fetchReturnsForDate(todayStr);
      const eveningReturns = lines.filter((r) => r.hour >= 21);
      eveningCount = eveningReturns.length;
      eveningLines = eveningReturns.map(formatReturnLine);
    } catch (err) {
      console.error('[daily-summary] tonight 9pm query failed:', err);
    }

    // 2. Tomorrow's returns (with location + note + balance)
    let tomorrowReturnLines: string[] = [];
    try {
      const { lines } = await fetchReturnsForDate(tomorrowStr);
      tomorrowReturnLines = lines.map(formatReturnLine);
    } catch (err) {
      console.error('[daily-summary] tomorrow returns query failed:', err);
    }

    // 3. Tomorrow's availability by vehicle model
    const { start: tomorrowStart, end: tomorrowEnd } = buildDateWindow(tomorrowStr);
    let availabilityLines: string[] = [];
    try {
      const { data: models, error: modelsErr } = await sb
        .from('vehicle_models')
        .select('id, name');
      if (modelsErr) throw new Error(modelsErr.message);

      const { data: fleet, error: fleetErr } = await sb
        .from('fleet')
        .select('id, model_id, status')
        .in('status', ['Available', 'Active']);
      if (fleetErr) throw new Error(fleetErr.message);

      const { data: itemsTomorrow } = await sb
        .from('order_items')
        .select('vehicle_id, order_id, pickup_datetime, dropoff_datetime')
        .lte('pickup_datetime', tomorrowEnd)
        .gte('dropoff_datetime', tomorrowStart);

      const tomorrowOrderIds = [
        ...new Set(((itemsTomorrow ?? []) as Array<{ order_id: string }>).map((r) => r.order_id)),
      ];
      const activeOrderIds = new Set<string>();
      if (tomorrowOrderIds.length > 0) {
        const { data: ord } = await sb
          .from('orders')
          .select('id, status')
          .in('id', tomorrowOrderIds)
          .eq('status', 'active');
        for (const o of (ord ?? []) as Array<{ id: string }>) activeOrderIds.add(o.id);
      }

      const rentedVehicleIds = new Set<string>();
      for (const r of (itemsTomorrow ?? []) as Array<{ vehicle_id: string | null; order_id: string }>) {
        if (r.vehicle_id && activeOrderIds.has(r.order_id)) {
          rentedVehicleIds.add(r.vehicle_id);
        }
      }

      const totalByModel = new Map<string, number>();
      const rentedByModel = new Map<string, number>();
      for (const v of (fleet ?? []) as Array<{ id: string; model_id: string | null }>) {
        if (!v.model_id) continue;
        totalByModel.set(v.model_id, (totalByModel.get(v.model_id) ?? 0) + 1);
        if (rentedVehicleIds.has(v.id)) {
          rentedByModel.set(v.model_id, (rentedByModel.get(v.model_id) ?? 0) + 1);
        }
      }

      const modelNameMap = new Map<string, string>();
      for (const m of (models ?? []) as Array<{ id: string; name: string }>) {
        modelNameMap.set(m.id, m.name);
      }

      availabilityLines = [...totalByModel.entries()]
        .map(([modelId, total]) => {
          const rented = rentedByModel.get(modelId) ?? 0;
          const available = Math.max(0, total - rented);
          const name = modelNameMap.get(modelId) ?? modelId;
          return { name, available };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => `• ${escapeHtml(r.name)}: ${r.available} available`);
    } catch (err) {
      console.error('[daily-summary] availability query failed:', err);
    }

    const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━';

    const eveningSection = eveningLines.length > 0
      ? eveningLines.join('\n')
      : '• None';

    const tomorrowReturnsSection = tomorrowReturnLines.length > 0
      ? tomorrowReturnLines.join('\n')
      : '• None scheduled';

    const availabilitySection = availabilityLines.length > 0
      ? availabilityLines.join('\n')
      : '• No model data';

    const message =
      `🌆 <b>Lola's End-of-Day Snapshot</b>\n` +
      `${divider}\n` +
      `<b>🌙 9 PM returns tonight — final count: ${eveningCount}</b>\n` +
      `${eveningSection}\n` +
      `${divider}\n` +
      `<b>Returns tomorrow:</b>\n` +
      `${tomorrowReturnsSection}\n` +
      `${divider}\n` +
      `<b>Tomorrow's availability:</b>\n` +
      `${availabilitySection}\n` +
      `${divider}\n` +
      `🕐 ${escapeHtml(timestamp)}\n` +
      `Good evening! 🐾`;

    await sendTelegramAlert(message, chatId);
    console.log('[daily-summary] Evening snapshot sent');
  } catch (err) {
    console.error('[daily-summary] Evening job error:', err);
  }
}

// Keep the old export name so anything that imported runDailySummary still compiles.
export { runMorningSummary as runDailySummary };
