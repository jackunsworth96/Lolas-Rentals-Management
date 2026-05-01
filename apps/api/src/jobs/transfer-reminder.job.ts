/**
 * Daily reminder job for unconfirmed airport transfers.
 *
 * Runs at 17:00 PHT (Asia/Manila) every day.
 * Finds all transfers where:
 *   - driver_confirmed is false (or null)
 *   - pickup_time is set
 *   - service_date is today or within the next 2 days
 *   - status is not 'cancelled'
 *
 * For each match, sends a reminder message to the driver Telegram channel
 * with a fresh Confirm button.
 */

import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { notifyReminderTransfer } from '../telegram/telegram.service.js';
import { logger } from '../lib/logger.js';

type TransferReminderRow = {
  id: string;
  customer_name: string;
  contact_number: string | null;
  route: string;
  service_date: string;
  flight_time: string | null;
  flight_number: string | null;
  van_type: string | null;
  pax_count: number;
  accommodation: string | null;
  pickup_time: string | null;
  pickup_time_end: string | null;
};

async function runTransferReminderJob(): Promise<void> {
  console.log('[transfer-reminder] Running...');
  try {
    const sb = getSupabaseClient();

    // Build a PHT "today" date string.
    const todayPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const limitDate = new Date(`${todayPHT}T00:00:00+08:00`);
    limitDate.setDate(limitDate.getDate() + 2);
    const limitPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(limitDate);

    const { data, error } = await sb
      .from('transfers')
      .select(
        'id, customer_name, contact_number, route, service_date, flight_time, flight_number, van_type, pax_count, accommodation, pickup_time, pickup_time_end',
      )
      .or('driver_confirmed.is.null,driver_confirmed.eq.false')
      .not('pickup_time', 'is', null)
      .gte('service_date', todayPHT)
      .lte('service_date', limitPHT)
      .neq('status', 'cancelled');

    if (error) {
      logger.warn({ error: error.message }, '[transfer-reminder] Query failed');
      return;
    }

    const rows = (data ?? []) as TransferReminderRow[];
    console.log(`[transfer-reminder] Found ${rows.length} unconfirmed transfer(s)`);

    for (const row of rows) {
      try {
        await notifyReminderTransfer({
          id: row.id,
          customerName: row.customer_name,
          contactNumber: row.contact_number,
          route: row.route,
          serviceDate: row.service_date,
          flightTime: row.flight_time,
          flightNumber: row.flight_number,
          vanType: row.van_type,
          paxCount: row.pax_count,
          accommodation: row.accommodation,
          pickupTime: row.pickup_time,
          pickupTimeEnd: row.pickup_time_end,
        });
      } catch (err) {
        logger.warn(
          { transferId: row.id, err: err instanceof Error ? err.message : String(err) },
          '[transfer-reminder] Failed to send reminder for transfer',
        );
      }
    }

    console.log('[transfer-reminder] Done');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[transfer-reminder] Job error',
    );
  }
}

export function startTransferReminderJob(): void {
  cron.schedule(
    '0 17 * * *',
    () => { void runTransferReminderJob(); },
    { timezone: 'Asia/Manila' },
  );
  console.log('[transfer-reminder] Job scheduled (17:00 Asia/Manila)');
}
