export interface PaymentRoutingRule {
  id: number;
  storeId: string;
  paymentMethodId: string;
  receivedIntoAccountId: string | null;
  cardSettlementAccountId: string | null;
}

export interface PaymentRoutingRepository {
  findAll(): Promise<PaymentRoutingRule[]>;
  findByStore(storeId: string): Promise<PaymentRoutingRule[]>;
  upsert(rule: Omit<PaymentRoutingRule, 'id'>): Promise<PaymentRoutingRule>;
  bulkUpsert(rules: Omit<PaymentRoutingRule, 'id'>[]): Promise<void>;
  delete(id: number): Promise<void>;
}
