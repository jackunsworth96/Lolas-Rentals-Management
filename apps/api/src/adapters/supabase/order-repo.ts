import type {
  Order,
  OrderProps,
  OrderRepository,
  OrderFilters,
  OrderStatus,
  Money,
} from '@lolas/domain';
import { Order as OrderEntity, OrderStatus as OS, Money as M } from '@lolas/domain';
import { getSupabaseClient } from './client.js';
import { parseDate } from './mappers.js';

interface OrderRow {
  id: string;
  store_id: string;
  woo_order_id: string | null;
  customer_id: string | null;
  employee_id: string | null;
  order_date: string;
  status: string;
  web_notes: string | null;
  quantity: number;
  web_quote_raw: number | null;
  security_deposit: number;
  deposit_status: string | null;
  card_fee_surcharge: number;
  return_charges: number;
  final_total: number;
  balance_due: number;
  payment_method_id: string | null;
  deposit_method_id: string | null;
  booking_token: string | null;
  tips: number;
  charity_donation: number;
  created_at: string;
  updated_at: string;
}

function rowToOrder(row: OrderRow): Order {
  return OrderEntity.create({
    id: row.id,
    storeId: row.store_id,
    wooOrderId: row.woo_order_id ?? null,
    customerId: row.customer_id,
    employeeId: row.employee_id,
    orderDate: row.order_date,
    status: OS.from(row.status),
    webNotes: row.web_notes,
    quantity: row.quantity,
    webQuoteRaw: row.web_quote_raw,
    securityDeposit: M.php(row.security_deposit ?? 0),
    depositStatus: row.deposit_status,
    cardFeeSurcharge: M.php(row.card_fee_surcharge ?? 0),
    returnCharges: M.php(row.return_charges ?? 0),
    finalTotal: M.php(row.final_total ?? 0),
    balanceDue: M.php(row.balance_due ?? 0),
    paymentMethodId: row.payment_method_id,
    depositMethodId: row.deposit_method_id,
    bookingToken: row.booking_token,
    tips: M.php(row.tips ?? 0),
    charityDonation: M.php(row.charity_donation ?? 0),
    addons: [],
    createdAt: parseDate(row.created_at),
    updatedAt: parseDate(row.updated_at),
  });
}

function orderToRow(order: Order): Record<string, unknown> {
  return {
    id: order.id,
    store_id: order.storeId,
    woo_order_id: (order as Order & { wooOrderId?: string | null }).wooOrderId ?? null,
    customer_id: order.customerId,
    employee_id: order.employeeId,
    order_date: order.orderDate,
    status: order.status.value,
    web_notes: order.webNotes,
    quantity: order.quantity,
    web_quote_raw: order.webQuoteRaw,
    security_deposit: order.securityDeposit.toNumber(),
    deposit_status: order.depositStatus,
    card_fee_surcharge: order.cardFeeSurcharge.toNumber(),
    return_charges: order.returnCharges.toNumber(),
    final_total: order.finalTotal.toNumber(),
    balance_due: order.balanceDue.toNumber(),
    payment_method_id: order.paymentMethodId,
    deposit_method_id: order.depositMethodId,
    booking_token: order.bookingToken,
    tips: order.tips.toNumber(),
    charity_donation: order.charityDonation.toNumber(),
    updated_at: order.updatedAt.toISOString(),
  };
}

export class SupabaseOrderRepository implements OrderRepository {
  async findById(id: string): Promise<Order | null> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`findById failed: ${error.message}`);
    return data ? rowToOrder(data as OrderRow) : null;
  }

  async findByStore(
    storeId: string,
    filters?: OrderFilters,
  ): Promise<Order[]> {
    const sb = getSupabaseClient();
    let query = sb.from('orders').select('*').eq('store_id', storeId);

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters?.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }
    if (filters?.dateFrom) {
      query = query.gte('order_date', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('order_date', filters.dateTo);
    }
    if (filters?.paymentMethodId) {
      query = query.eq('payment_method_id', filters.paymentMethodId);
    }
    if (filters?.hasBalance === true) {
      query = query.gt('balance_due', 0);
    }

    query = query.order('order_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(`findByStore failed: ${error.message}`);
    return (data as OrderRow[]).map(rowToOrder);
  }

  async findByStatus(
    storeId: string,
    status: OrderStatus,
  ): Promise<Order[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', status.value)
      .order('order_date', { ascending: false });

    if (error) throw new Error(`findByStatus failed: ${error.message}`);
    return (data as OrderRow[]).map(rowToOrder);
  }

  async findByCustomer(customerId: string): Promise<Order[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false });

    if (error) throw new Error(`findByCustomer failed: ${error.message}`);
    return (data as OrderRow[]).map(rowToOrder);
  }

  async save(order: Order): Promise<void> {
    const sb = getSupabaseClient();
    const row = orderToRow(order);
    const { error } = await sb.from('orders').upsert(row);

    if (error) throw new Error(`save failed: ${error.message}`);
  }
}
