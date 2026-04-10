export interface OrderAddonRecord {
  id: string;
  orderId?: string;
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
  mutualExclusivityGroup: string | null;
}

export interface OrderAddonRepository {
  findByOrderId(orderId: string): Promise<OrderAddonRecord[]>;
  saveMany(orderId: string, addons: OrderAddonRecord[], storeId?: string): Promise<void>;
  save(addon: OrderAddonRecord, storeId: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByOrderId(orderId: string): Promise<void>;
}
