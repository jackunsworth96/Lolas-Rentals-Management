import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { SupabaseFleetRepository } from '../adapters/supabase/fleet-repo.js';
import { batchDepreciation } from '../use-cases/fleet/batch-depreciation.js';
import { formatManilaPeriod } from '../utils/manila-date.js';
import { logger } from '../lib/logger.js';
import { getTelegramChatId, sendTelegramAlert } from '../lib/telegram.js';

interface FleetAccountingConfigRow {
  store_id: string;
  acc_depreciation_account_id: string | null;
  depreciation_expense_account_id: string | null;
}

export function previousManilaPeriod(now: Date = new Date()): string {
  const [year, month] = formatManilaPeriod(now).split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function runMonthlyDepreciation(now: Date = new Date()): Promise<void> {
  const period = previousManilaPeriod(now);
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('fleet_accounting_config')
    .select('store_id, acc_depreciation_account_id, depreciation_expense_account_id');
  if (error) throw new Error(`monthly depreciation config query failed: ${error.message}`);

  const results: string[] = [];
  for (const config of (data ?? []) as FleetAccountingConfigRow[]) {
    if (!config.acc_depreciation_account_id || !config.depreciation_expense_account_id) {
      results.push(`${config.store_id}: skipped (missing depreciation accounts)`);
      logger.warn({ storeId: config.store_id, period }, 'Monthly depreciation skipped: missing accounts');
      continue;
    }

    try {
      const result = await batchDepreciation(
        { fleetRepo: new SupabaseFleetRepository() },
        {
          storeId: config.store_id,
          period,
          depreciationExpenseAccountId: config.depreciation_expense_account_id,
          accDepreciationAccountId: config.acc_depreciation_account_id,
        },
      );
      results.push(`${config.store_id}: ${result.status} (${result.vehicleCount} vehicles)`);
      logger.info({ storeId: config.store_id, period, ...result }, 'Monthly depreciation completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push(`${config.store_id}: failed (${message})`);
      logger.error({ err, storeId: config.store_id, period }, 'Monthly depreciation failed');
    }
  }

  const chatId = getTelegramChatId('fleet');
  if (chatId && results.length > 0) {
    await sendTelegramAlert(
      `📉 <b>Monthly depreciation ${period}</b>\n${results.join('\n')}`,
      chatId,
    );
  }
}

export function startMonthlyDepreciationJob(): void {
  cron.schedule(
    '0 2 1 * *',
    () => {
      void runMonthlyDepreciation().catch((err) => {
        logger.error({ err }, 'Monthly depreciation job failed');
      });
    },
    { timezone: 'Asia/Manila' },
  );
  logger.info('Monthly depreciation scheduled for 02:00 Asia/Manila on day 1');
}
