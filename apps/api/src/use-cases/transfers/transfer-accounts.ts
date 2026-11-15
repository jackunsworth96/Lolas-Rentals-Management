import { getSupabaseClient } from '../../adapters/supabase/client.js';

export interface TransferAccounts {
  incomeAccountId: string | null;
  driverClearingAccountId: string | null;
  driverExpenseAccountId: string | null;
}

/**
 * Per-store accounts used by the transfer workflow:
 *   income          INCOME-TRANSFER-{store}, falling back to MISC-INCOME-{store}
 *   driver clearing DRIVER-CLEARING-{store} (fares the driver is holding)
 *   driver expense  EXP-TRANSFER-FEE-{store}, falling back to EXP-DRIVER-PAY
 */
export async function resolveTransferAccounts(storeId: string): Promise<TransferAccounts> {
  const sb = getSupabaseClient();
  const candidates = [
    `INCOME-TRANSFER-${storeId}`,
    `MISC-INCOME-${storeId}`,
    `DRIVER-CLEARING-${storeId}`,
    `EXP-TRANSFER-FEE-${storeId}`,
    'EXP-DRIVER-PAY',
  ];
  const { data, error } = await sb
    .from('chart_of_accounts')
    .select('id')
    .in('id', candidates)
    .eq('is_active', true);
  if (error) throw new Error(`Failed to look up transfer accounts: ${error.message}`);

  const ids = new Set((data ?? []).map((r) => r.id as string));
  const pick = (...options: string[]) => options.find((id) => ids.has(id)) ?? null;

  return {
    incomeAccountId: pick(`INCOME-TRANSFER-${storeId}`, `MISC-INCOME-${storeId}`),
    driverClearingAccountId: pick(`DRIVER-CLEARING-${storeId}`),
    driverExpenseAccountId: pick(`EXP-TRANSFER-FEE-${storeId}`, 'EXP-DRIVER-PAY'),
  };
}

export const DRIVER_COLLECTED_PAYMENT_METHOD = 'Driver Collected';
