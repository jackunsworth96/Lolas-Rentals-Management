/**
 * Coordinates the end-of-day Telegram notifications (evening snapshot +
 * fleet summary) so they fire exactly once per calendar day in Manila time.
 *
 * Primary trigger: cash-up reconciliation (POST /cashup/reconcile).
 * Fallback trigger: 18:00 Asia/Manila cron in daily-summary.ts, in case the
 * day is never reconciled.
 *
 * Dynamic imports are used when calling runEveningSnapshot / runFleetSummary
 * to avoid circular module dependencies.
 */

import { formatManilaDate, formatManilaDateTime } from '../utils/manila-date.js';

const sentDates = new Set<string>();

export function hasEveningBeenSentToday(): boolean {
  return sentDates.has(formatManilaDate());
}

export async function triggerEveningNotifications(
  source: 'cashup' | 'fallback',
): Promise<void> {
  const today = formatManilaDate();

  if (sentDates.has(today)) {
    console.log(
      `[evening-trigger] Already sent for ${today} — skipping (source: ${source})`,
    );
    return;
  }

  // Mark before awaiting to prevent a race if two calls arrive simultaneously.
  sentDates.add(today);

  // Keep at most 7 days in memory.
  if (sentDates.size > 7) {
    const oldest = [...sentDates].sort()[0];
    sentDates.delete(oldest);
  }

  const label = source === 'cashup' ? 'cash-up reconciled' : '18:00 fallback';
  console.log(
    `[evening-trigger] Firing evening notifications at ${formatManilaDateTime(new Date())} (${label})`,
  );

  const [{ runEveningSnapshot }, { runFleetSummary }] = await Promise.all([
    import('./daily-summary.js'),
    import('./fleet-summary.js'),
  ]);

  await Promise.allSettled([runEveningSnapshot(), runFleetSummary()]);

  console.log('[evening-trigger] Evening notifications complete');
}
