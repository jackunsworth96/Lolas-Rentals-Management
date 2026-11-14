import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
let existingExpense: { id: string } | null = null;

/** Minimal chainable Supabase stub keyed by table name. */
function builder(table: string) {
  const result = () => {
    switch (table) {
      case 'timesheets':
        return { data: { id: 'ts-1', date: '2026-11-14', employee_id: 'emp-1', store_id: 'store-lolas', nine_pm_returns_count: 1, payroll_status: 'Pending' }, error: null };
      case 'expenses':
        return { data: existingExpense, error: null };
      case 'employees':
        return { data: { full_name: 'Test Staff', nine_pm_bonus_rate: 100 }, error: null };
      default:
        return { data: null, error: null };
    }
  };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lte', 'order', 'limit']) chain[m] = () => chain;
  chain.single = async () => result();
  chain.maybeSingle = async () => result();
  return chain;
}

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => ({ from: (t: string) => builder(t), rpc }),
}));
vi.mock('../src/adapters/supabase/config-repo.js', () => ({
  resolvePayrollLedger: async () => ({ cashAccountId: 'CASH-LOLA', wagesAccountId: 'WAGES' }),
}));

import { syncNinePmPayout } from '../src/use-cases/payroll/nine-pm-payout.js';

describe('syncNinePmPayout (9pm returns are paid through payroll)', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
    existingExpense = null;
  });

  it('never creates a till expense for a timesheet with 9pm returns', async () => {
    const result = await syncNinePmPayout('ts-1', 'emp-9');
    expect(result.amount).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still keeps a pre-existing till payout in step with the timesheet', async () => {
    existingExpense = { id: 'exp-old' };
    const result = await syncNinePmPayout('ts-1', 'emp-9');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('sync_nine_pm_payout');
    expect(result.amount).toBe(100);
  });
});
