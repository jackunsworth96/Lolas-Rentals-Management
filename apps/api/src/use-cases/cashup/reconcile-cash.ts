import {
  type CashReconciliationRepository,
  type CashReconciliation,
  DomainError,
} from '@lolas/domain';
import { CASHUP_VARIANCE_NOTE_THRESHOLD } from '@lolas/shared';
import { randomUUID } from 'node:crypto';
import { round2 } from './cashup-calc.js';

export interface ReconcileCashInput {
  storeId: string;
  date: string;
  tillDenoms: Record<string, number>;
  depositDenoms: Record<string, number>;
  varianceNote?: string | null;
  cashDrop?: { amount: number; cashAccountId: string; bankAccountId: string } | null;
  submittedBy: string;
}

export interface ExpectedFigures {
  openingTill: number;
  tillExpected: number;
  envelopeExpected: number;
}

export interface ReconcileCashDeps {
  cashReconciliation: CashReconciliationRepository;
  /** Server-side expected figures for the day (built from the same summary the page shows). */
  loadExpected: (storeId: string, date: string) => Promise<ExpectedFigures>;
  /** Posts the cash-drop journal (till → bank/safe) before expected figures are loaded. */
  recordCashDrop?: (input: {
    storeId: string;
    date: string;
    amount: number;
    cashAccountId: string;
    bankAccountId: string;
  }) => Promise<void>;
  today: string;
}

export interface ReconcileCashResult {
  reconciliation: CashReconciliation;
}

export function denomTotal(denoms: Record<string, number>): number {
  return round2(
    Object.entries(denoms).reduce((sum, [denom, count]) => sum + Number(denom) * (Number(count) || 0), 0),
  );
}

function varianceType(v: number): 'exact' | 'over' | 'short' {
  return v === 0 ? 'exact' : v > 0 ? 'over' : 'short';
}

export async function reconcileCash(
  input: ReconcileCashInput,
  deps: ReconcileCashDeps,
): Promise<ReconcileCashResult> {
  if (input.date > deps.today) {
    throw new DomainError(`Cannot cash up ${input.date} — it is in the future.`);
  }

  const existing = await deps.cashReconciliation.findByDate(input.storeId, input.date);
  if (existing?.isLocked) {
    throw new DomainError(`Cash reconciliation for ${input.date} is locked. Reopen it first.`);
  }

  const countedTill = denomTotal(input.tillDenoms);
  const envelopeCounted = denomTotal(input.depositDenoms);
  if (countedTill <= 0) {
    throw new DomainError('Count the till before locking the day.');
  }

  const drop = input.cashDrop?.amount ? round2(input.cashDrop.amount) : 0;
  if (drop > countedTill) {
    throw new DomainError('The bank/safe drop is larger than the counted till.');
  }

  // Variance is the same before and after a drop (both counted and expected
  // fall by the drop), so check the note requirement before posting anything.
  const before = await deps.loadExpected(input.storeId, input.date);
  const preTillVariance = round2(countedTill - before.tillExpected);
  const preEnvelopeVariance = round2(envelopeCounted - before.envelopeExpected);
  const note = input.varianceNote?.trim() || null;
  if (
    !note &&
    (Math.abs(preTillVariance) > CASHUP_VARIANCE_NOTE_THRESHOLD ||
      Math.abs(preEnvelopeVariance) > CASHUP_VARIANCE_NOTE_THRESHOLD)
  ) {
    throw new DomainError(
      `Explain the variance (till ${preTillVariance}, envelope ${preEnvelopeVariance}) before locking.`,
    );
  }

  let expected = before;
  if (drop > 0 && input.cashDrop && deps.recordCashDrop) {
    await deps.recordCashDrop({
      storeId: input.storeId,
      date: input.date,
      amount: drop,
      cashAccountId: input.cashDrop.cashAccountId,
      bankAccountId: input.cashDrop.bankAccountId,
    });
    expected = await deps.loadExpected(input.storeId, input.date);
  }

  const tillCounted = round2(countedTill - drop);
  const tillVariance = round2(tillCounted - expected.tillExpected);
  const depositVariance = round2(envelopeCounted - expected.envelopeExpected);
  const variance = round2(tillVariance + depositVariance);

  const reconciliation: CashReconciliation = {
    id: existing?.id ?? randomUUID(),
    storeId: input.storeId,
    date: input.date,
    openingBalance: expected.openingTill,
    expectedCash: round2(expected.tillExpected + expected.envelopeExpected),
    actualCounted: round2(tillCounted + envelopeCounted),
    variance,
    varianceType: varianceType(variance),
    submittedBy: input.submittedBy,
    submittedAt: new Date(),
    isLocked: false,
    overriddenBy: existing?.overriddenBy ?? null,
    overriddenAt: existing?.overriddenAt ?? null,
    overrideReason: existing?.overrideReason ?? null,
    tillCounted,
    depositsCounted: envelopeCounted,
    tillDenoms: input.tillDenoms,
    depositDenoms: input.depositDenoms,
    tillExpected: expected.tillExpected,
    depositsExpected: expected.envelopeExpected,
    tillVariance,
    depositVariance,
    closingBalance: tillCounted,
    depositsClosingBalance: envelopeCounted,
    varianceNote: note,
  };

  await deps.cashReconciliation.reconcileAtomic(reconciliation);

  return { reconciliation: { ...reconciliation, isLocked: true } };
}
