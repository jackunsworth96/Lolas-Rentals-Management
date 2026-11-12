import { describe, it, expect, vi } from 'vitest';
import type { CashReconciliation, CashReconciliationRepository } from '@lolas/domain';
import {
  accountMethodCategory,
  computeCashupDay,
  ledgerLines,
  ledgerNet,
  paymentMethodCategory,
  type CashupRawData,
  type RawJournal,
  type RawPayment,
} from '../src/use-cases/cashup/cashup-calc.js';
import { reconcileCash, type ExpectedFigures } from '../src/use-cases/cashup/reconcile-cash.js';
import { reopenReconciliation } from '../src/use-cases/cashup/reopen-reconciliation.js';

const DATE = '2026-11-04';

function raw(overrides: Partial<CashupRawData> = {}): CashupRawData {
  return {
    payments: [],
    expenses: [],
    bankDepositEntries: [],
    interStoreEntries: [],
    miscSales: [],
    charityEntries: [],
    refundJournalEntries: [],
    transferIncomeEntries: [],
    depositAppliedEntries: [],
    appliedOrderDepositPayments: [],
    depositSwapEntries: [],
    envelopeAccountId: 'ENVELOPE',
    completedOrderIds: new Set(),
    orderInfo: new Map(),
    transferCustomerNames: new Map(),
    discountOrders: [],
    ...overrides,
  };
}

function payment(p: Partial<RawPayment> & Pick<RawPayment, 'id' | 'paymentType' | 'amount' | 'paymentMethodId'>): RawPayment {
  return {
    transactionDate: DATE,
    settlementRef: null,
    settlementStatus: null,
    orderId: null,
    customerName: null,
    wooOrderId: null,
    bookingToken: null,
    createdAt: `${DATE}T02:00:00Z`,
    ...p,
  };
}

function journal(j: Partial<RawJournal> & Pick<RawJournal, 'id'>): RawJournal {
  return {
    description: null,
    debit: 0,
    credit: 0,
    referenceId: null,
    accountId: null,
    accountName: null,
    date: DATE,
    createdAt: `${DATE}T03:00:00Z`,
    ...j,
  };
}

describe('method classification', () => {
  it('treats GCash accounts as GCash even though the name contains "cash"', () => {
    expect(accountMethodCategory('GCash - Lolas')).toBe('gcash');
    expect(accountMethodCategory('Cash on Hand - Lolas')).toBe('cash');
    expect(accountMethodCategory('PayMaya')).toBe('gcash');
    expect(paymentMethodCategory('gcash')).toBe('gcash');
    expect(paymentMethodCategory('Cash')).toBe('cash');
  });
});

describe('computeCashupDay', () => {
  it('keeps GCash misc sales and GCash transfer bookings out of the till', () => {
    const day = computeCashupDay(
      raw({
        miscSales: [
          { id: 'm1', description: 'Helmet', category: 'Retail', amount: 300, receivedInto: 'a1', accountName: 'GCash - Lolas', employeeId: null, date: DATE, createdAt: null },
          { id: 'm2', description: 'Water', category: 'Retail', amount: 50, receivedInto: 'a2', accountName: 'Cash on Hand', employeeId: null, date: DATE, createdAt: null },
        ],
        transferIncomeEntries: [journal({ id: 't1', debit: 1200, accountName: 'GCash - Lolas', referenceId: 'tr1' })],
      }),
    );
    expect(day.totals.miscGcashTotal).toBe(300);
    expect(day.totals.miscCashTotal).toBe(50);
    expect(day.totals.gcashSalesTotal).toBe(1200);
    expect(ledgerNet(day.cashLedger, 'till')).toBe(50);
  });

  it('only cash deposit returns come out of the envelope', () => {
    const day = computeCashupDay(
      raw({
        payments: [
          payment({ id: 'r1', paymentType: 'deposit_refund', amount: 1000, paymentMethodId: 'cash', orderId: 'o1' }),
          payment({ id: 'r2', paymentType: 'deposit_refund', amount: 2000, paymentMethodId: 'gcash', orderId: 'o2' }),
        ],
        refundJournalEntries: [
          // journal leg for r1 is de-duplicated against the payment row
          journal({ id: 'j1', credit: 1000, accountName: 'Cash on Hand', referenceId: 'r1' }),
          // journal-only GCash return
          journal({ id: 'j2', credit: 500, accountName: 'GCash - Lolas', referenceId: 'o3' }),
        ],
        orderInfo: new Map([
          ['o1', { bookingToken: 'LR-1101-45A6', customerName: 'Ana', depositMethodId: 'cash' }],
          ['o2', { bookingToken: 'LR-1102-0000', customerName: 'Ben', depositMethodId: 'cash' }],
        ]),
      }),
    );
    expect(day.transactions.depositReturns).toHaveLength(3);
    expect(day.totals.cashDepositReturnTotal).toBe(1000);
    expect(day.totals.nonCashDepositReturnTotal).toBe(2500);
    expect(ledgerNet(day.cashLedger, 'envelope')).toBe(-1000);
    const ben = day.transactions.depositReturns.find((r) => r.id === 'r2')!;
    expect(ben.affectsEnvelope).toBe(false);
    expect(ben.collectedMethodId).toBe('cash');
    expect(day.transactions.depositReturns.find((r) => r.id === 'r1')!.bookingToken).toBe('LR-1101-45A6');
  });

  it('splits a cash deposit between the rental (to till) and the refund (from envelope)', () => {
    const day = computeCashupDay(
      raw({
        // ₱3,000 deposit: ₱800 applied to rental charges, ₱2,200 returned in cash
        depositAppliedEntries: [journal({ id: 'ap1', credit: 800, referenceId: 'o1' })],
        appliedOrderDepositPayments: [
          payment({ id: 'dep1', paymentType: 'deposit', amount: 3000, paymentMethodId: 'cash', orderId: 'o1', transactionDate: '2026-11-01' }),
        ],
        payments: [payment({ id: 'ref1', paymentType: 'deposit_refund', amount: 2200, paymentMethodId: 'cash', orderId: 'o1' })],
      }),
    );
    expect(day.totals.carryDepositsCashTotal).toBe(800);
    expect(day.totals.cashSalesTotal).toBe(800);
    expect(ledgerNet(day.cashLedger, 'till')).toBe(800);
    expect(ledgerNet(day.cashLedger, 'envelope')).toBe(-3000);
    expect(ledgerLines(day.cashLedger, 'envelope').map((l) => [l.key, l.amount])).toEqual([
      ['deposit_return', -2200],
      ['deposit_applied', -800],
    ]);
  });

  it('pays a cash return of a GCash deposit from the till, leaving the envelope alone', () => {
    const day = computeCashupDay(
      raw({
        payments: [payment({ id: 'r1', paymentType: 'deposit_refund', amount: 1000, paymentMethodId: 'cash', orderId: 'o1' })],
        refundJournalEntries: [],
        depositSwapEntries: [journal({ id: 's1', credit: 1000, accountId: 'TILL', accountName: 'Cash on Hand', referenceId: 'o1' })],
        orderInfo: new Map([['o1', { bookingToken: 'LR-1', customerName: 'Ana', depositMethodId: 'gcash' }]]),
      }),
    );
    expect(ledgerNet(day.cashLedger, 'envelope')).toBe(0);
    expect(ledgerNet(day.cashLedger, 'till')).toBe(-1000);
    expect(day.transactions.crossMethodDepositReturns).toEqual([
      expect.objectContaining({ action: 'till_payout', amount: 1000, bookingToken: 'LR-1', collectedMethodId: 'gcash' }),
    ]);
    expect(day.totals.crossMethodTillPayoutTotal).toBe(1000);
  });

  it('moves envelope cash to the till when a cash deposit is refunded by GCash', () => {
    const day = computeCashupDay(
      raw({
        payments: [payment({ id: 'r1', paymentType: 'deposit_refund', amount: 1000, paymentMethodId: 'gcash', orderId: 'o1' })],
        depositSwapEntries: [
          journal({ id: 's1', debit: 1000, accountId: 'TILL', accountName: 'Cash on Hand', referenceId: 'o1' }),
          journal({ id: 's2', credit: 1000, accountId: 'ENVELOPE', accountName: 'Cash — Customer Deposit Envelope', referenceId: 'o1' }),
        ],
      }),
    );
    expect(ledgerNet(day.cashLedger, 'envelope')).toBe(-1000);
    expect(ledgerNet(day.cashLedger, 'till')).toBe(1000);
    expect(day.totals.nonCashDepositReturnTotal).toBe(1000);
    expect(day.totals.crossMethodEnvelopeToTillTotal).toBe(1000);
    expect(ledgerLines(day.cashLedger, 'envelope').map((l) => l.key)).toEqual(['deposit_release_out']);
  });

  it('splits a cash return of a mixed deposit between the envelope and the till', () => {
    const day = computeCashupDay(
      raw({
        payments: [payment({ id: 'r1', paymentType: 'deposit_refund', amount: 1000, paymentMethodId: 'cash', orderId: 'o1' })],
        depositSwapEntries: [journal({ id: 's1', credit: 400, accountId: 'TILL', accountName: 'Cash on Hand', referenceId: 'o1' })],
      }),
    );
    expect(ledgerNet(day.cashLedger, 'envelope')).toBe(-600);
    expect(ledgerNet(day.cashLedger, 'till')).toBe(-400);
  });

  it('does not count deposits of orders already settled as held', () => {
    const day = computeCashupDay(
      raw({
        payments: [payment({ id: 'd1', paymentType: 'deposit', amount: 1000, paymentMethodId: 'cash', orderId: 'done' })],
        completedOrderIds: new Set(['done']),
      }),
    );
    expect(day.totals.depositsHeldTotal).toBe(0);
    expect(day.cashLedger).toHaveLength(0);
  });

  it('builds the ledger used for expected figures and carry-forward', () => {
    const day = computeCashupDay(
      raw({
        payments: [
          payment({ id: 'p1', paymentType: 'rental', amount: 5000, paymentMethodId: 'cash' }),
          payment({ id: 'p2', paymentType: 'rental', amount: 4000, paymentMethodId: 'card' }),
          payment({ id: 'p3', paymentType: 'deposit', amount: 2000, paymentMethodId: 'cash', orderId: 'o9' }),
          payment({ id: 'p4', paymentType: 'refund', amount: 300, paymentMethodId: 'cash' }),
        ],
        expenses: [
          { id: 'e1', category: 'Fuel', description: 'Gas', amount: 500, paidFrom: 'a', paidFromName: 'Cash on Hand', employeeId: null, date: DATE, createdAt: null },
          { id: 'e2', category: 'Fuel', description: 'Gas', amount: 700, paidFrom: 'b', paidFromName: 'GCash - Lolas', employeeId: null, date: DATE, createdAt: null },
        ],
        bankDepositEntries: [journal({ id: 'b1', credit: 1000, accountName: 'BPI' })],
      }),
    );
    expect(ledgerNet(day.cashLedger, 'till')).toBe(5000 - 300 - 500 - 1000);
    expect(ledgerNet(day.cashLedger, 'envelope')).toBe(2000);
    expect(day.transactions.expenses.find((e) => e.id === 'e2')!.isCash).toBe(false);
    expect(ledgerLines(day.cashLedger, 'till').map((l) => l.key)).toEqual([
      'cash_sale',
      'cash_expense',
      'bank_deposit',
      'cash_refund',
    ]);

    // A late entry posted after the previous day was locked is a ledger in
    // its own right; adding its net to the opening gives the carried figure.
    const lateReturn = computeCashupDay(
      raw({ payments: [payment({ id: 'late', paymentType: 'deposit_refund', amount: 1000, paymentMethodId: 'cash' })] }),
    );
    const openingEnvelope = 27_025;
    expect(openingEnvelope + ledgerNet(lateReturn.cashLedger, 'envelope')).toBe(26_025);
  });
});

function fakeRepo(initial: CashReconciliation | null) {
  let current = initial;
  const repo: CashReconciliationRepository = {
    findByDate: vi.fn(async () => current),
    findByDateRange: vi.fn(async () => []),
    save: vi.fn(async () => undefined),
    reconcileAtomic: vi.fn(async (r: CashReconciliation) => {
      current = { ...r, isLocked: true };
    }),
    reopen: vi.fn(async (_id: string, by: string, reason: string) => {
      if (current) current = { ...current, isLocked: false, overriddenBy: by, overrideReason: reason, overriddenAt: new Date() };
    }),
  } as unknown as CashReconciliationRepository;
  return { repo, get: () => current };
}

const tillOf = (amount: number) => ({ '1000': Math.floor(amount / 1000), '500': (amount % 1000) / 500 });

describe('reconcileCash', () => {
  const expected: ExpectedFigures = { openingTill: 5000, tillExpected: 20_000, envelopeExpected: 0 };

  it('stores the counted figure as the closing float, not the expected one', async () => {
    const { repo, get } = fakeRepo(null);
    await reconcileCash(
      { storeId: 's', date: DATE, tillDenoms: tillOf(20_500), depositDenoms: {}, varianceNote: 'Found ₱500 in the drawer', submittedBy: 'emp' },
      { cashReconciliation: repo, today: DATE, loadExpected: async () => expected },
    );
    const saved = get()!;
    expect(saved.isLocked).toBe(true);
    expect(saved.tillCounted).toBe(20_500);
    expect(saved.closingBalance).toBe(20_500);
    expect(saved.tillVariance).toBe(500);
    expect(saved.variance).toBe(500);
    expect(saved.expectedCash).toBe(20_000);
    expect(saved.varianceNote).toBe('Found ₱500 in the drawer');
  });

  it('requires a note when the variance is over the threshold', async () => {
    const { repo } = fakeRepo(null);
    await expect(
      reconcileCash(
        { storeId: 's', date: DATE, tillDenoms: tillOf(20_500), depositDenoms: {}, submittedBy: 'emp' },
        { cashReconciliation: repo, today: DATE, loadExpected: async () => expected },
      ),
    ).rejects.toThrow(/Explain the variance/);
  });

  it('rejects future dates and locked days', async () => {
    const { repo } = fakeRepo({ id: 'x', isLocked: true } as CashReconciliation);
    const input = { storeId: 's', date: DATE, tillDenoms: tillOf(20_000), depositDenoms: {}, submittedBy: 'emp' };
    await expect(
      reconcileCash(input, { cashReconciliation: repo, today: '2026-11-03', loadExpected: async () => expected }),
    ).rejects.toThrow(/future/);
    await expect(
      reconcileCash(input, { cashReconciliation: repo, today: DATE, loadExpected: async () => expected }),
    ).rejects.toThrow(/locked/);
  });

  it('a cash drop lowers the closing float without creating a variance', async () => {
    const { repo, get } = fakeRepo(null);
    let dropped = 0;
    await reconcileCash(
      {
        storeId: 's',
        date: DATE,
        tillDenoms: tillOf(20_000),
        depositDenoms: {},
        cashDrop: { amount: 15_000, cashAccountId: 'cash', bankAccountId: 'bank' },
        submittedBy: 'emp',
      },
      {
        cashReconciliation: repo,
        today: DATE,
        recordCashDrop: async ({ amount }) => {
          dropped = amount;
        },
        loadExpected: async () => ({ ...expected, tillExpected: expected.tillExpected - dropped }),
      },
    );
    expect(get()!.closingBalance).toBe(5000);
    expect(get()!.tillVariance).toBe(0);
  });

  it('reopen then recount replaces the closing float', async () => {
    const { repo, get } = fakeRepo(null);
    const deps = { cashReconciliation: repo, today: DATE, loadExpected: async () => expected };
    await reconcileCash({ storeId: 's', date: DATE, tillDenoms: tillOf(20_000), depositDenoms: {}, submittedBy: 'emp' }, deps);
    expect(get()!.closingBalance).toBe(20_000);

    await reopenReconciliation({ storeId: 's', date: DATE, reopenedBy: 'mgr', reason: 'Recount' }, { cashReconciliation: repo });
    expect(get()!.isLocked).toBe(false);
    expect(get()!.closingBalance).toBe(20_000);

    await reconcileCash(
      { storeId: 's', date: DATE, tillDenoms: tillOf(20_500), depositDenoms: {}, varianceNote: 'Recounted', submittedBy: 'emp' },
      deps,
    );
    expect(get()!.isLocked).toBe(true);
    expect(get()!.closingBalance).toBe(20_500);
    expect(get()!.overrideReason).toBe('Recount');
  });
});

describe('reopenReconciliation', () => {
  it('needs a reason and a locked day', async () => {
    const { repo } = fakeRepo({ id: 'x', isLocked: false } as CashReconciliation);
    await expect(
      reopenReconciliation({ storeId: 's', date: DATE, reopenedBy: 'mgr', reason: ' ' }, { cashReconciliation: repo }),
    ).rejects.toThrow(/reason/);
    await expect(
      reopenReconciliation({ storeId: 's', date: DATE, reopenedBy: 'mgr', reason: 'x' }, { cashReconciliation: repo }),
    ).rejects.toThrow(/already open/);
  });
});
