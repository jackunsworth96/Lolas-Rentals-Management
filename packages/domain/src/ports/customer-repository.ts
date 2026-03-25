export interface Customer {
  id: string;
  storeId: string;
  name: string;
  email: string | null;
  mobile: string | null;
  totalSpent: number;
  notes: string | null;
  blacklisted: boolean;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  findByMobile(mobile: string): Promise<Customer | null>;
  search(storeId: string, query: string): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
}
