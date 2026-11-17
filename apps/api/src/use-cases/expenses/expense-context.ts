import {
  type ConfigRepository,
  type ExpenseCatalogEntry,
  type ExpenseKind,
  EntryRejectedError,
  round2,
} from '@lolas/domain';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';

type Row = Record<string, unknown>;

export interface ExpenseActor {
  employeeId: string | null;
  permissions: string[];
}

export const isManager = (a: ExpenseActor) => a.permissions.includes(Permission.EditAccounts);
export const canGrantAdvances = (a: ExpenseActor) => a.permissions.includes(Permission.ManageEmployees);

export interface ResolvedCategory extends ExpenseCatalogEntry {
  groupName: string | null;
}

/** The catalog entry as it applies to this store (account resolved to the store's own account). */
export async function loadCategory(
  config: ConfigRepository,
  storeId: string,
  categoryId: number,
): Promise<ResolvedCategory | null> {
  const all = await config.getExpenseCategories(storeId);
  const c = all.find((x) => Number(x.id) === categoryId);
  if (!c) return null;
  return {
    id: Number(c.id),
    name: c.name,
    kind: (c.kind ?? 'standard') as ExpenseKind,
    accountId: c.accountId,
    isActive: c.isActive,
    requiresVehicle: !!c.requiresVehicle,
    requiresEmployee: !!c.requiresEmployee,
    requiresNote: !!c.requiresNote,
    softLimit: c.softLimit == null ? null : Number(c.softLimit),
    managersOnly: !!c.managersOnly,
    helpText: c.helpText ?? null,
    linkPath: c.linkPath ?? null,
    groupName: c.groupName ?? null,
  };
}

export const isCardMethod = (id: string) => ['card', 'creditcard', 'debitcard'].includes(id.toLowerCase().replace(/[\s_-]/g, ''));

/** The account a payment method pays out of at this store, from payment routing. */
export async function resolvePaidFrom(storeId: string, paymentMethodId: string): Promise<string> {
  if (isCardMethod(paymentMethodId)) {
    throw new EntryRejectedError(['Card routes to customer card takings, so it can’t pay an expense. Choose cash, GCash or a bank account.']);
  }
  const { data, error } = await getSupabaseClient()
    .from('payment_routing_rules')
    .select('received_into_account_id')
    .eq('store_id', storeId)
    .eq('payment_method_id', paymentMethodId)
    .limit(1);
  if (error) throw new Error(`Failed to fetch routing rules: ${error.message}`);
  const id = (data?.[0] as Row | undefined)?.received_into_account_id as string | undefined;
  if (!id) throw new EntryRejectedError(['That payment method is not set up for this store. Ask a manager to add it under Settings.']);
  return id;
}

/** Admin-only: book to a different account. Must be an active Expense, Equity or Liability account for this store. */
export async function assertOverrideAccount(storeId: string, accountId: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('chart_of_accounts')
    .select('account_type, store_id, is_active')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load account: ${error.message}`);
  const row = data as Row | null;
  const storeOk = row && (row.store_id === storeId || row.store_id === 'company' || row.store_id == null);
  if (!row || !row.is_active || !storeOk) throw new EntryRejectedError(['The override account is not available for this store.']);
  if (!['Expense', 'Equity', 'Liability'].includes(String(row.account_type))) {
    throw new EntryRejectedError([`Expenses can't be booked to a ${String(row.account_type)} account.`]);
  }
}

export async function countDuplicates(p: {
  storeId: string;
  categoryId: number;
  date: string;
  amount: number;
  employeeId?: string | null;
  vehicleId?: string | null;
  excludeId?: string | null;
}): Promise<number> {
  let q = getSupabaseClient()
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', p.storeId)
    .eq('category_id', p.categoryId)
    .eq('date', p.date)
    .eq('amount', round2(p.amount));
  if (p.employeeId) q = q.eq('employee_id', p.employeeId);
  if (p.vehicleId) q = q.eq('vehicle_id', p.vehicleId);
  if (p.excludeId) q = q.neq('id', p.excludeId);
  const { count, error } = await q;
  if (error) throw new Error(`Failed to check duplicates: ${error.message}`);
  return count ?? 0;
}

export async function loadEmployee(employeeId: string): Promise<{ name: string; active: boolean }> {
  const { data, error } = await getSupabaseClient()
    .from('employees')
    .select('full_name, status')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load employee: ${error.message}`);
  if (!data) throw new EntryRejectedError(['That staff member was not found.']);
  const r = data as Row;
  return { name: String(r.full_name ?? employeeId), active: r.status === 'Active' };
}

export async function assertVehicle(storeId: string, vehicleId: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('fleet')
    .select('id')
    .eq('id', vehicleId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load vehicle: ${error.message}`);
  if (!data) throw new EntryRejectedError(['That vehicle is not part of this store’s fleet.']);
}

export async function allowanceBalance(employeeId: string): Promise<number> {
  const { data, error } = await getSupabaseClient()
    .from('employee_allowance_ledger')
    .select('amount')
    .eq('employee_id', employeeId);
  if (error) throw new Error(`Failed to load allowance ledger: ${error.message}`);
  return round2(((data ?? []) as Row[]).reduce((s, r) => s + Number(r.amount ?? 0), 0));
}

export interface StaffPayoutRow {
  employeeId: string;
  employeeName: string;
  monthlyAllowance: number;
  allowanceBalance: number;
  advanceOutstanding: number;
}

/** Active staff at the store, with what they can still draw and what they still owe. */
export async function listStaffPayoutContext(storeId: string): Promise<StaffPayoutRow[]> {
  const sb = getSupabaseClient();
  const { data: links, error: lErr } = await sb.from('employee_stores').select('employee_id').eq('store_id', storeId);
  if (lErr) throw new Error(`Failed to load store employees: ${lErr.message}`);
  const ids = [...new Set(((links ?? []) as Row[]).map((l) => String(l.employee_id)))];
  if (ids.length === 0) return [];
  const [emp, led, adv] = await Promise.all([
    sb.from('employees').select('id, full_name, status, monthly_bike_allowance').in('id', ids).eq('person_type', 'staff'),
    sb.from('employee_allowance_ledger').select('employee_id, amount').in('employee_id', ids),
    sb.from('cash_advance_schedules').select('employee_id, remaining_balance').in('employee_id', ids).gt('remaining_balance', 0),
  ]);
  for (const r of [emp, led, adv]) if (r.error) throw new Error(`Failed to load staff payouts: ${r.error.message}`);
  const sumBy = (rows: Row[], key: string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(String(r.employee_id), (m.get(String(r.employee_id)) ?? 0) + Number(r[key] ?? 0));
    return m;
  };
  const balances = sumBy((led.data ?? []) as Row[], 'amount');
  const owed = sumBy((adv.data ?? []) as Row[], 'remaining_balance');
  return ((emp.data ?? []) as Row[])
    .filter((e) => e.status === 'Active')
    .map((e) => ({
      employeeId: String(e.id),
      employeeName: String(e.full_name ?? ''),
      monthlyAllowance: Number(e.monthly_bike_allowance ?? 0),
      allowanceBalance: round2(balances.get(String(e.id)) ?? 0),
      advanceOutstanding: round2(owed.get(String(e.id)) ?? 0),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** Expense rows created by allowance payouts, cash advances or 9pm timesheets cannot change type or staff member. */
export async function linkedRecord(expenseId: string): Promise<string | null> {
  const sb = getSupabaseClient();
  const [exp, led, adv] = await Promise.all([
    sb.from('expenses').select('timesheet_id, maintenance_id').eq('id', expenseId).maybeSingle(),
    sb.from('employee_allowance_ledger').select('id', { count: 'exact', head: true }).eq('expense_id', expenseId),
    sb.from('cash_advance_schedules').select('id', { count: 'exact', head: true }).eq('expense_id', expenseId),
  ]);
  if (exp.error) throw new Error(`Failed to load expense links: ${exp.error.message}`);
  const row = exp.data as Row | null;
  if (row?.timesheet_id) return 'a 9pm return on the timesheet';
  if (row?.maintenance_id) return 'a maintenance job';
  if ((led.count ?? 0) > 0) return 'a bike allowance payout';
  if ((adv.count ?? 0) > 0) return 'a cash advance repayment schedule';
  return null;
}
