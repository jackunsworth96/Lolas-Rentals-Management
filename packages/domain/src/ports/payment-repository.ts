export interface Payment {
  id: string;
  storeId: string;
  orderId: string | null;
  rawOrderId: string | null;
  orderItemId: string | null;
  orderAddonId: string | null;
  paymentType: string;
  amount: number;
  paymentMethodId: string;
  transactionDate: string;
  settlementStatus: string | null;
  settlementRef: string | null;
  customerId: string | null;
  accountId: string | null;
}

export interface PaymentRepository {
  findByOrderId(orderId: string): Promise<Payment[]>;
  findByRawOrderId(rawOrderId: string): Promise<Payment[]>;
  findByDateRange(storeId: string, from: string, to: string): Promise<Payment[]>;
  save(payment: Payment): Promise<void>;
  linkToOrder(rawOrderId: string, orderId: string): Promise<void>;
}
