import type { SupabaseClient } from '@supabase/supabase-js';

// The live API may deploy before its get_enriched_orders database migration.
// Batch IDs so this fallback does not reproduce the old oversized request URL.
export async function loadEnrichedOrdersFallback(sb: SupabaseClient, storeId: string, statuses: string[] | null) {
  type Row = Record<string, any>;
  const orders: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = sb.from('orders')
      .select('id, store_id, order_date, customer_id, booking_customer_name, status, final_total, web_notes, payment_method_id, deposit_method_id, security_deposit, card_fee_surcharge, woo_order_id, booking_token, partner_ref, customers!customer_id(name, mobile, email)')
      .eq('store_id', storeId)
      .order('order_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 499);
    if (statuses?.length === 1) query = query.eq('status', statuses[0]);
    else if (statuses?.length) query = query.in('status', statuses);
    const { data, error } = await query;
    if (error) throw new Error(`Fallback orders query failed: ${error.message}`);
    orders.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }

  const items: Row[] = [];
  const payments: Row[] = [];
  const addons: Row[] = [];
  const inspections: Row[] = [];
  const waivers: Row[] = [];
  const ids = orders.map((o) => String(o.id));
  const tokens = [...new Set(orders.map((o) => o.booking_token).filter(Boolean))] as string[];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const results = await Promise.all([
      sb.from('order_items').select('id, order_id, vehicle_id, vehicle_name, pickup_datetime, dropoff_datetime, pickup_location_id, dropoff_location_id, pickup_location, dropoff_location, pickup_fee, dropoff_fee, discount, created_at').in('order_id', batch),
      sb.from('payments').select('order_id, amount, payment_type, settlement_status, payment_method_id').in('order_id', batch),
      sb.from('order_addons').select('order_id, addon_name').in('order_id', batch),
      sb.from('inspections').select('order_id, status, created_at').in('order_id', batch),
    ]);
    for (const result of results) if (result.error) throw new Error(`Fallback enriched query failed: ${result.error.message}`);
    items.push(...(results[0].data ?? []));
    payments.push(...(results[1].data ?? []));
    addons.push(...(results[2].data ?? []));
    inspections.push(...(results[3].data ?? []));
  }
  for (let i = 0; i < tokens.length; i += 100) {
    const { data, error } = await sb.from('waivers')
      .select('order_reference, status, agreed_at, created_at')
      .in('order_reference', tokens.slice(i, i + 100));
    if (error) throw new Error(`Fallback waivers query failed: ${error.message}`);
    waivers.push(...(data ?? []));
  }

  const byOrder = (rows: Row[]) => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = String(row.order_id);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  };
  const itemsByOrder = byOrder(items);
  const paymentsByOrder = byOrder(payments);
  const addonsByOrder = byOrder(addons);
  const inspectionsByOrder = byOrder(inspections);
  const waiversByRef = new Map<string, Row[]>();
  for (const waiver of waivers) {
    const key = String(waiver.order_reference);
    const list = waiversByRef.get(key) ?? [];
    list.push(waiver);
    waiversByRef.set(key, list);
  }

  return orders.map((order) => {
    const orderId = String(order.id);
    const orderPayments = paymentsByOrder.get(orderId) ?? [];
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    const latestWaiver = (waiversByRef.get(String(order.booking_token)) ?? [])
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const latestInspection = (inspectionsByOrder.get(orderId) ?? [])
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    return {
      ...order,
      customer_name: customer?.name ?? null,
      customer_mobile: customer?.mobile ?? null,
      customer_email: customer?.email ?? null,
      items: (itemsByOrder.get(orderId) ?? []).sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))),
      total_paid: orderPayments.reduce((sum, p) => {
        if (p.payment_type === 'deposit' ||
            (p.payment_type === 'extension' && ['pending', 'absorbed'].includes(p.settlement_status)) ||
            (p.payment_type === 'addon' && p.payment_method_id === 'pending' && p.settlement_status === 'pending')) return sum;
        return sum + (p.payment_type === 'refund' ? -1 : 1) * Number(p.amount ?? 0);
      }, 0),
      pending_extensions_total: orderPayments.reduce((sum, p) =>
        sum + (p.payment_type === 'extension' && p.settlement_status === 'pending' ? Number(p.amount ?? 0) : 0), 0),
      has_extension: orderPayments.some((p) => p.payment_type === 'extension'),
      has_nine_pm_addon: (addonsByOrder.get(orderId) ?? []).some((a) =>
        /9pm|21:00|ninepm/i.test(String(a.addon_name ?? ''))),
      waiver_status: latestWaiver?.status ?? 'pending',
      waiver_signed_at: latestWaiver?.agreed_at ?? null,
      inspection_status: latestInspection?.status === 'completed' ? 'completed' : 'pending',
    };
  });
}
