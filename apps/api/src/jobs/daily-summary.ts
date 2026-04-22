import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate, formatManilaDateTime } from '../utils/manila-date.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';

/**
 * Daily operations snapshot posted to TELEGRAM_DAILY_CHAT_ID every morning
 * at 07:00 Manila time. Gives the owner a one-shot overview without needing
 * to open the backoffice.
 *
 * Everything in this job is best-effort: query errors are logged and the
 * partial summary is still sent where possible, so a single bad table
 * never silences the whole post.
 */
export function startDailySummaryJob(): void {
  cron.schedule(
    '0 7 * * *',
    () => {
      void runDailySummary();
    },
    { timezone: 'Asia/Manila' },
  );
  console.log('[daily-summary] Job scheduled (07:00 Asia/Manila)');
}

export async function runDailySummary(): Promise<void> {
  console.log('[daily-summary] Running...');
  try {
    const chatId = getTelegramChatId('daily');
    if (!chatId) {
      console.warn('[daily-summary] TELEGRAM_DAILY_CHAT_ID missing — skipping summary');
      return;
    }

    const sb = getSupabaseClient();
    const todayStr = formatManilaDate();                                 // YYYY-MM-DD (Manila)
    const tomorrowDate = new Date(`${todayStr}T00:00:00+08:00`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrowStr = formatManilaDate(tomorrowDate);

    const todayStart    = `${todayStr}T00:00:00+08:00`;
    const todayEnd      = `${todayStr}T23:59:59.999+08:00`;
    const tomorrowStart = `${tomorrowStr}T00:00:00+08:00`;
    const tomorrowEnd   = `${tomorrowStr}T23:59:59.999+08:00`;

    // 1. Active orders count + outstanding balances
    let activeCount = 0;
    let outstandingBalance = 0;
    try {
      const { data: activeOrders, error } = await sb
        .from('orders')
        .select('id, balance_due')
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      const rows = (activeOrders ?? []) as Array<{ id: string; balance_due: number | string | null }>;
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

    // 3. Orders returning today (Manila)
    type ReturningRow = {
      order_id: string;
      vehicle_name: string | null;
      dropoff_datetime: string;
    };
    let returningLines: string[] = [];
    try {
      const { data: items, error: itemsErr } = await sb
        .from('order_items')
        .select('order_id, vehicle_name, dropoff_datetime')
        .gte('dropoff_datetime', todayStart)
        .lte('dropoff_datetime', todayEnd);
      if (itemsErr) throw new Error(itemsErr.message);

      const rows = (items ?? []) as ReturningRow[];
      const orderIds = [...new Set(rows.map((r) => r.order_id))];

      let activeOrderMap = new Map<string, { customer_id: string; booking_token: string | null }>();
      if (orderIds.length > 0) {
        const { data: orders } = await sb
          .from('orders')
          .select('id, customer_id, booking_token, status')
          .in('id', orderIds)
          .eq('status', 'active');
        for (const o of (orders ?? []) as Array<{ id: string; customer_id: string; booking_token: string | null }>) {
          activeOrderMap.set(o.id, { customer_id: o.customer_id, booking_token: o.booking_token });
        }
      }

      const custIds = [...new Set([...activeOrderMap.values()].map((o) => o.customer_id).filter(Boolean))];
      const custNameMap = new Map<string, string>();
      if (custIds.length > 0) {
        const { data: custs } = await sb.from('customers').select('id, name').in('id', custIds);
        for (const c of (custs ?? []) as Array<{ id: string; name: string | null }>) {
          custNameMap.set(c.id, c.name ?? '—');
        }
      }

      returningLines = rows
        .filter((r) => activeOrderMap.has(r.order_id))
        .sort((a, b) => (a.dropoff_datetime < b.dropoff_datetime ? -1 : 1))
        .map((r) => {
          const meta = activeOrderMap.get(r.order_id)!;
          const ref = meta.booking_token ?? '—';
          const name = custNameMap.get(meta.customer_id) ?? '—';
          const vehicle = r.vehicle_name ?? '—';
          const time = new Date(r.dropoff_datetime).toLocaleTimeString('en-PH', {
            timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
          });
          return `• ${escapeHtml(ref)} — ${escapeHtml(name)} — ${escapeHtml(vehicle)} — ${escapeHtml(time)}`;
        });
    } catch (err) {
      console.error('[daily-summary] returning-today query failed:', err);
    }

    // 4. Tomorrow's availability by vehicle model
    //    Pool = vehicles with status in ('Available','Active').
    //    Rented tomorrow = distinct vehicle_id in order_items that overlap
    //    tomorrow's Manila day window, on an active order.
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

      // Rented tomorrow
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

      // Group fleet by model
      const totalByModel = new Map<string, number>();
      const rentedByModel = new Map<string, number>();
      for (const v of (fleet ?? []) as Array<{ id: string; model_id: string | null; status: string }>) {
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

    // ── Format message ──
    const dayHeader = formatManilaDateTime(new Date()).split(',').slice(0, 2).join(',');
    const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━';

    const returningSection = returningLines.length > 0
      ? returningLines.join('\n')
      : '• None scheduled';

    const availabilitySection = availabilityLines.length > 0
      ? availabilityLines.join('\n')
      : '• No model data';

    const message =
      `🌅 <b>Good morning! Lola's Daily Summary</b>\n` +
      `📅 ${escapeHtml(dayHeader)}\n` +
      `${divider}\n` +
      `🛵 Active rentals: ${activeCount}\n` +
      `📥 Inbox (unprocessed): ${inboxCount}\n` +
      `💰 Outstanding balances: ₱${outstandingBalance.toLocaleString('en-PH')}\n` +
      `${divider}\n` +
      `<b>Returning today:</b>\n` +
      `${returningSection}\n` +
      `${divider}\n` +
      `<b>Tomorrow's availability:</b>\n` +
      `${availabilitySection}\n` +
      `${divider}\n` +
      `Have a great day! 🐾`;

    await sendTelegramAlert(message, chatId);
    console.log('[daily-summary] Sent');
  } catch (err) {
    console.error('[daily-summary] Job error:', err);
  }
}
