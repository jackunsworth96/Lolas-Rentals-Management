import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate, formatManilaDateTime } from '../utils/manila-date.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';

/**
 * End-of-day fleet snapshot posted to TELEGRAM_FLEET_CHAT_ID every evening
 * at 18:00 Manila time. Shows utilisation, out-of-service vehicles, and
 * today's payment revenue so the owner can assess fleet health at a glance.
 *
 * All queries are best-effort: a failed section logs to console and the
 * remaining sections are still sent, so one bad table never silences the post.
 */
export function startFleetSummaryJob(): void {
  // Fleet summary is now fired by evening-trigger.ts — either immediately when
  // cash-up is reconciled, or at 18:00 Manila as a fallback. No standalone cron
  // is needed here.
  console.log('[fleet-summary] Managed by evening-trigger (cash-up reconciled or 18:00 fallback)');
}

export async function runFleetSummary(): Promise<void> {
  console.log('[fleet-summary] Running...');
  try {
    const chatId = getTelegramChatId('fleet');
    if (!chatId) {
      console.warn('[fleet-summary] TELEGRAM_FLEET_CHAT_ID missing — skipping report');
      return;
    }

    const sb = getSupabaseClient();
    const now = new Date();
    const todayStr = formatManilaDate(now);

    // ── 1. Fleet status snapshot ──────────────────────────────────────────────
    type FleetRow = {
      id: string;
      name: string;
      plate_number: string | null;
      model_id: string | null;
      store_id: string;
      status: string;
      updated_at: string | null;
    };

    let fleetRows: FleetRow[] = [];
    try {
      const { data, error } = await sb
        .from('fleet')
        .select('id, name, plate_number, model_id, store_id, status, updated_at')
        .order('name');
      if (error) throw new Error(error.message);
      fleetRows = (data ?? []) as FleetRow[];
    } catch (err) {
      console.error('[fleet-summary] fleet query failed:', err);
    }

    // Resolve model names in one query
    const modelIds = [...new Set(fleetRows.map((v) => v.model_id).filter(Boolean))] as string[];
    const modelNameMap = new Map<string, string>();
    if (modelIds.length > 0) {
      try {
        const { data: models } = await sb
          .from('vehicle_models')
          .select('id, name')
          .in('id', modelIds);
        for (const m of (models ?? []) as Array<{ id: string; name: string }>) {
          modelNameMap.set(m.id, m.name);
        }
      } catch (err) {
        console.error('[fleet-summary] vehicle_models query failed:', err);
      }
    }

    // Count statuses (exclude Sold/Closed as they are permanently off-fleet)
    const EXCLUDED_STATUSES = new Set(['Sold', 'Closed']);
    const activeVehicles   = fleetRows.filter((v) => !EXCLUDED_STATUSES.has(v.status) && v.status === 'Active');
    const availableVehicles = fleetRows.filter((v) => v.status === 'Available');
    const outOfServiceVehicles = fleetRows.filter(
      (v) => !EXCLUDED_STATUSES.has(v.status) && v.status !== 'Active' && v.status !== 'Available',
    );

    const totalRentable = activeVehicles.length + availableVehicles.length + outOfServiceVehicles.length;
    const inUseCount = activeVehicles.length;
    const availableCount = availableVehicles.length;
    const outOfServiceCount = outOfServiceVehicles.length;
    const utilisationPct = totalRentable > 0
      ? Math.round((inUseCount / totalRentable) * 100)
      : 0;

    // ── 2. Out-of-service lines with days out ────────────────────────────────
    const oosLines = outOfServiceVehicles.map((v) => {
      const plate = v.plate_number ?? v.name;
      const model = v.model_id ? (modelNameMap.get(v.model_id) ?? '—') : '—';
      let daysOut = '—';
      if (v.updated_at) {
        const msOut = now.getTime() - new Date(v.updated_at).getTime();
        const days = Math.floor(msOut / (1000 * 60 * 60 * 24));
        daysOut = days === 1 ? '1 day' : `${days} days`;
      }
      return `• ${escapeHtml(plate)} — ${escapeHtml(model)} — ${escapeHtml(v.status)} — ${escapeHtml(daysOut)}`;
    });

    // ── 3. Today's revenue from payments ─────────────────────────────────────
    let revenueToday = 0;
    try {
      const { data: payments, error: payErr } = await sb
        .from('payments')
        .select('amount')
        .eq('transaction_date', todayStr);
      if (payErr) throw new Error(payErr.message);
      revenueToday = ((payments ?? []) as Array<{ amount: number | string | null }>)
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    } catch (err) {
      console.error('[fleet-summary] payments query failed:', err);
    }

    // ── 4. Format message ────────────────────────────────────────────────────
    const dayHeader = formatManilaDateTime(now).split(',').slice(0, 2).join(',');
    const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━';

    const oosSection = oosLines.length > 0
      ? oosLines.join('\n')
      : '• All vehicles in service ✅';

    const message =
      `🛵 <b>Fleet End-of-Day Report</b>\n` +
      `📅 ${escapeHtml(dayHeader)}\n` +
      `${divider}\n` +
      `📊 <b>Utilisation</b>\n` +
      `In Use: ${inUseCount} bikes\n` +
      `Available: ${availableCount} bikes\n` +
      `Out of Service: ${outOfServiceCount} bikes\n` +
      `Utilisation rate: ${utilisationPct}%\n` +
      `${divider}\n` +
      `🔧 <b>Out of Service</b>\n` +
      `${oosSection}\n` +
      `${divider}\n` +
      `💰 <b>Revenue Today: ₱${revenueToday.toLocaleString('en-PH')}</b>\n` +
      `${divider}`;

    await sendTelegramAlert(message, chatId);
    console.log('[fleet-summary] Sent');
  } catch (err) {
    console.error('[fleet-summary] Job error:', err);
  }
}
