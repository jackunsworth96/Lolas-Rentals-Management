import { getSupabaseClient } from './client.js';
import { randomUUID } from 'node:crypto';

export interface UpsertMaintenanceExpensesParams {
  maintenanceId: string;
  storeId: string;
  date: string;
  vehicleId: string;
  employeeId: string | null;
  partsCost: number;
  laborCost: number;
  cashAccountId: string;
  expenseAccountId: string;
  issueDescription: string;
  expenseStatus?: 'paid' | 'unpaid';
}

/**
 * Upserts separate expense rows + journal entry pairs for parts and labour costs.
 * Uses deterministic expense IDs ({maintenanceId}-parts / {maintenanceId}-labour) so
 * repeated calls safely overwrite previous entries without needing a lookup.
 * Delegates to create_expense_with_journal (migration 045/050).
 */
export async function upsertMaintenanceExpensesRpc(
  params: UpsertMaintenanceExpensesParams,
): Promise<void> {
  const sb = getSupabaseClient();
  const period = params.date.slice(0, 7);
  const status = params.expenseStatus ?? 'paid';
  const isPaid = status === 'paid';

  const partsExpenseId = `${params.maintenanceId}-parts`;
  const labourExpenseId = `${params.maintenanceId}-labour`;

  // ── Parts ──
  // Always delete first (idempotent – deletes 0 rows on first run) to avoid
  // duplicate journal entries on subsequent upserts.
  await sb.rpc('delete_expense_with_journal', {
    p_expense_id: partsExpenseId,
    p_reference_type: 'maintenance_parts',
    p_reference_id: params.maintenanceId,
  });
  if (params.partsCost > 0) {
    const desc = `Maintenance parts — ${params.issueDescription}`.slice(0, 200);
    const { error } = await sb.rpc('create_expense_with_journal', {
      p_expense_id: partsExpenseId,
      p_store_id: params.storeId,
      p_date: params.date,
      p_category: 'Maintenance Parts',
      p_description: desc,
      p_amount: params.partsCost,
      p_paid_from: isPaid ? params.cashAccountId : null,
      p_vehicle_id: params.vehicleId,
      p_employee_id: params.employeeId,
      p_account_id: params.expenseAccountId,
      p_status: status,
      p_transaction_id: randomUUID(),
      p_period: period,
      p_journal_date: params.date,
      p_journal_store_id: params.storeId,
      p_created_by: null,
      // Pass empty legs when unpaid — RPC skips journal creation for status='unpaid'
      p_legs: isPaid
        ? [
            {
              id: randomUUID(),
              account_id: params.expenseAccountId,
              debit: params.partsCost,
              credit: 0,
              description: desc,
              reference_type: 'maintenance_parts',
              reference_id: params.maintenanceId,
            },
            {
              id: randomUUID(),
              account_id: params.cashAccountId,
              debit: 0,
              credit: params.partsCost,
              description: desc,
              reference_type: 'maintenance_parts',
              reference_id: params.maintenanceId,
            },
          ]
        : [],
    });
    if (error) throw new Error(`create_expense_with_journal (parts) failed: ${error.message}`);
  }

  // ── Labour ──
  await sb.rpc('delete_expense_with_journal', {
    p_expense_id: labourExpenseId,
    p_reference_type: 'maintenance_labour',
    p_reference_id: params.maintenanceId,
  });
  if (params.laborCost > 0) {
    const desc = `Maintenance labour — ${params.issueDescription}`.slice(0, 200);
    const { error } = await sb.rpc('create_expense_with_journal', {
      p_expense_id: labourExpenseId,
      p_store_id: params.storeId,
      p_date: params.date,
      p_category: 'Maintenance Labour',
      p_description: desc,
      p_amount: params.laborCost,
      p_paid_from: isPaid ? params.cashAccountId : null,
      p_vehicle_id: params.vehicleId,
      p_employee_id: params.employeeId,
      p_account_id: params.expenseAccountId,
      p_status: status,
      p_transaction_id: randomUUID(),
      p_period: period,
      p_journal_date: params.date,
      p_journal_store_id: params.storeId,
      p_created_by: null,
      // Pass empty legs when unpaid — RPC skips journal creation for status='unpaid'
      p_legs: isPaid
        ? [
            {
              id: randomUUID(),
              account_id: params.expenseAccountId,
              debit: params.laborCost,
              credit: 0,
              description: desc,
              reference_type: 'maintenance_labour',
              reference_id: params.maintenanceId,
            },
            {
              id: randomUUID(),
              account_id: params.cashAccountId,
              debit: 0,
              credit: params.laborCost,
              description: desc,
              reference_type: 'maintenance_labour',
              reference_id: params.maintenanceId,
            },
          ]
        : [],
    });
    if (error) throw new Error(`create_expense_with_journal (labour) failed: ${error.message}`);
  }
}

/**
 * Removes both the parts and labour expenses and their journal entries for a
 * given maintenance record. Safe to call even if no expenses exist.
 */
export async function deleteMaintenanceExpenseRpc(maintenanceId: string): Promise<void> {
  const sb = getSupabaseClient();

  const { error: e1 } = await sb.rpc('delete_expense_with_journal', {
    p_expense_id: `${maintenanceId}-parts`,
    p_reference_type: 'maintenance_parts',
    p_reference_id: maintenanceId,
  });
  if (e1) throw new Error(`delete parts expense failed: ${e1.message}`);

  const { error: e2 } = await sb.rpc('delete_expense_with_journal', {
    p_expense_id: `${maintenanceId}-labour`,
    p_reference_type: 'maintenance_labour',
    p_reference_id: maintenanceId,
  });
  if (e2) throw new Error(`delete labour expense failed: ${e2.message}`);
}

/** Looks up a maintenance expense account for the store (type=Expense, name contains 'maintenance' or 'vehicle'). Falls back to the first Expense account. Returns null if none found. */
export async function getMaintenanceExpenseAccount(storeId: string): Promise<string | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('chart_of_accounts')
    .select('id, name, account_type')
    .in('store_id', [storeId, 'company'])
    .eq('account_type', 'Expense')
    .eq('is_active', true);
  if (error) return null;
  const accounts = (data ?? []) as Array<{ id: string; name: string }>;
  const keyword = accounts.find(
    (a) =>
      a.name.toLowerCase().includes('maintenance') ||
      a.name.toLowerCase().includes('vehicle'),
  );
  return (keyword ?? accounts[0])?.id ?? null;
}

export async function getStoreDefaultCashAccount(storeId: string): Promise<string | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('stores')
    .select('default_cash_account_id')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up store defaults: ${error.message}`);
  return data?.default_cash_account_id as string | null ?? null;
}

export async function resolveStoreAccounts(storeId: string): Promise<{
  receivableAccountId: string | null;
  incomeAccountId: string | null;
}> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('chart_of_accounts')
    .select('id, name, account_type')
    .in('store_id', [storeId, 'company'])
    .eq('is_active', true);
  if (error) throw new Error(`Failed to look up accounts: ${error.message}`);

  const accounts = (data ?? []) as Array<{ id: string; name: string; account_type: string }>;

  const receivable = accounts.find(
    (a) => a.account_type === 'Asset' && a.name.toLowerCase().includes('receivable'),
  );
  const income = accounts.find(
    (a) => a.account_type === 'Income' && a.name.toLowerCase().includes('rental'),
  ) ?? accounts.find(
    (a) => a.account_type === 'Income',
  );

  return {
    receivableAccountId: receivable?.id ?? null,
    incomeAccountId: income?.id ?? null,
  };
}

/** The logical account code used in error messages when the charity-payable row is missing. */
const CHARITY_PAYABLE_ACCOUNT_CODE = 'CHARITY-PAYABLE';

/**
 * Resolves the charity-payable Liability account from chart_of_accounts.
 *
 * Behaviour when the row is not found:
 *  - non-production: throws a descriptive Error so the misconfiguration is caught early
 *  - production:     logs console.error and returns null so the caller skips the posting
 */
export async function resolveCharityPayableAccount(storeId: string): Promise<string | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('chart_of_accounts')
    .select('id, name, account_type')
    .in('store_id', [storeId, 'company'])
    .eq('is_active', true);
  if (error) throw new Error(`Failed to look up accounts: ${error.message}`);

  const accounts = (data ?? []) as Array<{ id: string; name: string; account_type: string }>;

  const account =
    accounts.find(
      (a) =>
        a.name.toLowerCase().includes('charity') &&
        a.name.toLowerCase().includes('payable'),
    ) ??
    accounts.find(
      (a) => a.account_type === 'Liability' && a.name.toLowerCase().includes('charity'),
    );

  if (!account) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `chart_of_accounts row not found for account '${CHARITY_PAYABLE_ACCOUNT_CODE}' ` +
          `(store ${storeId}). Ensure a Liability account whose name contains 'charity' ` +
          `exists at the store or company level with is_active = true.`,
      );
    }
    console.error(
      `[account-resolver] chart_of_accounts row not found for '${CHARITY_PAYABLE_ACCOUNT_CODE}' ` +
        `(store ${storeId}) — charity accrual will be skipped.`,
    );
    return null;
  }

  return account.id;
}
