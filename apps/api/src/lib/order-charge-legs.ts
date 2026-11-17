import { Money, type JournalLeg } from '@lolas/domain';
import { resolveStoreAccounts } from '../adapters/supabase/maintenance-expense-rpc.js';

export interface OrderChargeAccounts {
  receivableAccountId: string;
  incomeAccountId: string;
}

/**
 * The receivable and income accounts that a change to an active order's total
 * is posted to. Activation books the original total the same way, so the
 * receivable keeps tracking final_total and later payments clear it.
 */
export async function resolveOrderChargeAccounts(
  storeId: string,
  requestedReceivableAccountId?: string | null,
): Promise<OrderChargeAccounts> {
  const accounts = await resolveStoreAccounts(storeId);
  const receivableAccountId = requestedReceivableAccountId || accounts.receivableAccountId;
  if (!receivableAccountId || !accounts.incomeAccountId) {
    throw new Error(`Store ${storeId} has no active receivable and income accounts to record the charge against`);
  }
  return { receivableAccountId, incomeAccountId: accounts.incomeAccountId };
}

/** Legs for a change to what the customer owes: a positive delta is a new charge, a negative one reverses it. */
export function orderChargeLegs(
  orderId: string,
  delta: number,
  accounts: OrderChargeAccounts,
  description: string,
): JournalLeg[] {
  if (delta === 0) return [];
  const amount = Money.php(Math.abs(delta));
  const isCharge = delta > 0;
  return [
    {
      entryId: crypto.randomUUID(),
      accountId: accounts.receivableAccountId,
      debit: isCharge ? amount : Money.zero(),
      credit: isCharge ? Money.zero() : amount,
      description,
      referenceType: 'order',
      referenceId: orderId,
    },
    {
      entryId: crypto.randomUUID(),
      accountId: accounts.incomeAccountId,
      debit: isCharge ? Money.zero() : amount,
      credit: isCharge ? amount : Money.zero(),
      description: `${description} (income)`,
      referenceType: 'order',
      referenceId: orderId,
    },
  ];
}
