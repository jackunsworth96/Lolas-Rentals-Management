import {
  type CashReconciliationRepository,
  type CashReconciliation,
  DomainError,
} from '@lolas/domain';

export interface OverrideReconciliationInput {
  storeId: string;
  date: string;
  actualCounted: number;
  overriddenBy: string;
  reason: string;
}

export async function overrideReconciliation(
  input: OverrideReconciliationInput,
  deps: { cashReconciliation: CashReconciliationRepository },
): Promise<CashReconciliation> {
  const reconciliation = await deps.cashReconciliation.findByDate(
    input.storeId,
    input.date,
  );

  if (!reconciliation) {
    throw new DomainError(
      `No reconciliation found for store ${input.storeId} on ${input.date}`,
    );
  }

  if (!reconciliation.isLocked) {
    throw new DomainError(
      'Reconciliation is not locked — use standard reconcile instead',
    );
  }

  if (!input.reason || input.reason.trim().length === 0) {
    throw new DomainError('Override reason is required');
  }

  await deps.cashReconciliation.unlock(reconciliation.id);

  const newVariance = input.actualCounted - reconciliation.expectedCash;
  await deps.cashReconciliation.override(
    reconciliation.id,
    input.actualCounted,
    input.overriddenBy,
    input.reason,
  );

  return {
    ...reconciliation,
    actualCounted: input.actualCounted,
    variance: newVariance,
    varianceType: newVariance === 0 ? 'exact' : newVariance > 0 ? 'over' : 'short',
    isLocked: false,
    overriddenBy: input.overriddenBy,
    overriddenAt: new Date(),
    overrideReason: input.reason,
  };
}
