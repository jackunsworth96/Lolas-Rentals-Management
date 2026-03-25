export interface MerchandiseItem {
  sku: string;
  itemName: string;
  sizeVariant: string | null;
  costPrice: number;
  salePrice: number;
  startingStock: number;
  soldCount: number;
  currentStock: number;
  lowStockThreshold: number;
  storeId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MerchandiseRepository {
  findByStore(storeId: string): Promise<MerchandiseItem[]>;
  findBySku(sku: string): Promise<MerchandiseItem | null>;
  save(item: Omit<MerchandiseItem, 'createdAt' | 'updatedAt'>): Promise<void>;
  updateStock(sku: string, delta: number): Promise<MerchandiseItem>;
  delete(sku: string): Promise<void>;
}
