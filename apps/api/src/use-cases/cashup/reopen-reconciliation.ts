import {
  type CashReconciliationRepository,
  type CashReconciliation,
  DomainError,
} from '@lolas/domain';

export interface ReopenReconciliationInput {
  storeId: string;
  date: string;
  reopenedBy: string;
  reason: string;
}

/**
 * Unlocks a locked cash-up so the day can be recounted. Counts and closing
 * balances are left as they were until the recount is locked again, which is
 * what moves the next day's opening float.
 */
export async function reopenReconciliation(
  input: ReopenReconciliationInput,
  deps: { cashReconciliation: CashReconciliationRepository },
): Promise<CashReconciliation> {
  const reason = input.reason?.trim();
  if (!reason) throw new DomainError('A reason is required to reopen a cash-up');

  const reconciliation = await deps.cashReconciliation.findByDate(input.storeId, input.date);
  if (!reconciliation) {
    throw new DomainError(`No cash-up found for store ${input.storeId} on ${input.date}`);
  }
  if (!reconciliation.isLocked) {
    throw new DomainError('This cash-up is already open — recount and lock it instead');
  }

  await deps.cashReconciliation.reopen(reconciliation.id, input.reopenedBy, reason);

  return {
    ...reconciliation,
    isLocked: false,
    overriddenBy: input.reopenedBy,
    overriddenAt: new Date(),
    overrideReason: reason,
  };
}
