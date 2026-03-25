export interface PawCardCustomer {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  totalVisits: number;
  lifetimeSavings: number;
}

export interface LifetimeSavings {
  customerId: string;
  totalSaved: number;
  totalVisits: number;
  averageSavingsPerVisit: number;
}

export interface PawCardEntry {
  id: string;
  customerId: string;
  establishmentId: string;
  establishmentName: string;
  discountAmount: number;
  visitDate: string;
  submittedBy: string;
  storeId: string;
  createdAt: Date;
}

export interface PawCardSubmission {
  customerId: string;
  establishmentId: string;
  discountAmount: number;
  visitDate: string;
  submittedBy: string;
  storeId: string;
}

export interface CompanyImpact {
  establishmentId: string;
  establishmentName: string;
  totalEntries: number;
  totalDiscountGiven: number;
  uniqueCustomers: number;
}

export interface PawCardPort {
  lookupCustomer(query: string): Promise<PawCardCustomer[]>;
  getEstablishments(storeId: string): Promise<Array<{ id: string; name: string; category: string }>>;
  getLifetimeSavings(customerId: string): Promise<LifetimeSavings>;
  submitEntry(entry: PawCardSubmission): Promise<PawCardEntry>;
  getCompanyImpact(establishmentId: string): Promise<CompanyImpact>;
  getMySubmissions(employeeId: string): Promise<PawCardEntry[]>;
}
