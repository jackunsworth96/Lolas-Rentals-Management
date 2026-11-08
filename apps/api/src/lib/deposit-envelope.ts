import { getSupabaseClient } from '../adapters/supabase/client.js';

/**
 * Customer security-deposit cash is kept in the till but counted separately at
 * cash-up (the "envelope" pot). The ledger mirrors that with its own asset
 * account so the till account only holds the float plus takings.
 */
export const DEPOSIT_ENVELOPE_ACCOUNT_ID = 'CASH-DEPOSIT-ENVELOPE';

/**
 * Reference type for moving cash between the envelope and the till. Cash-up
 * reads `deposit` and `refund` journal lines, so this must stay distinct.
 */
export const DEPOSIT_ENVELOPE_TRANSFER_REF = 'deposit_envelope_transfer';

const methodKey = (v: string | null | undefined) => String(v ?? '').toLowerCase().replace(/[\s_-]/g, '');

/** Physical cash tender. GCash and other wallets are not cash for the envelope. */
export function isCashMethod(methodId: string | null | undefined): boolean {
  return methodKey(methodId) === 'cash';
}

export interface StoreCashAccounts {
  /** The store's routed cash account (the till). */
  tillAccountId: string | null;
  /** Null when the store has no active deposit envelope account. */
  envelopeAccountId: string | null;
}

export interface RoutedAccounts extends StoreCashAccounts {
  /** Received-into account for a payment method, matched case-insensitively. */
  accountFor(methodId: string | null | undefined): string | null;
}

export async function resolveRoutedAccounts(storeId: string): Promise<RoutedAccounts> {
  const sb = getSupabaseClient();
  const [rulesRes, envelopeRes] = await Promise.all([
    sb.from('payment_routing_rules')
      .select('payment_method_id, received_into_account_id')
      .eq('store_id', storeId),
    sb.from('chart_of_accounts')
      .select('id')
      .eq('id', DEPOSIT_ENVELOPE_ACCOUNT_ID)
      .eq('store_id', storeId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);
  if (rulesRes.error) throw new Error(`Payment routing lookup failed: ${rulesRes.error.message}`);

  const byMethod = new Map<string, string>();
  for (const r of (rulesRes.data ?? []) as Array<{ payment_method_id: string; received_into_account_id: string | null }>) {
    if (r.received_into_account_id) byMethod.set(methodKey(r.payment_method_id), r.received_into_account_id);
  }
  return {
    tillAccountId: byMethod.get('cash') ?? null,
    envelopeAccountId: envelopeRes.data ? DEPOSIT_ENVELOPE_ACCOUNT_ID : null,
    accountFor: (methodId) => byMethod.get(methodKey(methodId)) ?? null,
  };
}

/**
 * Where held deposit money is booked: cash goes to the envelope, anything else
 * stays on the account it was received into. Without a method, an amount on
 * the till account is treated as cash.
 */
export function depositHoldingAccount(
  accountId: string,
  methodId: string | null | undefined,
  cash: StoreCashAccounts,
): string {
  if (!cash.envelopeAccountId) return accountId;
  const isCash = methodId ? isCashMethod(methodId) : accountId === cash.tillAccountId;
  return isCash ? cash.envelopeAccountId : accountId;
}
