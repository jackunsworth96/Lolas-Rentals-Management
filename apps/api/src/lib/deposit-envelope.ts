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

/**
 * Reference type for cash movements caused by refunding a deposit through a
 * different tender than it was collected in: cash paid out of the till for a
 * GCash/bank deposit, or envelope cash released to the till when a cash
 * deposit is refunded by GCash/bank. Reference id is the order id. Cash-up
 * reads these legs to move the right pot, so keep them distinct from
 * `refund` and `deposit_envelope_transfer`.
 */
export const DEPOSIT_REFUND_SWAP_REF = 'deposit_refund_swap';

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

export interface RoutingRuleRow {
  payment_method_id: string;
  received_into_account_id: string | null;
}

export function buildRoutedAccounts(rules: RoutingRuleRow[], envelopeAccountId: string | null): RoutedAccounts {
  const byMethod = new Map<string, string>();
  for (const r of rules) {
    if (r.received_into_account_id) byMethod.set(methodKey(r.payment_method_id), r.received_into_account_id);
  }
  return {
    tillAccountId: byMethod.get('cash') ?? null,
    envelopeAccountId,
    accountFor: (methodId) => byMethod.get(methodKey(methodId)) ?? null,
  };
}

/**
 * The account a payment is booked into. The store's routing rule for the
 * payment method always wins; the account the client sent is only a fallback
 * for methods with no rule. Trusting the client first let a stale "payment
 * account" selection book a Cash payment to GCash (LR-1112-B40B, 12 Nov 2026),
 * which left the cash drawer short and GCash overstated in the ledger.
 */
export function resolvePaymentAccount(
  routed: Pick<RoutedAccounts, 'accountFor'>,
  methodId: string | null | undefined,
  requestedAccountId: string | null | undefined,
): string | null {
  return routed.accountFor(methodId) ?? requestedAccountId ?? null;
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
  return buildRoutedAccounts(
    (rulesRes.data ?? []) as RoutingRuleRow[],
    envelopeRes.data ? DEPOSIT_ENVELOPE_ACCOUNT_ID : null,
  );
}

export type DepositLocation = 'cash' | 'gcash' | 'bank';

/**
 * Where a held deposit physically sits. The account it was received into wins
 * over the method label, which staff sometimes pick wrongly.
 */
export function depositLocation(
  methodId: string | null | undefined,
  accountId: string | null | undefined,
  routed: RoutedAccounts,
): DepositLocation {
  if (accountId) {
    if (accountId === routed.tillAccountId || accountId === routed.envelopeAccountId) return 'cash';
    if (accountId === routed.accountFor('gcash')) return 'gcash';
    return 'bank';
  }
  const key = methodKey(methodId);
  if (key === 'cash') return 'cash';
  if (key === 'gcash' || key === 'paymaya') return 'gcash';
  return 'bank';
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
