import type { Order } from '../entities/order.js';
import type { OrderStatus } from '../value-objects/order-status.js';
import type { OrderItem } from './order-item-repository.js';
import type { OrderAddonRecord } from './order-addon-repository.js';
import type { JournalLeg } from '../entities/journal-transaction.js';

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
  activateOrderAtomic(
    order: Order,
    orderItems: OrderItem[],
    orderAddons: OrderAddonRecord[],
    fleetUpdates: Array<{ id: string; status: string }>,
    journalLegs: JournalLeg[],
    journalTransactionId: string,
    journalPeriod: string,
    journalDate: string,
    journalStoreId: string,
  ): Promise<void>;
}
