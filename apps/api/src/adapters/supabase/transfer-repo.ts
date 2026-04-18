import { z } from 'zod';
import { getSupabaseClient } from './client.js';
import type { TransferRepository, TransferFilters, TransferSummary } from '@lolas/domain';
import { Transfer, Money } from '@lolas/domain';

const TransferRowSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  service_date: z.string(),
  customer_name: z.string(),
  contact_number: z.string().nullable(),
  customer_email: z.string().nullable(),
  customer_type: z.enum(['Walk-in', 'Online']).nullable(),
  route: z.string(),
  flight_time: z.string().nullable(),
  pax_count: z.number(),
  van_type: z.string().nullable(),
  accommodation: z.string().nullable(),
  status: z.string(),
  ops_notes: z.string().nullable(),
  total_price: z.number(),
  payment_method: z.string().nullable(),
  payment_status: z.string(),
  driver_fee: z.number().nullable(),
  net_profit: z.number().nullable(),
  driver_paid_status: z.string().nullable(),
  booking_source: z.string().nullable(),
  booking_token: z.string().nullable(),
  store_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  collected_at: z.string().nullable(),
  collected_amount: z.number().nullable(),
  pickup_time: z.string().nullable(),
});

type RouteInfo = { driverCut: number | null; pricingType: 'fixed' | 'per_head' | null };

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
    collected_at: t.collectedAt?.toISOString() ?? null,
    collected_amount: t.collectedAmount,
    pickup_time: t.pickupTime,
  };
}

function toDomain(raw: unknown, routeInfo?: RouteInfo): Transfer {
  const result = TransferRowSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Invalid TransferRow from Supabase: ' + result.error.message);
  }
  const row = result.data;
  return Transfer.create({
    id: row.id,
    orderId: row.order_id,
    serviceDate: row.service_date,
    customerName: row.customer_name,
    contactNumber: row.contact_number,
    customerEmail: row.customer_email,
    customerType: row.customer_type,
    route: row.route,
    flightTime: row.flight_time,
    paxCount: row.pax_count,
    vanType: row.van_type,
    accommodation: row.accommodation,
    status: row.status,
    opsNotes: row.ops_notes,
    totalPrice: Money.php(row.total_price),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status as 'Pending' | 'Partially Paid' | 'Paid',
    driverFee: row.driver_fee != null ? Money.php(row.driver_fee) : null,
    netProfit: row.net_profit != null ? Money.php(row.net_profit) : null,
    driverPaidStatus: row.driver_paid_status,
    bookingSource: row.booking_source,
    bookingToken: row.booking_token,
    storeId: row.store_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    collectedAt: row.collected_at ? new Date(row.collected_at) : null,
    collectedAmount: row.collected_amount,
    routeDriverCut: routeInfo?.driverCut ?? null,
    routePricingType: routeInfo?.pricingType ?? null,
    pickupTime: row.pickup_time,
  });
}

function routeKey(route: string, vanType: string | null): string {
  return `${route}|${vanType ?? ''}`;
}

async function fetchRouteMap(storeId: string): Promise<Map<string, RouteInfo>> {
  const sb = getSupabaseClient();
  const { data } = await sb
    .from('transfer_routes')
    .select('route, van_type, driver_cut, pricing_type')
    .eq('store_id', storeId)
    .eq('is_active', true);
  const map = new Map<string, RouteInfo>();
  for (const r of data ?? []) {
    map.set(routeKey(r.route as string, r.van_type as string | null), {
      driverCut: r.driver_cut as number | null,
      pricingType: (r.pricing_type as 'fixed' | 'per_head') ?? null,
    });
  }
  return map;
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
      if (!data) return null;
      const routeMap = await fetchRouteMap(data.store_id as string);
      const info = routeMap.get(routeKey(data.route as string, data.van_type as string | null));
      return toDomain(data, info);
    },

    async findByBookingToken(token) {
      const { data, error } = await sb
        .from('transfers')
        .select('*')
        .eq('booking_token', token)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch transfer by booking token: ${error.message}`);
      if (!data) return null;
      const routeMap = await fetchRouteMap(data.store_id as string);
      const info = routeMap.get(routeKey(data.route as string, data.van_type as string | null));
      return toDomain(data, info);
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
      const routeMap = await fetchRouteMap(storeId);
      return (data ?? []).map((row) => {
        const info = routeMap.get(routeKey(row.route as string, row.van_type as string | null));
        return toDomain(row, info);
      });
    },

    async save(transfer) {
      const { error } = await sb.from('transfers').upsert(toRow(transfer));
      if (error) throw new Error(`Failed to save transfer: ${error.message}`);
    },

    async getSummary(storeId, filters?): Promise<TransferSummary> {
      // Use PostgREST aggregate columns to avoid fetching all rows.
      // The supabase-js client forwards these to PostgREST which evaluates them server-side.
      type AggRow = Record<string, unknown>;

      // -- Outstanding (not yet collected) --
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let outQ = (sb as any)
        .from('transfers')
        .select('count:id.count(), total:total_price.sum()')
        .eq('store_id', storeId)
        .is('collected_at', null);
      if (filters?.dateFrom) outQ = outQ.gte('service_date', filters.dateFrom);
      if (filters?.dateTo) outQ = outQ.lte('service_date', filters.dateTo);
      const { data: outData, error: outErr } = await outQ;
      if (outErr) throw new Error(`Transfer summary (outstanding) failed: ${outErr.message}`);

      const outRow: AggRow = (outData as AggRow[])[0] ?? {};
      const outCount = Number(outRow['count'] ?? 0);
      const outTotal = Number(outRow['total'] ?? 0);

      // -- Collected --
      // Uses stored driver_fee; SQL SUM ignores NULLs so defaults to 0 when unset.
      // collected_amount is the actual cash collected; falls back via COALESCE in app logic.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let colQ = (sb as any)
        .from('transfers')
        .select('count:id.count(), total:collected_amount.sum(), driverCut:driver_fee.sum()')
        .eq('store_id', storeId)
        .not('collected_at', 'is', null);
      if (filters?.dateFrom) colQ = colQ.gte('service_date', filters.dateFrom);
      if (filters?.dateTo) colQ = colQ.lte('service_date', filters.dateTo);
      const { data: colData, error: colErr } = await colQ;
      if (colErr) throw new Error(`Transfer summary (collected) failed: ${colErr.message}`);

      const colRow: AggRow = (colData as AggRow[])[0] ?? {};
      const colCount = Number(colRow['count'] ?? 0);
      const colTotal = Number(colRow['total'] ?? 0);
      const colDriverCut = Number(colRow['driverCut'] ?? 0);

      return {
        outstanding: { count: outCount, total: outTotal },
        collected: {
          count: colCount,
          total: colTotal,
          driverCut: colDriverCut,
          netLolas: colTotal - colDriverCut,
        },
      };
    },
  };
}
