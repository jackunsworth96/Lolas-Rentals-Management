import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysToDateStr, formatManilaDate } from '../../utils/manila-date.js';
import {
  computeCashupDay,
  ledgerLines,
  ledgerNet,
  round2,
  type CashLedgerItem,
  type CashupDayResult,
  type CashupRawData,
  type ExpectedLine,
  type OrderInfo,
  type RawJournal,
  type RawPayment,
} from './cashup-calc.js';

/** Gaps longer than this are flagged but not summed (too much to carry blindly). */
const MAX_GAP_DAYS = 31;

export interface FetchRange {
  storeId: string;
  dateFrom: string;
  dateTo: string;
  /** Only rows created after this instant (post-lock carry). */
  createdAfter?: string | null;
  /** Skip info-only sections (discounts, charity) for carry fetches. */
  includeInfo?: boolean;
}

type Row = Record<string, unknown>;

function num(v: unknown): number {
  return Number(v ?? 0);
}
function str(v: unknown): string | null {
  return v == null ? null : String(v);
}
function joinOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function toJournal(j: Row): RawJournal {
  const acct = joinOne(j.chart_of_accounts as { name: string } | { name: string }[] | null);
  return {
    id: String(j.id),
    description: str(j.description),
    debit: num(j.debit),
    credit: num(j.credit),
    referenceId: str(j.reference_id),
    accountId: str(j.account_id),
    accountName: acct?.name ?? null,
    date: str(j.date),
    createdAt: str(j.created_at),
  };
}

function toPayment(p: Row): RawPayment {
  const customer = joinOne(p.customers as { name: string } | { name: string }[] | null);
  const order = joinOne(
    p.orders as { woo_order_id: string | null; booking_token: string | null } | { woo_order_id: string | null; booking_token: string | null }[] | null,
  );
  return {
    id: String(p.id),
    paymentType: String(p.payment_type ?? ''),
    amount: num(p.amount),
    paymentMethodId: String(p.payment_method_id ?? ''),
    transactionDate: str(p.transaction_date),
    settlementRef: str(p.settlement_ref),
    settlementStatus: str(p.settlement_status),
    orderId: str(p.order_id),
    customerName: customer?.name ?? null,
    wooOrderId: order?.woo_order_id ?? null,
    bookingToken: order?.booking_token ?? null,
    createdAt: str(p.created_at),
  };
}

const PAYMENT_SELECT =
  'id, payment_type, amount, payment_method_id, transaction_date, settlement_ref, settlement_status, customer_id, order_id, created_at, customers!customer_id(name), orders!order_id(woo_order_id, booking_token)';
const JOURNAL_SELECT =
  'id, description, debit, credit, date, created_at, reference_id, account_id, chart_of_accounts!account_id(name)';

/** Loads every row the cash-up needs for one store and date range. */
export async function fetchCashupRaw(sb: SupabaseClient, range: FetchRange): Promise<CashupRawData> {
  const { storeId, dateFrom, dateTo, createdAfter, includeInfo = true } = range;

  // supabase-js builders are thenable and chainable; typing them loosely keeps
  // the shared range/created-after filters in one helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inRange = (q: any, dateCol: string, createdCol = 'created_at') => {
    let out = q.eq('store_id', storeId).gte(dateCol, dateFrom).lte(dateCol, dateTo);
    if (createdAfter) out = out.gt(createdCol, createdAfter);
    return out;
  };
  const journal = (refType: string) =>
    inRange(sb.from('journal_entries').select(JOURNAL_SELECT), 'date').eq('reference_type', refType);

  let expensesQ = sb
    .from('expenses')
    .select('id, category, description, amount, paid_from, employee_id, date, created_at, paid_at, chart_of_accounts!paid_from(name)')
    .eq('store_id', storeId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .eq('status', 'paid');
  if (createdAfter) {
    expensesQ = expensesQ.or(`paid_at.gt.${createdAfter},and(paid_at.is.null,created_at.gt.${createdAfter})`);
  }

  const [
    paymentsRes, expensesRes, bankDepRes, interStoreRes, miscRes, charityRes,
    completedRes, discountRes, refundJRes, transferIncRes, appliedRes,
  ] = await Promise.all([
    inRange(sb.from('payments').select(PAYMENT_SELECT), 'transaction_date').order('created_at', { ascending: true }),
    expensesQ.order('created_at', { ascending: true }),
    journal('cash_deposit').order('created_at', { ascending: true }),
    journal('inter_store_transfer').order('created_at', { ascending: true }),
    inRange(
      sb.from('misc_sales').select('id, description, category, amount, received_into, employee_id, date, created_at, chart_of_accounts!received_into(id, name)'),
      'date',
    ).order('created_at', { ascending: true }),
    includeInfo
      ? journal('order_charity').gt('credit', 0).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    sb
      .from('orders')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'completed')
      .or(`settled_at.lt.${dateFrom}T00:00:00+08:00,settled_at.is.null`),
    includeInfo && !createdAfter
      ? sb
          .from('orders')
          .select('id, woo_order_id, booking_token, customers!customer_id(name), order_items!order_id(id, vehicle_name, discount)')
          .eq('store_id', storeId)
          .gte('order_date', dateFrom)
          .lte('order_date', dateTo)
      : Promise.resolve({ data: [], error: null }),
    journal('refund').gt('credit', 0).order('created_at', { ascending: true }),
    journal('transfer').gt('debit', 0).order('created_at', { ascending: true }),
    journal('deposit').gt('credit', 0).order('created_at', { ascending: true }),
  ]);

  const checks: Array<[string, { error: { message: string } | null }]> = [
    ['Payments', paymentsRes], ['Expenses', expensesRes], ['Cash deposits', bankDepRes],
    ['Inter-store transfers', interStoreRes], ['Misc sales', miscRes], ['Charity', charityRes],
    ['Completed orders', completedRes], ['Discounts', discountRes], ['Refund journal', refundJRes],
    ['Transfer income', transferIncRes], ['Deposit applied', appliedRes],
  ];
  for (const [name, res] of checks) {
    if (res.error) throw new Error(`${name} query failed: ${res.error.message}`);
  }

  const payments = ((paymentsRes.data ?? []) as Row[]).map(toPayment);
  const refundJournalEntries = ((refundJRes.data ?? []) as Row[]).map(toJournal);
  const depositAppliedEntries = ((appliedRes.data ?? []) as Row[]).map(toJournal);
  const transferIncomeEntries = ((transferIncRes.data ?? []) as Row[]).map(toJournal);
  const charityEntries = ((charityRes.data ?? []) as Row[]).map(toJournal);

  // Deposits for orders whose deposit was applied in range — needed to know
  // how much of the applied amount was cash (moves envelope → till).
  const appliedOrderIds = [...new Set(depositAppliedEntries.map((j) => j.referenceId).filter((v): v is string => !!v))];
  let appliedOrderDepositPayments: RawPayment[] = [];
  if (appliedOrderIds.length > 0) {
    const { data, error } = await sb
      .from('payments')
      .select(PAYMENT_SELECT)
      .in('order_id', appliedOrderIds)
      .in('payment_type', ['deposit', 'security_deposit'])
      .lte('transaction_date', dateTo)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Applied-deposit lookup failed: ${error.message}`);
    appliedOrderDepositPayments = ((data ?? []) as Row[]).map(toPayment);
  }

  // Order labels for every order referenced anywhere above.
  const orderIds = new Set<string>();
  for (const p of payments) if (p.orderId) orderIds.add(p.orderId);
  for (const j of refundJournalEntries) if (j.referenceId) orderIds.add(j.referenceId);
  for (const id of appliedOrderIds) orderIds.add(id);
  const orderInfo = new Map<string, OrderInfo>();
  if (orderIds.size > 0) {
    const { data } = await sb
      .from('orders')
      .select('id, booking_token, deposit_method_id, customers!customer_id(name)')
      .in('id', [...orderIds]);
    for (const o of (data ?? []) as Row[]) {
      const customer = joinOne(o.customers as { name: string } | { name: string }[] | null);
      orderInfo.set(String(o.id), {
        bookingToken: str(o.booking_token),
        customerName: customer?.name ?? null,
        depositMethodId: str(o.deposit_method_id),
      });
    }
  }

  const transferCustomerNames = new Map<string, string>();
  const transferRefIds = [...new Set(transferIncomeEntries.map((e) => e.referenceId).filter((v): v is string => !!v))];
  if (transferRefIds.length > 0) {
    const { data } = await sb.from('transfers').select('id, customer_name').in('id', transferRefIds);
    for (const t of (data ?? []) as Row[]) transferCustomerNames.set(String(t.id), String(t.customer_name ?? ''));
  }

  // Replace raw order UUIDs in charity descriptions with customer names.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const charityOrderIds = charityEntries.map((c) => c.referenceId).filter((id): id is string => !!id && uuidRegex.test(id));
  if (charityOrderIds.length > 0) {
    const { data } = await sb.from('orders_raw').select('id, customer_name').in('id', charityOrderIds);
    const nameById = new Map(
      ((data ?? []) as Row[]).filter((r) => r.customer_name).map((r) => [String(r.id), String(r.customer_name)]),
    );
    for (const c of charityEntries) {
      const name = c.referenceId ? nameById.get(c.referenceId) : undefined;
      if (name && c.description) c.description = c.description.replace(`Order ${c.referenceId}`, name);
    }
  }

  return {
    payments,
    expenses: ((expensesRes.data ?? []) as Row[]).map((e) => {
      const acct = joinOne(e.chart_of_accounts as { name: string } | { name: string }[] | null);
      return {
        id: String(e.id),
        category: str(e.category),
        description: str(e.description),
        amount: num(e.amount),
        paidFrom: str(e.paid_from),
        paidFromName: acct?.name ?? null,
        employeeId: str(e.employee_id),
        date: str(e.date),
        createdAt: str(e.paid_at) ?? str(e.created_at),
      };
    }),
    bankDepositEntries: ((bankDepRes.data ?? []) as Row[]).map(toJournal),
    interStoreEntries: ((interStoreRes.data ?? []) as Row[]).map(toJournal),
    miscSales: ((miscRes.data ?? []) as Row[]).map((m) => {
      const acct = joinOne(m.chart_of_accounts as { id: string; name: string } | { id: string; name: string }[] | null);
      return {
        id: String(m.id),
        description: str(m.description),
        category: str(m.category),
        amount: num(m.amount),
        receivedInto: str(m.received_into),
        accountName: acct?.name ?? null,
        employeeId: str(m.employee_id),
        date: str(m.date),
        createdAt: str(m.created_at),
      };
    }),
    charityEntries,
    refundJournalEntries,
    transferIncomeEntries,
    depositAppliedEntries,
    appliedOrderDepositPayments,
    completedOrderIds: new Set(((completedRes.data ?? []) as Row[]).map((o) => String(o.id))),
    orderInfo,
    transferCustomerNames,
    discountOrders: ((discountRes.data ?? []) as Row[]).map((o) => {
      const customer = joinOne(o.customers as { name: string } | { name: string }[] | null);
      return {
        id: String(o.id),
        orderRef: str(o.booking_token) ?? str(o.woo_order_id),
        customerName: customer?.name ?? null,
        items: ((o.order_items ?? []) as Row[]).map((i) => ({
          id: String(i.id),
          vehicleName: str(i.vehicle_name),
          discount: num(i.discount),
        })),
      };
    }),
  };
}

export interface CarryGroup {
  label: string;
  fromDate: string;
  toDate: string;
  tillNet: number;
  envelopeNet: number;
  items: CashLedgerItem[];
}

export interface ExpectedBreakdown {
  opening: number;
  lines: ExpectedLine[];
  total: number;
}

export interface ReconciliationView {
  id: string;
  isLocked: boolean;
  openingBalance: number;
  actualCounted: number;
  variance: number;
  varianceType: string | null;
  varianceNote: string | null;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  overriddenBy: string | null;
  overriddenByName: string | null;
  overriddenAt: string | null;
  overrideReason: string | null;
  tillCounted: number | null;
  depositsCounted: number | null;
  tillExpected: number | null;
  depositsExpected: number | null;
  tillVariance: number | null;
  depositVariance: number | null;
  tillDenoms: Record<string, number> | null;
  depositDenoms: Record<string, number> | null;
  closingBalance: number | null;
  depositsClosingBalance: number | null;
}

export interface CashupSummary extends Omit<CashupDayResult, 'cashLedger'> {
  date: string;
  today: string;
  isFuture: boolean;
  openingFloat: {
    amount: number;
    source: 'previous_day' | 'override' | 'none';
    previousDate: string | null;
  };
  openingEnvelopeBalance: number;
  /** Dates between the last locked cash-up and this date that were never locked. */
  missingDays: string[];
  /** True when the gap was too long to carry automatically. */
  gapTooLong: boolean;
  carry: CarryGroup[];
  expected: { till: ExpectedBreakdown; envelope: ExpectedBreakdown };
  /** Kept for older clients: till + envelope expected. */
  expectedCash: number;
  /** Entries posted to this date after it was locked (carried into the next cash-up). */
  postedAfterLock: CarryGroup | null;
  /** Earliest later date that is already locked (its opening changes if this day is reopened). */
  laterLockedDate: string | null;
  cashLedger: CashLedgerItem[];
  stores: Array<{ id: string; name: string; defaultFloatAmount: number }>;
  otherStores: Array<{ id: string; name: string; defaultFloatAmount: number }>;
  reconciliation: ReconciliationView | null;
  isLocked: boolean;
}

function datesBetweenExclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let d = addDaysToDateStr(from, 1);
  while (d < to && out.length <= MAX_GAP_DAYS + 1) {
    out.push(d);
    d = addDaysToDateStr(d, 1);
  }
  return out;
}

function toReconView(r: Row, names: Map<string, string>): ReconciliationView {
  const n = (v: unknown) => (v != null ? Number(v) : null);
  return {
    id: String(r.id),
    isLocked: !!r.is_locked,
    openingBalance: num(r.opening_balance),
    actualCounted: num(r.actual_counted),
    variance: num(r.variance),
    varianceType: str(r.variance_type),
    varianceNote: str(r.variance_note),
    submittedBy: str(r.submitted_by),
    submittedByName: r.submitted_by ? names.get(String(r.submitted_by)) ?? null : null,
    submittedAt: str(r.submitted_at),
    overriddenBy: str(r.overridden_by),
    overriddenByName: r.overridden_by ? names.get(String(r.overridden_by)) ?? null : null,
    overriddenAt: str(r.overridden_at),
    overrideReason: str(r.override_reason),
    tillCounted: n(r.till_counted),
    depositsCounted: n(r.deposits_counted),
    tillExpected: n(r.till_expected),
    depositsExpected: n(r.deposits_expected),
    tillVariance: n(r.till_variance),
    depositVariance: n(r.deposit_variance),
    tillDenoms: (r.till_denoms as Record<string, number>) ?? null,
    depositDenoms: (r.deposit_denoms as Record<string, number>) ?? null,
    closingBalance: n(r.closing_balance),
    depositsClosingBalance: n(r.deposits_closing_balance),
  };
}

async function loadCarryGroup(
  sb: SupabaseClient,
  label: string,
  range: FetchRange,
): Promise<CarryGroup> {
  const raw = await fetchCashupRaw(sb, { ...range, includeInfo: false });
  const day = computeCashupDay(raw);
  return {
    label,
    fromDate: range.dateFrom,
    toDate: range.dateTo,
    tillNet: ledgerNet(day.cashLedger, 'till'),
    envelopeNet: ledgerNet(day.cashLedger, 'envelope'),
    items: day.cashLedger,
  };
}

function shortDate(d: string): string {
  return new Date(`${d}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

/**
 * Builds the full Cash Up view for one store and date. This is the single
 * source of truth for expected till / envelope figures: the page displays
 * them and /reconcile stores them.
 */
export async function buildCashupSummary(
  sb: SupabaseClient,
  storeId: string,
  date: string,
): Promise<CashupSummary> {
  const today = formatManilaDate();

  const [raw, reconRes, prevRes, laterRes, storesRes] = await Promise.all([
    fetchCashupRaw(sb, { storeId, dateFrom: date, dateTo: date }),
    sb.from('cash_reconciliation').select('*').eq('store_id', storeId).eq('date', date).maybeSingle(),
    sb
      .from('cash_reconciliation')
      .select('date, closing_balance, till_counted, deposits_closing_balance, submitted_at, overridden_by')
      .eq('store_id', storeId)
      .eq('is_locked', true)
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('cash_reconciliation')
      .select('date')
      .eq('store_id', storeId)
      .eq('is_locked', true)
      .gt('date', date)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    sb.from('stores').select('id, name, default_float_amount').eq('is_active', true).neq('id', 'company'),
  ]);
  if (reconRes.error) throw new Error(`Reconciliation query failed: ${reconRes.error.message}`);
  if (prevRes.error) throw new Error(`Previous reconciliation query failed: ${prevRes.error.message}`);
  if (laterRes.error) throw new Error(`Later reconciliation query failed: ${laterRes.error.message}`);

  const day = computeCashupDay(raw);
  const prev = prevRes.data as Row | null;
  const recon = reconRes.data as Row | null;

  let openingTill = 0;
  let openingEnvelope = 0;
  let openingSource: 'previous_day' | 'override' | 'none' = 'none';
  const carry: CarryGroup[] = [];
  let missingDays: string[] = [];
  let gapTooLong = false;

  if (prev) {
    const prevDate = String(prev.date);
    openingTill = num(prev.closing_balance ?? prev.till_counted);
    openingEnvelope = num(prev.deposits_closing_balance);
    openingSource = prev.overridden_by ? 'override' : 'previous_day';

    const gap = datesBetweenExclusive(prevDate, date);
    missingDays = gap.slice(0, MAX_GAP_DAYS);
    gapTooLong = gap.length > MAX_GAP_DAYS;

    const carryLoads: Array<Promise<CarryGroup>> = [];
    if (prev.submitted_at) {
      carryLoads.push(
        loadCarryGroup(sb, `After the ${shortDate(prevDate)} cash-up`, {
          storeId,
          dateFrom: prevDate,
          dateTo: prevDate,
          createdAfter: String(prev.submitted_at),
        }),
      );
    }
    if (gap.length > 0 && !gapTooLong) {
      const from = gap[0];
      const to = gap[gap.length - 1];
      carryLoads.push(
        loadCarryGroup(
          sb,
          from === to ? `${shortDate(from)} (not cashed up)` : `${shortDate(from)} – ${shortDate(to)} (not cashed up)`,
          { storeId, dateFrom: from, dateTo: to },
        ),
      );
    }
    for (const g of await Promise.all(carryLoads)) {
      if (g.items.length > 0) carry.push(g);
    }
  }

  let postedAfterLock: CarryGroup | null = null;
  if (recon?.is_locked && recon.submitted_at) {
    const g = await loadCarryGroup(sb, 'Posted after this day was locked', {
      storeId,
      dateFrom: date,
      dateTo: date,
      createdAfter: String(recon.submitted_at),
    });
    if (g.items.length > 0) postedAfterLock = g;
  }

  const buildPot = (pot: 'till' | 'envelope', opening: number): ExpectedBreakdown => {
    const lines: ExpectedLine[] = [];
    for (const g of carry) {
      const amount = pot === 'till' ? g.tillNet : g.envelopeNet;
      const count = g.items.filter((i) => i.pot === pot).length;
      if (count > 0) lines.push({ key: `carry:${g.fromDate}:${g.label}`, label: g.label, amount, count, note: 'carried' });
    }
    lines.push(...ledgerLines(day.cashLedger, pot));
    const total = round2(opening + lines.reduce((s, l) => s + l.amount, 0));
    return { opening, lines, total };
  };
  const till = buildPot('till', openingTill);
  const envelope = buildPot('envelope', openingEnvelope);

  const employeeIds = [recon?.submitted_by, recon?.overridden_by].filter((v): v is string => !!v);
  const names = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data } = await sb.from('employees').select('id, full_name').in('id', employeeIds);
    for (const e of (data ?? []) as Row[]) names.set(String(e.id), String(e.full_name ?? ''));
  }

  const allStores = ((storesRes.data ?? []) as Row[]).map((s) => ({
    id: String(s.id),
    name: String(s.name),
    defaultFloatAmount: Number(s.default_float_amount ?? 3000),
  }));

  const { cashLedger, ...dayView } = day;
  return {
    ...dayView,
    date,
    today,
    isFuture: date > today,
    openingFloat: { amount: openingTill, source: openingSource, previousDate: prev ? String(prev.date) : null },
    openingEnvelopeBalance: openingEnvelope,
    missingDays,
    gapTooLong,
    carry,
    expected: { till, envelope },
    expectedCash: round2(till.total + envelope.total),
    postedAfterLock,
    laterLockedDate: laterRes.data ? String((laterRes.data as Row).date) : null,
    cashLedger,
    stores: allStores,
    otherStores: allStores.filter((s) => s.id !== storeId),
    reconciliation: recon ? toReconView(recon, names) : null,
    isLocked: !!recon?.is_locked,
  };
}
