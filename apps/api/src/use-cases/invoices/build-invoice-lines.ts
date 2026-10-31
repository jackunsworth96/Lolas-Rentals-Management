import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfigRepository } from '@lolas/domain';
import type {
  InvoiceLine,
  InvoiceLineType,
  InvoiceOrderStage,
  InvoiceOrderSummary,
  InvoicePreview,
} from '@lolas/shared';
import { computeQuote } from '../booking/compute-quote.js';

export interface BuildInvoiceLinesDeps {
  sb: SupabaseClient;
  configRepo: ConfigRepository;
}

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  booking_token: string | null;
  booking_customer_name: string | null;
  final_total: number | string | null;
  security_deposit: number | string | null;
  card_fee_surcharge: number | string | null;
  return_charges: number | string | null;
  return_charges_note: string | null;
  charity_donation: number | string | null;
  customers: { name: string | null; email: string | null } | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  vehicle_name: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  rental_days_count: number | null;
  rental_rate: number | string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  pickup_fee: number | string | null;
  dropoff_fee: number | string | null;
  discount: number | string | null;
};

type OrderAddonRow = {
  order_id: string;
  addon_name: string;
  addon_price: number | string;
  addon_type: 'per_day' | 'one_time';
  quantity: number | null;
  total_amount: number | string;
};

type PaymentRow = {
  order_id: string | null;
  raw_order_id: string | null;
  payment_type: string;
  amount: number | string | null;
  payment_method_id: string | null;
  settlement_status: string | null;
  transaction_date: string | null;
};

type RawRow = {
  id: string;
  status: string;
  booking_channel: string | null;
  order_reference: string | null;
  store_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_company: string | null;
  vehicle_model_id: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  pickup_location_id: number | null;
  dropoff_location_id: number | null;
  addon_ids: number[] | null;
  transfer_amount: number | string | null;
  transfer_route: string | null;
  charity_donation: number | string | null;
  web_quote_raw: number | string | null;
  rental_value_raw: number | string | null;
  payload: Record<string, unknown> | null;
};

const ORDER_SELECT =
  'id, store_id, status, booking_token, booking_customer_name, final_total, security_deposit, card_fee_surcharge, return_charges, return_charges_note, charity_donation, customers!customer_id(name, email)';

const RAW_SELECT =
  'id, status, booking_channel, order_reference, store_id, customer_name, customer_email, customer_company, vehicle_model_id, pickup_datetime, dropoff_datetime, pickup_location_id, dropoff_location_id, addon_ids, transfer_amount, transfer_route, charity_donation, web_quote_raw, rental_value_raw, payload';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const round = (v: number): number => Math.round(v * 100) / 100;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' });
}

function dateRange(from: string | null, to: string | null): string {
  const a = fmtDate(from);
  const b = fmtDate(to);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

function rentalDays(from: string | null, to: string | null): number {
  if (!from || !to) return 1;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.ceil(ms / 86_400_000)) : 1;
}

function stageForOrderStatus(status: string): InvoiceOrderStage {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

function stageForRawStatus(status: string): InvoiceOrderStage {
  return status === 'cancelled' || status === 'skipped' ? 'cancelled' : 'inbox';
}

class LineList {
  readonly lines: InvoiceLine[] = [];
  constructor(private readonly ref: string) {}

  add(lineType: InvoiceLineType, description: string, amount: number, quantity = 1, unitPrice?: number): void {
    const rounded = round(amount);
    if (Math.abs(rounded) < 0.005) return;
    this.lines.push({
      orderReference: this.ref,
      lineType,
      description,
      quantity,
      unitPrice: round(unitPrice ?? (quantity ? amount / quantity : amount)),
      amount: rounded,
    });
  }

  charges(): number {
    return round(this.lines.filter((l) => l.lineType !== 'payment').reduce((s, l) => s + l.amount, 0));
  }

  /** Adds a balancing line so the charges match the system total for the booking. */
  reconcile(target: number, label: string): void {
    const diff = round(target - this.charges());
    if (diff > 0.005) this.add('adjustment', label, diff);
    else if (diff < -0.005) this.add('discount', 'Discounts & waived fees', diff);
  }
}

/** Payment lines are negative (they reduce the balance); refunds are positive. Deposits are tracked separately. */
function addPayments(list: LineList, payments: PaymentRow[], methodNames: Map<string, string>): void {
  for (const p of payments) {
    const amount = num(p.amount);
    if (amount === 0) continue;
    const type = p.payment_type;
    if (type === 'deposit' || type === 'deposit_refund' || type === 'deposit_applied') continue;
    if (type === 'extension' && (p.settlement_status === 'pending' || p.settlement_status === 'absorbed')) continue;
    if (type === 'addon' && p.payment_method_id === 'pending' && p.settlement_status === 'pending') continue;
    const method = p.payment_method_id ? methodNames.get(p.payment_method_id) ?? p.payment_method_id : null;
    const when = fmtDate(p.transaction_date);
    const detail = [method, when].filter(Boolean).join(', ');
    if (type === 'refund') {
      list.add('payment', `Refund${detail ? ` (${detail})` : ''}`, amount);
    } else {
      list.add('payment', `Payment received${detail ? ` (${detail})` : ''}`, -amount);
    }
  }
}

function depositHeld(payments: PaymentRow[]): number {
  const paid = payments.filter((p) => p.payment_type === 'deposit').reduce((s, p) => s + num(p.amount), 0);
  const refunded = payments.filter((p) => p.payment_type === 'deposit_refund').reduce((s, p) => s + Math.abs(num(p.amount)), 0);
  return Math.max(0, round(paid - refunded));
}

function summarise(
  base: Omit<InvoiceOrderSummary, 'charges' | 'paid' | 'lines'>,
  list: LineList,
): InvoiceOrderSummary {
  const paid = round(-list.lines.filter((l) => l.lineType === 'payment').reduce((s, l) => s + l.amount, 0));
  return { ...base, charges: list.charges(), paid, lines: list.lines };
}

async function loadPaymentMethodNames(sb: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await sb.from('payment_methods').select('id, name');
  return new Map(((data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
}

async function buildActivatedOrder(
  sb: SupabaseClient,
  ref: string,
  order: OrderRow,
  methodNames: Map<string, string>,
): Promise<InvoiceOrderSummary> {
  const [itemsRes, addonsRes, paymentsRes, transfersRes, rawRes] = await Promise.all([
    sb.from('order_items')
      .select('id, order_id, vehicle_name, pickup_datetime, dropoff_datetime, rental_days_count, rental_rate, pickup_location, dropoff_location, pickup_fee, dropoff_fee, discount')
      .eq('order_id', order.id)
      .order('created_at'),
    sb.from('order_addons')
      .select('order_id, addon_name, addon_price, addon_type, quantity, total_amount')
      .eq('order_id', order.id)
      .order('added_at'),
    sb.from('payments')
      .select('order_id, raw_order_id, payment_type, amount, payment_method_id, settlement_status, transaction_date')
      .eq('order_id', order.id)
      .order('created_at'),
    sb.from('transfers').select('route, total_price').eq('order_id', order.id),
    order.booking_token
      ? sb.from('orders_raw').select('customer_company').eq('order_reference', order.booking_token).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [itemsRes, addonsRes, paymentsRes]) {
    if (r.error) throw new Error(`Failed to load order ${ref}: ${r.error.message}`);
  }

  const items = (itemsRes.data ?? []) as OrderItemRow[];
  const addons = (addonsRes.data ?? []) as OrderAddonRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const transfers = (transfersRes.data ?? []) as { route: string | null; total_price: number | string | null }[];

  const list = new LineList(ref);
  for (const item of items) {
    const days = num(item.rental_days_count) || rentalDays(item.pickup_datetime, item.dropoff_datetime);
    const rate = num(item.rental_rate);
    const vehicle = item.vehicle_name?.trim() || 'Vehicle rental';
    const range = dateRange(item.pickup_datetime, item.dropoff_datetime);
    list.add('rental', `${vehicle} rental${range ? `, ${range}` : ''} (${days} day${days === 1 ? '' : 's'})`, days * rate, days, rate);
    list.add('fee', `Delivery${item.pickup_location ? ` – ${item.pickup_location}` : ''}`, num(item.pickup_fee));
    list.add('fee', `Collection${item.dropoff_location ? ` – ${item.dropoff_location}` : ''}`, num(item.dropoff_fee));
    list.add('discount', `Discount – ${vehicle}`, -num(item.discount));
  }
  for (const a of addons) {
    const qty = num(a.quantity) || 1;
    const total = num(a.total_amount);
    list.add('addon', `${a.addon_name}${a.addon_type === 'per_day' ? ' (per day)' : ''}`, total, qty, total / qty);
  }
  list.add('surcharge', 'Card payment surcharge', num(order.card_fee_surcharge));
  list.add('charity', 'Charity donation', num(order.charity_donation));
  list.add('return_charge', `Return charges${order.return_charges_note ? ` – ${order.return_charges_note}` : ''}`, num(order.return_charges));

  const finalTotal = round(num(order.final_total));
  for (const t of transfers) {
    const price = num(t.total_price);
    if (price > 0 && finalTotal - list.charges() >= price - 0.005) {
      list.add('transfer', `Transfer${t.route ? ` – ${t.route}` : ''}`, price);
    }
  }
  list.reconcile(finalTotal, 'Extensions & other charges');
  addPayments(list, payments, methodNames);

  const stage = stageForOrderStatus(order.status);
  const pickups = items.map((i) => i.pickup_datetime).filter(Boolean) as string[];
  const dropoffs = items.map((i) => i.dropoff_datetime).filter(Boolean) as string[];
  return summarise({
    orderReference: ref,
    stage,
    customerName: order.booking_customer_name?.trim() || order.customers?.name || null,
    customerEmail: order.customers?.email?.trim() || null,
    customerCompany: (rawRes.data as { customer_company?: string | null } | null)?.customer_company?.trim() || null,
    storeId: order.store_id,
    pickupDatetime: pickups.sort()[0] ?? null,
    dropoffDatetime: dropoffs.sort().at(-1) ?? null,
    depositHeld: stage === 'completed' ? 0 : depositHeld(payments),
  }, list);
}

async function buildRawOrder(
  deps: BuildInvoiceLinesDeps,
  ref: string,
  raw: RawRow,
  methodNames: Map<string, string>,
): Promise<InvoiceOrderSummary> {
  const { sb } = deps;
  const payload = raw.payload ?? {};
  const [paymentsRes, modelRes] = await Promise.all([
    sb.from('payments')
      .select('order_id, raw_order_id, payment_type, amount, payment_method_id, settlement_status, transaction_date')
      .eq('raw_order_id', raw.id)
      .order('created_at'),
    raw.vehicle_model_id
      ? sb.from('vehicle_models').select('name').eq('id', raw.vehicle_model_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (paymentsRes.error) throw new Error(`Failed to load payments for ${ref}: ${paymentsRes.error.message}`);
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const modelName = (modelRes.data as { name?: string } | null)?.name ?? null;

  const list = new LineList(ref);
  const range = dateRange(raw.pickup_datetime, raw.dropoff_datetime);
  const lineItems = Array.isArray(payload.line_items) ? (payload.line_items as Record<string, unknown>[]) : [];
  let target: number | null = raw.web_quote_raw != null ? num(raw.web_quote_raw) : null;

  if (raw.booking_channel !== 'direct' && raw.booking_channel !== 'walk_in' && lineItems.length > 0) {
    for (const li of lineItems) {
      const qty = num(li.quantity) || 1;
      const total = num(li.total ?? li.subtotal);
      list.add('rental', `${String(li.name ?? 'Rental')}${range ? `, ${range}` : ''}`, total, qty, total / qty);
    }
    const payloadTotal = num(payload.total ?? payload.order_total);
    if (payloadTotal > 0) target = payloadTotal;
  } else {
    const days = num(payload.rental_days) || rentalDays(raw.pickup_datetime, raw.dropoff_datetime);
    const label = `${modelName ?? 'Vehicle'} rental${range ? `, ${range}` : ''} (${days} day${days === 1 ? '' : 's'})`;
    const dailyRate = num(payload.daily_rate);

    let quote: Awaited<ReturnType<typeof computeQuote>> | null = null;
    if (raw.store_id && raw.vehicle_model_id && raw.pickup_datetime && raw.dropoff_datetime && raw.pickup_location_id && raw.dropoff_location_id) {
      try {
        quote = await computeQuote({ configRepo: deps.configRepo }, {
          storeId: raw.store_id,
          vehicleModelId: raw.vehicle_model_id,
          pickupDatetime: raw.pickup_datetime,
          dropoffDatetime: raw.dropoff_datetime,
          pickupLocationId: Number(raw.pickup_location_id),
          dropoffLocationId: Number(raw.dropoff_location_id),
          addonIds: raw.addon_ids && raw.addon_ids.length > 0 ? raw.addon_ids.map(Number) : undefined,
        });
      } catch {
        quote = null;
      }
    }

    const rentalValue = raw.rental_value_raw != null
      ? num(raw.rental_value_raw)
      : dailyRate > 0 ? dailyRate * days : quote?.rentalSubtotal ?? 0;
    list.add('rental', label, rentalValue, days, rentalValue / days);
    list.add('discount', 'Discount', -num(payload.discount));
    if (quote) {
      list.add('fee', 'Delivery', quote.pickupFee);
      list.add('fee', 'Collection', quote.dropoffFee);
      for (const a of quote.addons) {
        list.add('addon', `${a.name}${a.type === 'per_day' ? ' (per day)' : ''}`, a.total);
      }
    }
    if (target == null && num(payload.grand_total) > 0) target = num(payload.grand_total);
  }

  list.add('transfer', `Transfer${raw.transfer_route ? ` – ${raw.transfer_route}` : ''}`, num(raw.transfer_amount));
  list.add('charity', 'Charity donation', num(raw.charity_donation));
  if (target != null && target > 0) list.reconcile(target, 'Card surcharge & other fees');
  addPayments(list, payments, methodNames);

  const billing = payload.billing as Record<string, unknown> | undefined;
  const billingName = `${billing?.first_name ?? ''} ${billing?.last_name ?? ''}`.trim();
  return summarise({
    orderReference: ref,
    stage: stageForRawStatus(raw.status),
    customerName: raw.customer_name?.trim() || billingName || null,
    customerEmail: raw.customer_email?.trim() || (billing?.email ? String(billing.email) : null),
    customerCompany: raw.customer_company?.trim() || (billing?.company ? String(billing.company) : null),
    storeId: raw.store_id,
    pickupDatetime: raw.pickup_datetime,
    dropoffDatetime: raw.dropoff_datetime,
    depositHeld: depositHeld(payments),
  }, list);
}

/**
 * Resolves an order reference to the live record: the activated order
 * (`orders.booking_token`, or its id) when it exists, otherwise the inbox row
 * (`orders_raw.order_reference`, or its id).
 */
async function buildOne(
  deps: BuildInvoiceLinesDeps,
  ref: string,
  methodNames: Map<string, string>,
): Promise<InvoiceOrderSummary | null> {
  const { sb } = deps;
  let { data: order } = await sb.from('orders').select(ORDER_SELECT).eq('booking_token', ref).maybeSingle();
  if (!order) ({ data: order } = await sb.from('orders').select(ORDER_SELECT).eq('id', ref).maybeSingle());
  if (order) return buildActivatedOrder(sb, ref, order as unknown as OrderRow, methodNames);

  let { data: raw } = await sb.from('orders_raw').select(RAW_SELECT).eq('order_reference', ref)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!raw && UUID_RE.test(ref)) ({ data: raw } = await sb.from('orders_raw').select(RAW_SELECT).eq('id', ref).maybeSingle());
  if (raw) return buildRawOrder(deps, ref, raw as unknown as RawRow, methodNames);

  return null;
}

export async function buildInvoiceLines(
  deps: BuildInvoiceLinesDeps,
  orderReferences: string[],
): Promise<InvoicePreview> {
  const refs = [...new Set(orderReferences.map((r) => r.trim()).filter(Boolean))];
  const methodNames = await loadPaymentMethodNames(deps.sb);
  const results = await Promise.all(refs.map((ref) => buildOne(deps, ref, methodNames)));

  const orders: InvoiceOrderSummary[] = [];
  const missing: string[] = [];
  results.forEach((r, i) => (r ? orders.push(r) : missing.push(refs[i])));

  const subtotal = round(orders.reduce((s, o) => s + o.charges, 0));
  const amountPaid = round(orders.reduce((s, o) => s + o.paid, 0));
  return {
    orders,
    missing,
    subtotal,
    amountPaid,
    balanceDue: round(subtotal - amountPaid),
    depositHeld: round(orders.reduce((s, o) => s + o.depositHeld, 0)),
  };
}
