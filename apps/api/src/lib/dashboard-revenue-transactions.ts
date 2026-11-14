export interface PaymentRow {
  id: string;
  amount: number | string | null;
  store_id: string;
  payment_type: string | null;
  payment_method_id: string | null;
  order_id: string | null;
  created_at: string;
  orders?: {
    booking_token: string | null;
    woo_order_id: string | null;
    booking_customer_name: string | null;
    customers: { name: string | null } | null;
  } | null;
}

export interface MiscSaleRow {
  id: string;
  amount: number | string | null;
  store_id: string;
  created_at: string;
  description: string | null;
  category: string | null;
}

export interface RevenueTransaction {
  key: string;
  kind: 'payment' | 'misc_sale';
  time: string;
  amount: number;
  storeId: string;
  /** e.g. "Rental payment", or the misc sale's category. */
  label: string;
  method: string | null;
  customerName: string | null;
  reference: string | null;
  orderId: string | null;
}

export interface RevenueTransactions {
  transactions: RevenueTransaction[];
  total: number;
}

function humanise(paymentType: string | null): string {
  const text = (paymentType ?? 'payment').replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Today's income lines, newest first. The total is the same sum the dashboard card shows. */
export function buildRevenueTransactions(input: {
  payments: PaymentRow[];
  miscSales: MiscSaleRow[];
  methodNames: Map<string, string>;
}): RevenueTransactions {
  const transactions: RevenueTransaction[] = [
    ...input.payments.map((p): RevenueTransaction => ({
      key: `payment-${p.id}`,
      kind: 'payment',
      time: p.created_at,
      amount: Number(p.amount ?? 0),
      storeId: p.store_id,
      label: humanise(p.payment_type),
      method: p.payment_method_id ? input.methodNames.get(p.payment_method_id) ?? null : null,
      customerName: p.orders?.booking_customer_name?.trim() || p.orders?.customers?.name?.trim() || null,
      reference: p.orders?.booking_token ?? p.orders?.woo_order_id ?? null,
      orderId: p.order_id,
    })),
    ...input.miscSales.map((m): RevenueTransaction => ({
      key: `misc-${m.id}`,
      kind: 'misc_sale',
      time: m.created_at,
      amount: Number(m.amount ?? 0),
      storeId: m.store_id,
      label: m.description?.trim() || m.category?.trim() || 'Misc sale',
      method: null,
      customerName: null,
      reference: null,
      orderId: null,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return { transactions, total: transactions.reduce((sum, t) => sum + t.amount, 0) };
}
