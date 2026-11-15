import {
  type ConfigRepository,
  type ExpenseCatalogEntry,
  EntryRejectedError,
  ConfirmationRequiredError,
  DomainError,
  checkExpenseEntry,
  round2,
} from '@lolas/domain';
import type { UpdateExpenseRequest } from '@lolas/shared';
import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';
import {
  type ExpenseActor,
  assertOverrideAccount,
  assertVehicle,
  canGrantAdvances,
  countDuplicates,
  isManager,
  linkedRecord,
  loadCategory,
  resolvePaidFrom,
} from './expense-context.js';

type Row = Record<string, unknown>;

export interface StoredExpense {
  id: string;
  storeId: string;
  date: string;
  category: string;
  categoryId: number | null;
  description: string;
  amount: number;
  paidFrom: string | null;
  vehicleId: string | null;
  employeeId: string | null;
  accountId: string | null;
  status: 'paid' | 'unpaid';
  createdBy: string | null;
  createdAt: string;
}

export async function loadStoredExpense(id: string): Promise<StoredExpense> {
  const { data, error } = await getSupabaseClient().from('expenses').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch expense: ${error.message}`);
  if (!data) throw new DomainError('Expense not found');
  const r = data as Row;
  return {
    id: String(r.id),
    storeId: String(r.store_id),
    date: String(r.date),
    category: String(r.category ?? ''),
    categoryId: r.category_id == null ? null : Number(r.category_id),
    description: String(r.description ?? ''),
    amount: Number(r.amount ?? 0),
    paidFrom: (r.paid_from as string | null) ?? null,
    vehicleId: (r.vehicle_id as string | null) ?? null,
    employeeId: (r.employee_id as string | null) ?? null,
    accountId: (r.account_id as string | null) ?? null,
    status: r.status === 'unpaid' ? 'unpaid' : 'paid',
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

/** Staff may only change or remove what they logged themselves, on the same day. */
export function assertCanChange(existing: StoredExpense, actor: ExpenseActor, verb: 'edit' | 'delete'): void {
  if (isManager(actor)) return;
  const today = formatManilaDate();
  const loggedToday = formatManilaDate(new Date(existing.createdAt)) === today;
  if (existing.createdBy !== actor.employeeId || !loggedToday) {
    throw new EntryRejectedError([`You can only ${verb} expenses you logged today. Ask a manager to ${verb} this one.`]);
  }
}

/** Old expenses keep their original type; only the basic checks apply when the type is unchanged. */
function legacyEntry(existing: StoredExpense): ExpenseCatalogEntry {
  return {
    id: existing.categoryId ?? 0,
    name: existing.category,
    kind: 'standard',
    accountId: existing.accountId,
    isActive: true,
    requiresVehicle: false,
    requiresEmployee: false,
    requiresNote: false,
    softLimit: null,
    managersOnly: false,
    helpText: null,
    linkPath: null,
  };
}

export async function updateExpense(
  expenseId: string,
  input: UpdateExpenseRequest,
  actor: ExpenseActor,
  deps: { config: ConfigRepository },
): Promise<{ expenseId: string }> {
  const existing = await loadStoredExpense(expenseId);
  assertCanChange(existing, actor, 'edit');

  const link = await linkedRecord(expenseId);
  if (link) {
    const touchesMoney =
      (input.categoryId !== undefined && input.categoryId !== existing.categoryId) ||
      (input.amount !== undefined && round2(input.amount) !== round2(existing.amount)) ||
      (input.employeeId !== undefined && input.employeeId !== existing.employeeId) ||
      (input.date !== undefined && input.date !== existing.date) ||
      input.paymentMethodId !== undefined ||
      input.accountOverride !== undefined;
    if (touchesMoney) {
      throw new EntryRejectedError([
        `This expense was created by ${link}, so only its description can be edited here. Delete it and log it again to change anything else.`,
      ]);
    }
  }

  const categoryChanged = input.categoryId !== undefined && input.categoryId !== existing.categoryId;
  const current = existing.categoryId != null
    ? await loadCategory(deps.config, existing.storeId, existing.categoryId)
    : null;
  const category = categoryChanged
    ? await loadCategory(deps.config, existing.storeId, input.categoryId!)
    : current ?? legacyEntry(existing);
  if (!category) throw new EntryRejectedError(['That expense type is no longer available. Pick another one.']);
  if (categoryChanged && category.kind !== 'standard') {
    throw new EntryRejectedError(['Staff payouts and cash advances can’t be made by editing another expense. Delete this one and log it again.']);
  }
  if (!link && (current?.kind === 'bike_allowance' || current?.kind === 'cash_advance')) {
    throw new EntryRejectedError(['This staff payout has lost its link to payroll. Ask a manager to delete it and log it again.']);
  }

  const next = {
    date: input.date ?? existing.date,
    amount: round2(input.amount ?? existing.amount),
    description: (input.description ?? existing.description).trim(),
    vehicleId: input.vehicleId !== undefined ? input.vehicleId : existing.vehicleId,
    employeeId: input.employeeId !== undefined ? input.employeeId : existing.employeeId,
  };
  if (next.vehicleId && next.vehicleId !== existing.vehicleId) await assertVehicle(existing.storeId, next.vehicleId);

  const amountOrDayChanged = next.amount !== round2(existing.amount) || next.date !== existing.date || categoryChanged;
  const duplicateCount = amountOrDayChanged && category.id
    ? await countDuplicates({
        storeId: existing.storeId,
        categoryId: category.id,
        date: next.date,
        amount: next.amount,
        employeeId: next.employeeId,
        vehicleId: next.vehicleId,
        excludeId: existing.id,
      })
    : 0;

  const check = link
    ? { errors: [] as string[], confirmations: [] as Array<{ code: 'over_limit' | 'duplicate'; message: string }> }
    : checkExpenseEntry(
        category,
        { ...next, status: existing.status, hasPaymentMethod: existing.status === 'unpaid' || !!existing.paidFrom || !!input.paymentMethodId },
        { today: formatManilaDate(), isManager: isManager(actor), canGrantAdvances: canGrantAdvances(actor), duplicateCount },
      );
  // Over-limit only matters when the amount or type changed.
  if (!amountOrDayChanged) check.confirmations = check.confirmations.filter((c) => c.code !== 'over_limit');

  if (input.accountOverride) {
    if (!isManager(actor)) check.errors.push('Only a manager can change the account an expense books to.');
    else await assertOverrideAccount(existing.storeId, input.accountOverride.accountId);
  }
  if (check.errors.length) throw new EntryRejectedError(check.errors);
  const pending = check.confirmations.filter(
    (c) => !(c.code === 'duplicate' && input.confirmDuplicate) && !(c.code === 'over_limit' && input.confirmOverLimit),
  );
  if (pending.length) throw new ConfirmationRequiredError(pending);

  const accountId = input.accountOverride?.accountId ?? (categoryChanged ? category.accountId : existing.accountId);
  if (!accountId) throw new EntryRejectedError([`"${category.name}" has no account set up for this store.`]);
  const paidFrom = existing.status === 'paid' && input.paymentMethodId
    ? await resolvePaidFrom(existing.storeId, input.paymentMethodId)
    : existing.paidFrom;
  if (existing.status === 'paid' && !paidFrom) throw new EntryRejectedError(['Choose how it was paid.']);

  const memo = input.accountOverride
    ? `${category.name}: ${next.description} [account changed by manager: ${input.accountOverride.reason}]`
    : `${category.name}: ${next.description}`;
  const legs = existing.status === 'paid'
    ? [
        { id: randomUUID(), account_id: accountId, debit: next.amount, credit: 0, description: memo },
        { id: randomUUID(), account_id: paidFrom, debit: 0, credit: next.amount, description: memo },
      ]
    : [];

  const { error } = await getSupabaseClient().rpc('update_expense_with_journal', {
    p: {
      expenseId: existing.id,
      storeId: existing.storeId,
      date: next.date,
      category: category.name,
      categoryId: category.id || existing.categoryId,
      description: next.description,
      amount: next.amount,
      paidFrom,
      vehicleId: next.vehicleId,
      employeeId: next.employeeId,
      accountId,
      transactionId: randomUUID(),
      period: next.date.slice(0, 7),
      createdBy: actor.employeeId,
      legs,
    },
  });
  if (error) throw new Error(`update_expense_with_journal failed: ${error.message}`);
  return { expenseId: existing.id };
}
