export interface CardSettlement {
  id: string;
  storeId: string;
  orderId: string | null;
  customerId: string | null;
  paymentId: string | null;
  name: string | null;
  amount: number;
  refNumber: string | null;
  transactionDate: string | null;
  forecastedDate: string | null;
  isPaid: boolean;
  dateSettled: string | null;
  settlementRef: string | null;
  netAmount: number | null;
  feeExpense: number | null;
  accountId: string | null;
  batchNo: string | null;
  createdAt: Date;
}

export interface SettleManyFields {
  isPaid: boolean;
  dateSettled: string;
  settlementRef: string;
  netAmount: number;
  feeExpense: number;
  accountId: string;
}

export interface CardSettlementRepository {
  findPending(storeId?: string): Promise<CardSettlement[]>;
  findSettled(storeId?: string, from?: string, to?: string): Promise<CardSettlement[]>;
  findByIds(ids: string[]): Promise<CardSettlement[]>;
  findByOrder(orderId: string): Promise<CardSettlement[]>;
  save(settlement: CardSettlement): Promise<void>;
  settleMany(ids: string[], fields: SettleManyFields): Promise<void>;
  batchUpdate(ids: string[], fields: { forecastedDate?: string; settlementRef?: string }): Promise<void>;
  assignBatch(ids: string[], batchNo: string): Promise<void>;
  pendingTotals(): Promise<{ total: number; byStore: Record<string, number> }>;
}
