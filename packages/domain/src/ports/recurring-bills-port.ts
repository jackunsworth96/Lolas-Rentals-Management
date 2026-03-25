export interface RecurringBill {
  id: string;
  storeId: string;
  description: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'bimonthly' | 'monthly' | 'annual';
  accountId: string;
  categoryId: string | null;
  nextDueDate: string;
  active: boolean;
}

export interface RecurringBillsPort {
  getActiveBills(storeId: string): Promise<RecurringBill[]>;
  postBill(billId: string, date: string): Promise<void>;
  isAlreadyPosted(billId: string, date: string): Promise<boolean>;
}
