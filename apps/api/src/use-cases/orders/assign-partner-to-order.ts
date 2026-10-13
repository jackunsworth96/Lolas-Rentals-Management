import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { lookupActivePartnerBySlug, applyPartnerBenefit, type PartnerBenefitRow } from '../../lib/partner-benefit.js';
import { calculateBalanceDue } from '@lolas/shared';
import { refundOrder, type RefundOrderDeps } from './refund-order.js';

interface OrderRow {
  id: string;
  store_id: string;
  status: string;
  partner_ref: string | null;
  final_total: number | string | null;
  booking_token: string | null;
  created_at: string;
}

interface OrderItemRow {
  id: string;
  vehicle_id: string | null;
  vehicle_model_id: string | null;
  rental_rate: number | string | null;
  daily_rate: number | string | null;
  rental_days_count: number | string | null;
  rental_days: number | string | null;
  pickup_fee: number | string | null;
  dropoff_fee: number | string | null;
  discount: number | string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  pickup_location_id: string | number | null;
  dropoff_location_id: string | number | null;
  pickup_datetime: string | null;
}

interface ItemBenefitBreakdown {
  itemId: string;
  rentalDiscount: number;
  deliveryDiscount: number;
  newDiscount: number;
  newPickupFee: number;
  newDropoffFee: number;
}

export interface AssignPartnerPreview {
  partnerName: string;
  partnerSlug: string;
  rentalDiscount: number;
  deliveryDiscount: number;
  totalDiscount: number;
  currentFinalTotal: number;
  newFinalTotal: number;
  totalPaid: number;
  overpaidAmount: number;
}

async function loadOrderAndItems(orderId: string) {
  const sb = getSupabaseClient();
  const { data: order, error: orderErr } = await sb
    .from('orders')
    .select('id, store_id, status, partner_ref, final_total, booking_token, created_at')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) {
    const err = new Error('Order not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }
  const orderRow = order as OrderRow;

  // orders.created_at is stamped at ACTIVATION time (see process-raw-order.ts),
  // not when the guest actually made the booking — using it for advance-day /
  // early-bird eligibility would understate how far ahead they booked whenever
  // activation happens days after the booking itself. orders_raw.created_at is
  // the true booking timestamp, so prefer it when the raw row still exists.
  if (orderRow.booking_token) {
    const { data: rawRow } = await sb
      .from('orders_raw')
      .select('created_at')
      .eq('order_reference', orderRow.booking_token)
      .eq('store_id', orderRow.store_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const rawCreatedAt = (rawRow as { created_at?: string } | null)?.created_at;
    if (rawCreatedAt) orderRow.created_at = rawCreatedAt;
  }

  const { data: items, error: itemsErr } = await sb
    .from('order_items')
    .select('id, vehicle_id, vehicle_model_id, rental_rate, daily_rate, rental_days_count, rental_days, pickup_fee, dropoff_fee, discount, pickup_location, dropoff_location, pickup_location_id, dropoff_location_id, pickup_datetime')
    .eq('order_id', orderId);
  if (itemsErr) throw new Error(`Failed to load order items: ${itemsErr.message}`);

  return { order: orderRow, items: (items ?? []) as OrderItemRow[] };
}

async function resolveVehicleModelIds(items: OrderItemRow[]): Promise<Map<string, string | null>> {
  const sb = getSupabaseClient();
  const map = new Map<string, string | null>();
  const vehicleIdsNeedingLookup = items
    .filter((i) => !i.vehicle_model_id && i.vehicle_id)
    .map((i) => i.vehicle_id as string);
  if (vehicleIdsNeedingLookup.length === 0) return map;

  const { data } = await sb
    .from('fleet')
    .select('id, model_id')
    .in('id', vehicleIdsNeedingLookup);
  for (const row of (data ?? []) as Array<{ id: string; model_id: string | null }>) {
    map.set(row.id, row.model_id);
  }
  return map;
}

async function resolveLocationIdsByName(items: OrderItemRow[], storeId: string): Promise<Map<string, number>> {
  const sb = getSupabaseClient();
  const map = new Map<string, number>();
  const names = new Set<string>();
  for (const i of items) {
    if (i.pickup_location_id == null && i.pickup_location) names.add(i.pickup_location);
    if (i.dropoff_location_id == null && i.dropoff_location) names.add(i.dropoff_location);
  }
  if (names.size === 0) return map;

  const { data } = await sb
    .from('locations')
    .select('id, name')
    .or(`store_id.eq.${storeId},store_id.is.null`)
    .in('name', Array.from(names));
  for (const row of (data ?? []) as Array<{ id: number; name: string }>) {
    map.set(row.name, row.id);
  }
  return map;
}

/**
 * Computes, per item, the discount applyPartnerBenefit() would grant had this
 * booking gone through the partner link originally. Advance-day eligibility
 * (early-bird tiers, advanceDiscountDays) is evaluated against the ORIGINAL
 * booking time (orders.created_at) vs pickup — not "now" — so a late
 * retroactive assignment doesn't unfairly deny (or grant) a time-sensitive
 * benefit the guest would/wouldn't have actually qualified for.
 */
async function computeBenefitForItems(
  order: OrderRow,
  items: OrderItemRow[],
  partner: PartnerBenefitRow,
): Promise<ItemBenefitBreakdown[]> {
  const modelIdByVehicle = await resolveVehicleModelIds(items);
  const locationIdByName = await resolveLocationIdsByName(items, order.store_id);
  const bookedAt = new Date(order.created_at).getTime();

  return items.map((item) => {
    const vehicleModelId = item.vehicle_model_id
      ?? (item.vehicle_id ? modelIdByVehicle.get(item.vehicle_id) ?? null : null);

    const pickupLocationId = item.pickup_location_id != null
      ? Number(item.pickup_location_id)
      : (item.pickup_location ? locationIdByName.get(item.pickup_location) ?? null : null);
    const dropoffLocationId = item.dropoff_location_id != null
      ? Number(item.dropoff_location_id)
      : (item.dropoff_location ? locationIdByName.get(item.dropoff_location) ?? null : null);

    const rentalRate = Number(item.rental_rate ?? item.daily_rate ?? 0);
    const rentalDays = Number(item.rental_days_count ?? item.rental_days ?? 1) || 1;
    const rentalSubtotal = rentalRate * rentalDays;
    const pickupFee = Number(item.pickup_fee ?? 0);
    const dropoffFee = Number(item.dropoff_fee ?? 0);
    const existingDiscount = Number(item.discount ?? 0);

    const advanceDaysFromNow = item.pickup_datetime
      ? (new Date(item.pickup_datetime).getTime() - bookedAt) / 86_400_000
      : null;

    const benefit = applyPartnerBenefit({
      partner,
      rentalSubtotal,
      pickupFee,
      dropoffFee,
      advanceDaysFromNow,
      vehicleModelId,
      pickupLocationId,
      dropoffLocationId,
    });

    return {
      itemId: item.id,
      rentalDiscount: benefit.rentalDiscount,
      deliveryDiscount: benefit.deliveryDiscount,
      newDiscount: Math.round((existingDiscount + benefit.rentalDiscount) * 100) / 100,
      newPickupFee: benefit.pickupFee,
      newDropoffFee: benefit.dropoffFee,
    };
  });
}

async function resolvePartnerForAssignment(
  partnerSlug: string,
  order: OrderRow,
): Promise<PartnerBenefitRow> {
  if (order.partner_ref) {
    const err = new Error(`Order already has a partner assigned (${order.partner_ref})`);
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }
  if (order.status === 'cancelled') {
    const err = new Error('Cannot assign a partner to a cancelled order');
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }
  const partner = await lookupActivePartnerBySlug(partnerSlug);
  if (!partner || partner.storeId !== order.store_id) {
    const err = new Error('Choose an active partner in this store');
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }
  return partner;
}

async function totalPaidForOrder(orderId: string): Promise<number> {
  const sb = getSupabaseClient();
  const { data: payments, error } = await sb
    .from('payments')
    .select('amount, payment_type, settlement_status, payment_method_id')
    .eq('order_id', orderId);
  if (error) throw new Error(`Failed to load payments: ${error.message}`);

  return (payments ?? []).reduce((sum, p) => {
    const row = p as { amount: number | string | null; payment_type: string; settlement_status: string | null; payment_method_id: string | null };
    const amt = Number(row.amount ?? 0);
    if (row.payment_type === 'deposit') return sum;
    if (row.payment_type === 'extension' && (row.settlement_status === 'pending' || row.settlement_status === 'absorbed')) return sum;
    if (row.payment_type === 'addon' && row.payment_method_id === 'pending' && row.settlement_status === 'pending') return sum;
    if (row.payment_type === 'refund') return sum - amt;
    return sum + amt;
  }, 0);
}

export async function previewAssignPartnerToOrder(input: {
  orderId: string;
  partnerSlug: string;
}): Promise<AssignPartnerPreview> {
  const { order, items } = await loadOrderAndItems(input.orderId);
  const partner = await resolvePartnerForAssignment(input.partnerSlug, order);
  const breakdown = await computeBenefitForItems(order, items, partner);

  const rentalDiscount = Math.round(breakdown.reduce((s, b) => s + b.rentalDiscount, 0) * 100) / 100;
  const deliveryDiscount = Math.round(breakdown.reduce((s, b) => s + b.deliveryDiscount, 0) * 100) / 100;
  const totalDiscount = Math.round((rentalDiscount + deliveryDiscount) * 100) / 100;

  const currentFinalTotal = Number(order.final_total ?? 0);
  const newFinalTotal = Math.max(0, Math.round((currentFinalTotal - totalDiscount) * 100) / 100);
  const totalPaid = await totalPaidForOrder(order.id);
  const overpaidAmount = Math.max(0, Math.round((totalPaid - newFinalTotal) * 100) / 100);

  return {
    partnerName: partner.name,
    partnerSlug: partner.slug,
    rentalDiscount,
    deliveryDiscount,
    totalDiscount,
    currentFinalTotal,
    newFinalTotal,
    totalPaid,
    overpaidAmount,
  };
}

export interface AssignPartnerToOrderInput {
  orderId: string;
  partnerSlug: string;
  employeeId: string;
  /** Required when the recomputed preview finds an overpayment — the cash refund for the excess. */
  refund?: {
    refundMethodId: string;
    refundAccountId: string;
    receivableAccountId: string;
    reason?: string | null;
  };
}

export async function assignPartnerToOrder(
  deps: RefundOrderDeps,
  input: AssignPartnerToOrderInput,
): Promise<{
  partnerName: string;
  rentalDiscount: number;
  deliveryDiscount: number;
  totalDiscount: number;
  finalTotal: number;
  balanceDue: number;
  refundedAmount: number;
}> {
  const sb = getSupabaseClient();
  const { order, items } = await loadOrderAndItems(input.orderId);
  const partner = await resolvePartnerForAssignment(input.partnerSlug, order);
  const breakdown = await computeBenefitForItems(order, items, partner);

  const rentalDiscount = Math.round(breakdown.reduce((s, b) => s + b.rentalDiscount, 0) * 100) / 100;
  const deliveryDiscount = Math.round(breakdown.reduce((s, b) => s + b.deliveryDiscount, 0) * 100) / 100;
  const totalDiscount = Math.round((rentalDiscount + deliveryDiscount) * 100) / 100;

  const currentFinalTotal = Number(order.final_total ?? 0);
  const newFinalTotal = Math.max(0, Math.round((currentFinalTotal - totalDiscount) * 100) / 100);
  const totalPaid = await totalPaidForOrder(order.id);
  const overpaidAmount = Math.max(0, Math.round((totalPaid - newFinalTotal) * 100) / 100);

  if (overpaidAmount > 0 && !input.refund) {
    const err = new Error('This discount creates an overpayment — a refund method is required to complete the assignment.');
    (err as Error & { statusCode?: number; code?: string; overpaidAmount?: number }).statusCode = 422;
    (err as Error & { code?: string }).code = 'REFUND_REQUIRED';
    (err as Error & { overpaidAmount?: number }).overpaidAmount = overpaidAmount;
    throw err;
  }

  const itemUpdates = breakdown.map((b) => ({
    id: b.itemId,
    discount: b.newDiscount,
    pickup_fee: b.newPickupFee,
    dropoff_fee: b.newDropoffFee,
  }));

  const { data: rpcData, error: rpcErr } = await sb.rpc('assign_partner_to_order_atomic', {
    p_order_id: order.id,
    p_store_id: order.store_id,
    p_partner_ref: partner.slug,
    p_employee_id: input.employeeId,
    p_rental_discount: rentalDiscount,
    p_delivery_discount: deliveryDiscount,
    p_item_updates: itemUpdates,
  });
  if (rpcErr) throw new Error(`Failed to assign partner to order: ${rpcErr.message}`);
  const resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const finalTotal = Number((resultRow as { final_total?: number })?.final_total ?? newFinalTotal);

  let refundedAmount = 0;
  if (overpaidAmount > 0 && input.refund) {
    await refundOrder(deps, {
      orderId: order.id,
      amount: overpaidAmount,
      refundMethodId: input.refund.refundMethodId,
      refundAccountId: input.refund.refundAccountId,
      receivableAccountId: input.refund.receivableAccountId,
      reason: input.refund.reason ?? `Retroactive partner assignment (${partner.name}) — discount overpayment refund`,
      // The revenue impact is already recorded above (final_total + orders_raw.rental_value_raw
      // were reduced directly by the discount), so this refund is a pure cash-out — it must NOT
      // also be tagged as affecting rental revenue, or the commission base would be double-counted.
      affectsRentalRevenue: false,
      transactionDate: new Date().toISOString().slice(0, 10),
    });
    refundedAmount = overpaidAmount;
  }

  const balanceDue = calculateBalanceDue(finalTotal, totalPaid - refundedAmount);

  return {
    partnerName: partner.name,
    rentalDiscount,
    deliveryDiscount,
    totalDiscount,
    finalTotal,
    balanceDue,
    refundedAmount,
  };
}
