export interface MiscSale {
  id: string;
  storeId: string;
  date: string;
  description: string | null;
  category: string | null;
  amount: number;
  receivedInto: string | null;
  incomeAccountId: string | null;
  employeeId: string | null;
  createdAt: Date;
}

export interface MiscSaleRepository {
  findById(id: string): Promise<MiscSale | null>;
  findByStore(storeId: string, date: string): Promise<MiscSale[]>;
  save(sale: MiscSale): Promise<void>;
  delete(id: string): Promise<void>;
}
