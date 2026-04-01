export interface CashReconciliation {
  id: string;
  storeId: string;
  date: string;
  openingBalance: number;
  expectedCash: number;
  actualCounted: number;
  variance: number;
  varianceType: string | null;
  submittedBy: string | null;
  submittedAt: Date | null;
  isLocked: boolean;
  overriddenBy: string | null;
  overriddenAt: Date | null;
  overrideReason: string | null;
  tillCounted: number | null;
  depositsCounted: number | null;
  tillDenoms: Record<string, number> | null;
  depositDenoms: Record<string, number> | null;
  tillExpected: number | null;
  depositsExpected: number | null;
  tillVariance: number | null;
  depositVariance: number | null;
  closingBalance: number | null;
}

export interface CashReconciliationRepository {
  findByDate(storeId: string, date: string): Promise<CashReconciliation | null>;
  findPreviousDay(storeId: string, date: string): Promise<CashReconciliation | null>;
  save(reconciliation: CashReconciliation): Promise<void>;
  lock(id: string): Promise<void>;
  unlock(id: string): Promise<void>;
  override(
    id: string,
    actualCounted: number,
    overriddenBy: string,
    reason: string,
  ): Promise<void>;
  reconcileAtomic(reconciliation: CashReconciliation): Promise<void>;
}
