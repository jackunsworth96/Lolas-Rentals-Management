/**
 * Pure cash-up arithmetic. Takes already-fetched, normalised rows for one
 * store over a date range and buckets them into the same transaction lists
 * the Cash Up page shows, plus a signed `cashLedger` of every entry that
 * physically moves cash in the till or the deposit envelope.
 *
 * Expected till / envelope totals are always derived from `cashLedger`, so
 * the figures shown, the figures stored at reconcile, and the carry-forward
 * of late entries all come from one place.
 */

export type MethodCategory = 'cash' | 'card' | 'gcash' | 'bank';
export type CashPot = 'till' | 'envelope';

export type CashLedgerKind =
  | 'cash_sale'
  | 'misc_cash'
  | 'inter_store_in'
  | 'cash_expense'
  | 'bank_deposit'
  | 'inter_store_out'
  | 'cash_refund'
  | 'deposit_in'
  | 'deposit_return'
  | 'deposit_applied';

export interface CashLedgerItem {
  id: string;
  kind: CashLedgerKind;
  pot: CashPot;
  /** Signed: positive adds cash to the pot, negative removes it. */
  amount: number;
  label: string;
  bookingToken: string | null;
  customerName: string | null;
  date: string | null;
  createdAt: string | null;
}

export interface ExpectedLine {
  key: string;
  label: string;
  amount: number;
  count?: number;
  note?: string;
}

export interface OrderInfo {
  bookingToken: string | null;
  customerName: string | null;
  depositMethodId: string | null;
}

export interface RawPayment {
  id: string;
  paymentType: string;
  amount: number;
  paymentMethodId: string;
  transactionDate: string | null;
  settlementRef: string | null;
  settlementStatus: string | null;
  orderId: string | null;
  customerName: string | null;
  wooOrderId: string | null;
  bookingToken: string | null;
  createdAt: string | null;
}

export interface RawExpense {
  id: string;
  category: string | null;
  description: string | null;
  amount: number;
  paidFrom: string | null;
  paidFromName: string | null;
  employeeId: string | null;
  date: string | null;
  createdAt: string | null;
}

export interface RawJournal {
  id: string;
  description: string | null;
  debit: number;
  credit: number;
  referenceId: string | null;
  accountId: string | null;
  accountName: string | null;
  date: string | null;
  createdAt: string | null;
}

export interface RawMiscSale {
  id: string;
  description: string | null;
  category: string | null;
  amount: number;
  receivedInto: string | null;
  accountName: string | null;
  employeeId: string | null;
  date: string | null;
  createdAt: string | null;
}

export interface RawDiscountOrder {
  id: string;
  orderRef: string | null;
  customerName: string | null;
  items: Array<{ id: string; vehicleName: string | null; discount: number }>;
}

export interface CashupRawData {
  payments: RawPayment[];
  expenses: RawExpense[];
  bankDepositEntries: RawJournal[];
  interStoreEntries: RawJournal[];
  miscSales: RawMiscSale[];
  charityEntries: RawJournal[];
  /** reference_type='refund' credit legs (journal-only deposit returns). */
  refundJournalEntries: RawJournal[];
  /** reference_type='transfer' debit legs (transfer booking income). */
  transferIncomeEntries: RawJournal[];
  /** reference_type='deposit' credit legs (deposit applied to rental). */
  depositAppliedEntries: RawJournal[];
  /** Deposit payments for orders in depositAppliedEntries, collected on or before the range end. */
  appliedOrderDepositPayments: RawPayment[];
  /** Orders whose deposits were settled before the range start (deposit no longer held). */
  completedOrderIds: Set<string>;
  orderInfo: Map<string, OrderInfo>;
  transferCustomerNames: Map<string, string>;
  discountOrders: RawDiscountOrder[];
}

const GCASH_KEYS = new Set(['gcash', 'paymaya']);
const CARD_KEYS = new Set(['card', 'creditcard', 'debitcard']);
const DEPOSIT_TYPES = new Set(['deposit', 'security_deposit']);

export function normaliseMethodKey(raw: string | null | undefined): string {
  return (raw ?? '').toLowerCase().replace(/[\s_-]/g, '');
}

/** Category for a payments.payment_method_id value. */
export function paymentMethodCategory(rawMethodId: string | null | undefined): MethodCategory {
  const key = normaliseMethodKey(rawMethodId);
  if (key === 'cash') return 'cash';
  if (CARD_KEYS.has(key)) return 'card';
  if (GCASH_KEYS.has(key)) return 'gcash';
  return 'bank';
}

/**
 * Category for a chart-of-accounts name. GCash / PayMaya must be tested
 * before "cash" because "gcash" contains the substring "cash".
 */
export function accountMethodCategory(accountName: string | null | undefined): MethodCategory {
  const lower = (accountName ?? '').toLowerCase();
  if (lower.includes('gcash') || lower.includes('paymaya')) return 'gcash';
  if (lower.includes('cash')) return 'cash';
  if (lower.includes('card') || lower.includes('credit') || lower.includes('debit')) return 'card';
  return 'bank';
}

function methodLabel(rawMethodId: string): string {
  const cat = paymentMethodCategory(rawMethodId);
  if (cat === 'cash') return 'Cash';
  if (cat === 'card') return 'Card';
  if (cat === 'gcash') return 'GCash';
  return rawMethodId || 'Other';
}

export interface TransactionRow {
  id: string;
  paymentType: string;
  amount: number;
  methodId: string;
  settlementRef: string | null;
  settlementStatus: string | null;
  customerName: string | null;
  wooOrderId: string | null;
  bookingToken: string | null;
  orderId: string | null;
  createdAt: string | null;
}

export interface DepositReturnRow {
  id: string;
  amount: number;
  description: string | null;
  methodId: string;
  methodCategory: MethodCategory;
  affectsEnvelope: boolean;
  collectedMethodId: string | null;
  referenceId: string | null;
  orderId: string | null;
  bookingToken: string | null;
  customerName: string | null;
  createdAt: string | null;
}

export interface DepositAppliedRow {
  id: string;
  amount: number;
  description: string | null;
  referenceId: string | null;
  bookingToken: string | null;
  customerName: string | null;
  createdAt: string | null;
}

export interface CashupDayResult {
  transactions: {
    cashSales: TransactionRow[];
    cardSales: TransactionRow[];
    gcashSales: TransactionRow[];
    bankTransfer: TransactionRow[];
    pendingExtensions: TransactionRow[];
    depositsHeld: Array<{ label: string; rows: TransactionRow[]; total: number }>;
    miscSales: { cash: unknown[]; card: unknown[]; gcash: unknown[]; bank: unknown[] };
    expenses: Array<RawExpense & { isCash: boolean }>;
    bankDeposits: Array<{ id: string; amount: number; description: string | null; accountName: string | null; referenceId: string | null; createdAt: string | null }>;
    transfersIn: Array<{ id: string; description: string | null; amount: number; referenceId: string | null; createdAt: string | null }>;
    transfersOut: Array<{ id: string; description: string | null; amount: number; referenceId: string | null; createdAt: string | null }>;
    discounts: Array<{ id: string; vehicleName: string | null; amount: number; orderId: string; orderRef: string | null; customerName: string | null }>;
    refunds: TransactionRow[];
    depositReturns: DepositReturnRow[];
    depositApplied: DepositAppliedRow[];
  };
  charityDonations: Array<{ id: string; description: string | null; amount: number; orderId: string | null; createdAt: string | null }>;
  totals: {
    cashSalesTotal: number;
    cashDepositsHeldTotal: number;
    cardSalesTotal: number;
    gcashSalesTotal: number;
    bankTransferTotal: number;
    pendingExtensionsTotal: number;
    depositsHeldTotal: number;
    miscCashTotal: number;
    miscCardTotal: number;
    miscGcashTotal: number;
    miscBankTotal: number;
    miscSalesTotal: number;
    expenseTotal: number;
    cashExpenseTotal: number;
    depositTotal: number;
    interStoreIn: number;
    interStoreOut: number;
    charityDonationsTotal: number;
    discountsTotal: number;
    cashRefundTotal: number;
    cardRefundTotal: number;
    gcashRefundTotal: number;
    bankRefundTotal: number;
    refundTotal: number;
    depositReturnTotal: number;
    cashDepositReturnTotal: number;
    nonCashDepositReturnTotal: number;
    depositAppliedTotal: number;
    carryDepositsCashTotal: number;
  };
  cashLedger: CashLedgerItem[];
}

export function computeCashupDay(raw: CashupRawData): CashupDayResult {
  const ledger: CashLedgerItem[] = [];
  const pushLedger = (item: CashLedgerItem) => {
    if (item.amount !== 0) ledger.push(item);
  };

  const orderToken = (orderId: string | null, fallback: string | null = null) =>
    (orderId ? raw.orderInfo.get(orderId)?.bookingToken : null) ?? fallback;
  const orderCustomer = (orderId: string | null, fallback: string | null = null) =>
    (orderId ? raw.orderInfo.get(orderId)?.customerName : null) ?? fallback;

  const cashSales: TransactionRow[] = [];
  const cardSales: TransactionRow[] = [];
  const gcashSales: TransactionRow[] = [];
  const bankTransfer: TransactionRow[] = [];
  const pendingExtensions: TransactionRow[] = [];
  const refunds: TransactionRow[] = [];
  let cashSalesTotal = 0;
  let cardSalesTotal = 0;
  let gcashSalesTotal = 0;
  let bankTransferTotal = 0;
  let pendingExtensionsTotal = 0;
  let cashRefundTotal = 0;
  let cardRefundTotal = 0;
  let gcashRefundTotal = 0;
  let bankRefundTotal = 0;

  const refundPaymentIds = new Set<string>();
  const depositReturns: DepositReturnRow[] = [];
  const depositsHeldByMethod: Record<string, { label: string; rows: TransactionRow[]; total: number }> = {};
  let depositsHeldTotal = 0;

  const addSale = (cat: MethodCategory, row: TransactionRow) => {
    if (cat === 'cash') {
      cashSales.push(row);
      cashSalesTotal += row.amount;
    } else if (cat === 'card') {
      cardSales.push(row);
      cardSalesTotal += row.amount;
    } else if (cat === 'gcash') {
      gcashSales.push(row);
      gcashSalesTotal += row.amount;
    } else {
      bankTransfer.push(row);
      bankTransferTotal += row.amount;
    }
  };

  for (const p of raw.payments) {
    const paymentType = (p.paymentType ?? '').toLowerCase();
    const row: TransactionRow = {
      id: p.id,
      paymentType: p.paymentType,
      amount: p.amount,
      methodId: p.paymentMethodId,
      settlementRef: p.settlementRef,
      settlementStatus: p.settlementStatus,
      customerName: p.customerName ?? orderCustomer(p.orderId),
      wooOrderId: p.wooOrderId,
      bookingToken: p.bookingToken ?? orderToken(p.orderId),
      orderId: p.orderId,
      createdAt: p.createdAt,
    };
    const cat = paymentMethodCategory(p.paymentMethodId);

    if (paymentType === 'refund') {
      refundPaymentIds.add(p.id);
      refunds.push(row);
      if (cat === 'cash') {
        cashRefundTotal += p.amount;
        pushLedger({
          id: p.id, kind: 'cash_refund', pot: 'till', amount: -p.amount,
          label: 'Cash refund', bookingToken: row.bookingToken, customerName: row.customerName,
          date: p.transactionDate, createdAt: p.createdAt,
        });
      } else if (cat === 'card') cardRefundTotal += p.amount;
      else if (cat === 'gcash') gcashRefundTotal += p.amount;
      else bankRefundTotal += p.amount;
      continue;
    }

    if (paymentType === 'deposit_refund') {
      refundPaymentIds.add(p.id);
      depositReturns.push({
        id: p.id,
        amount: p.amount,
        description: `Deposit refund via ${p.paymentMethodId}`,
        methodId: p.paymentMethodId,
        methodCategory: cat,
        affectsEnvelope: cat === 'cash',
        collectedMethodId: p.orderId ? raw.orderInfo.get(p.orderId)?.depositMethodId ?? null : null,
        referenceId: p.orderId,
        orderId: p.orderId,
        bookingToken: row.bookingToken,
        customerName: row.customerName,
        createdAt: p.createdAt,
      });
      continue;
    }

    if (paymentType === 'extension' && p.settlementStatus === 'pending') {
      pendingExtensions.push(row);
      pendingExtensionsTotal += p.amount;
      continue;
    }
    if (paymentType === 'extension' && p.settlementStatus === 'absorbed') continue;
    if (paymentType === 'addon' && p.paymentMethodId === 'pending' && p.settlementStatus === 'pending') continue;

    if (DEPOSIT_TYPES.has(paymentType)) {
      if (p.orderId && raw.completedOrderIds.has(p.orderId)) continue;
      const label = methodLabel(p.paymentMethodId);
      if (!depositsHeldByMethod[label]) depositsHeldByMethod[label] = { label, rows: [], total: 0 };
      depositsHeldByMethod[label].rows.push(row);
      depositsHeldByMethod[label].total += p.amount;
      depositsHeldTotal += p.amount;
      if (cat === 'cash') {
        pushLedger({
          id: p.id, kind: 'deposit_in', pot: 'envelope', amount: p.amount,
          label: 'Cash deposit taken', bookingToken: row.bookingToken, customerName: row.customerName,
          date: p.transactionDate, createdAt: p.createdAt,
        });
      }
      continue;
    }

    addSale(cat, row);
    if (cat === 'cash') {
      pushLedger({
        id: p.id, kind: 'cash_sale', pot: 'till', amount: p.amount,
        label: `Cash ${p.paymentType}`, bookingToken: row.bookingToken, customerName: row.customerName,
        date: p.transactionDate, createdAt: p.createdAt,
      });
    }
  }

  // ── Misc sales ──
  const misc = { cash: [] as unknown[], card: [] as unknown[], gcash: [] as unknown[], bank: [] as unknown[] };
  const miscTotals = { cash: 0, card: 0, gcash: 0, bank: 0 };
  for (const ms of raw.miscSales) {
    const cat = accountMethodCategory(ms.accountName);
    misc[cat].push({
      id: ms.id,
      description: ms.description,
      category: ms.category,
      amount: ms.amount,
      receivedInto: ms.receivedInto,
      accountName: ms.accountName,
      employeeId: ms.employeeId,
      createdAt: ms.createdAt,
    });
    miscTotals[cat] += ms.amount;
    if (cat === 'cash') {
      pushLedger({
        id: ms.id, kind: 'misc_cash', pot: 'till', amount: ms.amount,
        label: ms.description ?? 'Misc cash sale', bookingToken: null, customerName: null,
        date: ms.date, createdAt: ms.createdAt,
      });
    }
  }

  // ── Journal-only deposit returns (no payments row) ──
  for (const j of raw.refundJournalEntries) {
    if (j.referenceId && refundPaymentIds.has(j.referenceId)) continue;
    const cat = accountMethodCategory(j.accountName);
    const orderId = j.referenceId;
    depositReturns.push({
      id: j.id,
      amount: j.credit,
      description: j.description,
      methodId: j.accountName ?? j.accountId ?? '',
      methodCategory: cat,
      affectsEnvelope: cat === 'cash',
      collectedMethodId: orderId ? raw.orderInfo.get(orderId)?.depositMethodId ?? null : null,
      referenceId: j.referenceId,
      orderId,
      bookingToken: orderToken(orderId),
      customerName: orderCustomer(orderId),
      createdAt: j.createdAt,
    });
  }
  depositReturns.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));

  let cashDepositReturnTotal = 0;
  let nonCashDepositReturnTotal = 0;
  for (const r of depositReturns) {
    if (r.affectsEnvelope) {
      cashDepositReturnTotal += r.amount;
      pushLedger({
        id: r.id, kind: 'deposit_return', pot: 'envelope', amount: -r.amount,
        label: 'Deposit returned in cash', bookingToken: r.bookingToken, customerName: r.customerName,
        date: null, createdAt: r.createdAt,
      });
    } else {
      nonCashDepositReturnTotal += r.amount;
    }
  }
  const depositReturnTotal = cashDepositReturnTotal + nonCashDepositReturnTotal;

  // ── Deposit applied to rental ──
  const depositApplied: DepositAppliedRow[] = raw.depositAppliedEntries.map((j) => ({
    id: j.id,
    amount: j.credit,
    description: j.description,
    referenceId: j.referenceId,
    bookingToken: orderToken(j.referenceId),
    customerName: orderCustomer(j.referenceId),
    createdAt: j.createdAt,
  }));
  const depositAppliedTotal = depositApplied.reduce((s, r) => s + r.amount, 0);

  // The applied portion of a deposit stops being a liability and becomes
  // rental income. For cash deposits the money moves from the envelope into
  // the till, so it is income in the till and an outflow from the envelope.
  // Capped per order at the amount actually applied in this range.
  const appliedByOrder = new Map<string, number>();
  for (const e of raw.depositAppliedEntries) {
    const oid = e.referenceId ?? '';
    appliedByOrder.set(oid, (appliedByOrder.get(oid) ?? 0) + e.credit);
  }
  const reclassifiedByOrder = new Map<string, number>();
  let carryDepositsCashTotal = 0;
  for (const dep of raw.appliedOrderDepositPayments) {
    const orderId = dep.orderId ?? '';
    const cap = appliedByOrder.get(orderId) ?? 0;
    const already = reclassifiedByOrder.get(orderId) ?? 0;
    const toReclassify = Math.min(dep.amount, cap - already);
    if (toReclassify <= 0) continue;
    reclassifiedByOrder.set(orderId, already + toReclassify);

    const cat = paymentMethodCategory(dep.paymentMethodId);
    const row: TransactionRow = {
      id: dep.id,
      paymentType: 'deposit_applied',
      amount: toReclassify,
      methodId: dep.paymentMethodId,
      settlementRef: null,
      settlementStatus: null,
      customerName: dep.customerName ?? orderCustomer(dep.orderId),
      wooOrderId: dep.wooOrderId,
      bookingToken: dep.bookingToken ?? orderToken(dep.orderId),
      orderId: dep.orderId,
      createdAt: dep.createdAt,
    };
    addSale(cat, row);
    if (cat === 'cash') {
      carryDepositsCashTotal += toReclassify;
      pushLedger({
        id: `${dep.id}:applied-in`, kind: 'cash_sale', pot: 'till', amount: toReclassify,
        label: 'Deposit applied to rental (moved from envelope)', bookingToken: row.bookingToken,
        customerName: row.customerName, date: null, createdAt: dep.createdAt,
      });
      pushLedger({
        id: `${dep.id}:applied-out`, kind: 'deposit_applied', pot: 'envelope', amount: -toReclassify,
        label: 'Deposit applied to rental (moved to till)', bookingToken: row.bookingToken,
        customerName: row.customerName, date: null, createdAt: dep.createdAt,
      });
    }
  }

  // ── Transfer booking income ──
  for (const e of raw.transferIncomeEntries) {
    const cat = accountMethodCategory(e.accountName);
    const customerName = raw.transferCustomerNames.get(e.referenceId ?? '') ?? null;
    const row: TransactionRow = {
      id: e.id,
      paymentType: 'transfer',
      amount: e.debit,
      methodId: e.accountName ?? '',
      settlementRef: null,
      settlementStatus: null,
      customerName,
      wooOrderId: null,
      bookingToken: null,
      orderId: null,
      createdAt: e.createdAt,
    };
    addSale(cat, row);
    if (cat === 'cash') {
      pushLedger({
        id: e.id, kind: 'cash_sale', pot: 'till', amount: e.debit,
        label: 'Cash transfer booking', bookingToken: null, customerName,
        date: e.date, createdAt: e.createdAt,
      });
    }
  }

  // ── Expenses ──
  const expenses = raw.expenses.map((e) => ({ ...e, isCash: accountMethodCategory(e.paidFromName) === 'cash' }));
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  let cashExpenseTotal = 0;
  for (const e of expenses) {
    if (!e.isCash) continue;
    cashExpenseTotal += e.amount;
    pushLedger({
      id: e.id, kind: 'cash_expense', pot: 'till', amount: -e.amount,
      label: e.category ?? 'Expense', bookingToken: null, customerName: null,
      date: e.date, createdAt: e.createdAt,
    });
  }

  // ── Cash deposited to bank (pair credit leg with debit destination) ──
  const destByRef = new Map<string, string | null>();
  for (const d of raw.bankDepositEntries) {
    if (d.debit > 0) destByRef.set(String(d.referenceId), d.accountName);
  }
  const bankDeposits = raw.bankDepositEntries
    .filter((d) => d.credit > 0)
    .map((d) => ({
      id: d.id,
      amount: d.credit,
      description: d.description,
      accountName: destByRef.get(String(d.referenceId)) ?? null,
      referenceId: d.referenceId,
      createdAt: d.createdAt,
      date: d.date,
    }));
  const depositTotal = bankDeposits.reduce((s, d) => s + d.amount, 0);
  for (const d of bankDeposits) {
    pushLedger({
      id: d.id, kind: 'bank_deposit', pot: 'till', amount: -d.amount,
      label: d.accountName ? `Cash deposited to ${d.accountName}` : 'Cash deposited',
      bookingToken: null, customerName: null, date: d.date, createdAt: d.createdAt,
    });
  }

  // ── Inter-store transfers ──
  const transfersIn: CashupDayResult['transactions']['transfersIn'] = [];
  const transfersOut: CashupDayResult['transactions']['transfersOut'] = [];
  let interStoreIn = 0;
  let interStoreOut = 0;
  for (const t of raw.interStoreEntries) {
    if (t.debit > 0) {
      transfersIn.push({ id: t.id, description: t.description, amount: t.debit, referenceId: t.referenceId, createdAt: t.createdAt });
      interStoreIn += t.debit;
      pushLedger({
        id: t.id, kind: 'inter_store_in', pot: 'till', amount: t.debit,
        label: t.description ?? 'Transfer in', bookingToken: null, customerName: null,
        date: t.date, createdAt: t.createdAt,
      });
    } else if (t.credit > 0) {
      transfersOut.push({ id: t.id, description: t.description, amount: t.credit, referenceId: t.referenceId, createdAt: t.createdAt });
      interStoreOut += t.credit;
      pushLedger({
        id: t.id, kind: 'inter_store_out', pot: 'till', amount: -t.credit,
        label: t.description ?? 'Transfer out', bookingToken: null, customerName: null,
        date: t.date, createdAt: t.createdAt,
      });
    }
  }

  // ── Info-only sections ──
  const charityDonations = raw.charityEntries.map((c) => ({
    id: c.id,
    description: c.description,
    amount: c.credit,
    orderId: c.referenceId,
    createdAt: c.createdAt,
  }));
  const charityDonationsTotal = charityDonations.reduce((s, r) => s + r.amount, 0);

  const discounts: CashupDayResult['transactions']['discounts'] = [];
  for (const o of raw.discountOrders) {
    for (const item of o.items) {
      if (item.discount <= 0) continue;
      discounts.push({
        id: item.id,
        vehicleName: item.vehicleName,
        amount: item.discount,
        orderId: o.id,
        orderRef: o.orderRef,
        customerName: o.customerName,
      });
    }
  }
  const discountsTotal = discounts.reduce((s, r) => s + r.amount, 0);

  const cashDepositsHeldTotal = depositsHeldByMethod['Cash']?.total ?? 0;
  const refundTotal = cashRefundTotal + cardRefundTotal + gcashRefundTotal + bankRefundTotal;

  return {
    transactions: {
      cashSales,
      cardSales,
      gcashSales,
      bankTransfer,
      pendingExtensions,
      depositsHeld: Object.values(depositsHeldByMethod),
      miscSales: misc,
      expenses,
      bankDeposits,
      transfersIn,
      transfersOut,
      discounts,
      refunds,
      depositReturns,
      depositApplied,
    },
    charityDonations,
    totals: {
      cashSalesTotal,
      cashDepositsHeldTotal,
      cardSalesTotal,
      gcashSalesTotal,
      bankTransferTotal,
      pendingExtensionsTotal,
      depositsHeldTotal,
      miscCashTotal: miscTotals.cash,
      miscCardTotal: miscTotals.card,
      miscGcashTotal: miscTotals.gcash,
      miscBankTotal: miscTotals.bank,
      miscSalesTotal: miscTotals.cash + miscTotals.card + miscTotals.gcash + miscTotals.bank,
      expenseTotal,
      cashExpenseTotal,
      depositTotal,
      interStoreIn,
      interStoreOut,
      charityDonationsTotal,
      discountsTotal,
      cashRefundTotal,
      cardRefundTotal,
      gcashRefundTotal,
      bankRefundTotal,
      refundTotal,
      depositReturnTotal,
      cashDepositReturnTotal,
      nonCashDepositReturnTotal,
      depositAppliedTotal,
      carryDepositsCashTotal,
    },
    cashLedger: ledger,
  };
}

export function ledgerNet(ledger: CashLedgerItem[], pot: CashPot): number {
  return round2(ledger.filter((i) => i.pot === pot).reduce((s, i) => s + i.amount, 0));
}

const TILL_LINE_ORDER: Array<[CashLedgerKind, string]> = [
  ['cash_sale', 'Cash sales'],
  ['misc_cash', 'Misc cash sales'],
  ['inter_store_in', 'Cash transferred in'],
  ['cash_expense', 'Cash expenses'],
  ['bank_deposit', 'Cash deposited to bank'],
  ['inter_store_out', 'Cash transferred out'],
  ['cash_refund', 'Cash refunds'],
];

const ENVELOPE_LINE_ORDER: Array<[CashLedgerKind, string]> = [
  ['deposit_in', 'Cash deposits taken'],
  ['deposit_return', 'Cash deposits returned'],
  ['deposit_applied', 'Deposits applied to rentals (moved to till)'],
];

/** Groups a ledger into ordered expected-cash lines for one pot. */
export function ledgerLines(ledger: CashLedgerItem[], pot: CashPot): ExpectedLine[] {
  const order = pot === 'till' ? TILL_LINE_ORDER : ENVELOPE_LINE_ORDER;
  const lines: ExpectedLine[] = [];
  for (const [kind, label] of order) {
    const items = ledger.filter((i) => i.pot === pot && i.kind === kind);
    if (items.length === 0) continue;
    lines.push({
      key: kind,
      label,
      amount: round2(items.reduce((s, i) => s + i.amount, 0)),
      count: items.length,
    });
  }
  return lines;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
