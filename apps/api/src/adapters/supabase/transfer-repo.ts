import { getSupabaseClient } from './client.js';
import type { TransferRepository, TransferFilters } from '@lolas/domain';
import { Transfer, Money } from '@lolas/domain';

function toRow(t: Transfer) {
  return {
    id: t.id,
    order_id: t.orderId,
    service_date: t.serviceDate,
    customer_name: t.customerName,
    contact_number: t.contactNumber,
    customer_email: t.customerEmail,
    customer_type: t.customerType,
    route: t.route,
    flight_time: t.flightTime,
    pax_count: t.paxCount,
    van_type: t.vanType,
    accommodation: t.accommodation,
    status: t.status,
    ops_notes: t.opsNotes,
    total_price: t.totalPrice.toNumber(),
    payment_method: t.paymentMethod,
    payment_status: t.paymentStatus,
    driver_fee: t.driverFee?.toNumber() ?? null,
    net_profit: t.netProfit?.toNumber() ?? null,
    driver_paid_status: t.driverPaidStatus,
    booking_source: t.bookingSource,
    booking_token: t.bookingToken,
    store_id: t.storeId,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

function toDomain(row: Record<string, unknown>): Transfer {
  return Transfer.create({
    id: row.id as string,
    orderId: row.order_id as string | null,
    serviceDate: row.service_date as string,
    customerName: row.customer_name as string,
    contactNumber: row.contact_number as string | null,
    customerEmail: row.customer_email as string | null,
    customerType: row.customer_type as 'Walk-in' | 'Online' | null,
    route: row.route as string,
    flightTime: row.flight_time as string | null,
    paxCount: row.pax_count as number,
    vanType: row.van_type as string | null,
    accommodation: row.accommodation as string | null,
    status: row.status as string,
    opsNotes: row.ops_notes as string | null,
    totalPrice: Money.php(row.total_price as number),
    paymentMethod: row.payment_method as string | null,
    paymentStatus: row.payment_status as 'Pending' | 'Partially Paid' | 'Paid',
    driverFee: row.driver_fee != null ? Money.php(row.driver_fee as number) : null,
    netProfit: row.net_profit != null ? Money.php(row.net_profit as number) : null,
    driverPaidStatus: row.driver_paid_status as string | null,
    bookingSource: row.booking_source as string | null,
    bookingToken: row.booking_token as string | null,
    storeId: row.store_id as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export function createTransferRepo(): TransferRepository {
  const sb = getSupabaseClient();

  return {
    async findById(id) {
      const { data, error } = await sb
        .from('transfers')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch transfer: ${error.message}`);
      return data ? toDomain(data) : null;
    },

    async findByStore(storeId, filters?) {
      let query = sb.from('transfers').select('*').eq('store_id', storeId);
      if (filters?.dateFrom) query = query.gte('service_date', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('service_date', filters.dateTo);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.route) query = query.eq('route', filters.route);
      if (filters?.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
      if (filters?.bookingSource) query = query.eq('booking_source', filters.bookingSource);
      if (filters?.driverPaidStatus === 'unpaid') {
        query = query.or('driver_paid_status.is.null,driver_paid_status.neq.Paid');
      }
      query = query.order('service_date', { ascending: true });
      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch transfers: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(transfer) {
      const { error } = await sb.from('transfers').upsert(toRow(transfer));
      if (error) throw new Error(`Failed to save transfer: ${error.message}`);
    },
  };
}
