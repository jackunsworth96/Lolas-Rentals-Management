export interface Expense {
  id: string;
  storeId: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paidFrom: string | null;
  vehicleId: string | null;
  employeeId: string | null;
  accountId: string | null;
  createdAt: Date;
}

export interface ExpenseRepository {
  findById(id: string): Promise<Expense | null>;
  findByStore(storeId: string, date: string): Promise<Expense[]>;
  findByCategory(storeId: string, category: string): Promise<Expense[]>;
  save(expense: Expense): Promise<void>;
  delete(id: string): Promise<void>;
}
