import { describe, expect, it, vi } from 'vitest';
import { Permission, SAFE_PAYMENT_METHOD_ID } from '@lolas/shared';

type Row = Record<string, unknown>;

const accounts: Row[] = [
  { id: 'CASH-LOLA', name: 'Cash Drawer Lola\'s', account_type: 'Asset', is_active: true, store_id: 'store-lolas' },
  { id: 'SAFE-store-lolas', name: 'Safe', account_type: 'Asset', is_active: true, store_id: 'company' },
  { id: 'SAFE-OLD', name: 'Old Safe', account_type: 'Asset', is_active: false, store_id: 'company' },
];

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => ({
    from: () => {
      const filters: Array<(r: Row) => boolean> = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
        ilike: (c: string, p: string) => {
          const needle = p.replace(/%/g, '').toLowerCase();
          filters.push((r) => String(r[c]).toLowerCase().includes(needle));
          return q;
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: accounts.filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return q;
    },
  }),
}));

const { assertCanPayFrom, resolvePaidFrom } = await import('../src/use-cases/expenses/expense-context.js');
const { computeCashupDay } = await import('../src/use-cases/cashup/cashup-calc.js');

const manager = { employeeId: 'e1', permissions: [Permission.EditAccounts] };
const staff = { employeeId: 'e2', permissions: [] as string[] };

describe('paying an expense from the Safe', () => {
  it('resolves to the active company Safe account', async () => {
    await expect(resolvePaidFrom('store-lolas', SAFE_PAYMENT_METHOD_ID)).resolves.toBe('SAFE-store-lolas');
  });

  it('only lets managers pay from the Safe', () => {
    expect(() => assertCanPayFrom(SAFE_PAYMENT_METHOD_ID, manager)).not.toThrow();
    expect(() => assertCanPayFrom(SAFE_PAYMENT_METHOD_ID, staff)).toThrow('Only a manager can pay from the Safe.');
    expect(() => assertCanPayFrom('Cash', staff)).not.toThrow();
  });

  it('does not take a Safe-paid expense out of the till at cash-up', () => {
    const expense = (id: string, paidFromName: string, amount: number) => ({
      id, category: 'Rent', description: null, amount, paidFrom: null, paidFromName,
      employeeId: null, date: '2026-11-23', createdAt: null,
    });
    const day = computeCashupDay({
      payments: [], bankDepositEntries: [], interStoreEntries: [], miscSales: [], charityEntries: [],
      refundJournalEntries: [], transferIncomeEntries: [], depositAppliedEntries: [], appliedOrderDepositPayments: [],
      depositSwapEntries: [], envelopeAccountId: 'ENVELOPE', completedOrderIds: new Set(), orderInfo: new Map(),
      transferCustomerNames: new Map(), discountOrders: [],
      expenses: [expense('x1', 'Safe', 20000), expense('x2', 'Cash Drawer Lola\'s', 150)],
    });
    expect(day.totals.cashExpenseTotal).toBe(150);
  });
});
