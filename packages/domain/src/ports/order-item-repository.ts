export interface OrderItem {
  id: string;
  storeId: string;
  orderId: string;
  vehicleId: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDaysCount: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupFee: number;
  dropoffFee: number;
  rentalRate: number;
  helmetNumbers: string | null;
  discount: number;
  opsNotes: string | null;
  returnCondition: string | null;
}

export interface OrderItemRepository {
  findByOrderId(orderId: string): Promise<OrderItem[]>;
  findActiveByVehicle(vehicleId: string): Promise<OrderItem[]>;
  save(item: OrderItem): Promise<void>;
  saveMany(items: OrderItem[]): Promise<void>;
  delete(id: string): Promise<void>;
}
