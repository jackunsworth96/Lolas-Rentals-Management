export interface DirectoryContact {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  category: string | null;
  notes: string | null;
  storeId: string | null;
  createdAt: Date;
}

export interface DirectoryRepository {
  findAll(storeId?: string): Promise<DirectoryContact[]>;
  save(contact: DirectoryContact): Promise<void>;
  delete(id: string): Promise<void>;
}
