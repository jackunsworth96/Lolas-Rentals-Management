import {
  type CashReconciliationRepository,
  type CashReconciliation,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface ReconcileCashInput {
  storeId: string;
  date: string;
  openingBalance: number;
  expectedCash: number;
  actualCounted: number;
  tillCounted: number | null;
  depositsCounted: number | null;
  tillDenoms: Record<string, number> | null;
  depositDenoms: Record<string, number> | null;
  tillExpected: number | null;
  depositsExpected: number | null;
  closingBalance: number;
  submittedBy: string;
}

export interface ReconcileCashResult {
  reconciliation: CashReconciliation;
}

export async function reconcileCash(
  input: ReconcileCashInput,
  deps: {
    cashReconciliation: CashReconciliationRepository;
  },
): Promise<ReconcileCashResult> {
  const existing = await deps.cashReconciliation.findByDate(
    input.storeId,
    input.date,
  );

  if (existing?.isLocked) {
    throw new DomainError(
      `Cash reconciliation for ${input.date} is locked. Use override to modify.`,
    );
  }

  const variance = input.actualCounted - input.expectedCash;
  const varianceType =
    variance === 0 ? 'exact' : variance > 0 ? 'over' : 'short';

  const tillVariance =
    input.tillCounted != null && input.tillExpected != null
      ? input.tillCounted - input.tillExpected
      : null;

  const depositVariance =
    input.depositsCounted != null && input.depositsExpected != null
      ? input.depositsCounted - input.depositsExpected
      : null;

  const reconciliation: CashReconciliation = {
    id: existing?.id ?? randomUUID(),
    storeId: input.storeId,
    date: input.date,
    openingBalance: input.openingBalance,
    expectedCash: input.expectedCash,
    actualCounted: input.actualCounted,
    variance,
    varianceType,
    submittedBy: input.submittedBy,
    submittedAt: new Date(),
    isLocked: false,
    overriddenBy: existing?.overriddenBy ?? null,
    overriddenAt: existing?.overriddenAt ?? null,
    overrideReason: existing?.overrideReason ?? null,
    tillCounted: input.tillCounted,
    depositsCounted: input.depositsCounted,
    tillDenoms: input.tillDenoms,
    depositDenoms: input.depositDenoms,
    tillExpected: input.tillExpected,
    depositsExpected: input.depositsExpected,
    tillVariance,
    depositVariance,
    closingBalance: input.closingBalance,
  };

  await deps.cashReconciliation.save(reconciliation);
  await deps.cashReconciliation.lock(reconciliation.id);

  return { reconciliation: { ...reconciliation, isLocked: true } };
}
