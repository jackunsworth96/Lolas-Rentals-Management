export interface Customer {
  id: string;
  storeId: string;
  name: string;
  email: string | null;
  mobile: string | null;
  totalSpent: number;
  notes: string | null;
  blacklisted: boolean;
  whatsappReviewOptOut: boolean;
  /** Set when an automation could not message this number; cleared when the number is corrected. */
  mobileNeedsReview?: boolean;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  findByMobile(mobile: string): Promise<Customer | null>;
  search(
    storeId: string,
    query: string,
    options?: { blacklistedOnly?: boolean; needsWhatsAppFixOnly?: boolean },
  ): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
}
