import type { Order } from '../entities/order.js';
import type { OrderStatus } from '../value-objects/order-status.js';

export interface OrderFilters {
  status?: string;
  customerId?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentMethodId?: string;
  hasBalance?: boolean;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByStore(storeId: string, filters?: OrderFilters): Promise<Order[]>;
  findByStatus(storeId: string, status: OrderStatus): Promise<Order[]>;
  findByCustomer(customerId: string): Promise<Order[]>;
  save(order: Order): Promise<void>;
}
