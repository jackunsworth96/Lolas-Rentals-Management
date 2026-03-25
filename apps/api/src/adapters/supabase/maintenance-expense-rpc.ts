import { getSupabaseClient } from './client.js';

export interface CreateMaintenanceExpenseParams {
  expenseId: string;
  maintenanceId: string;
  storeId: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paidFrom: string | null;
  vehicleId: string;
  employeeId: string | null;
  expenseAccountId: string;
  cashAccountId: string;
  jeDebitId: string;
  jeCreditId: string;
  transactionId: string;
}

export interface UpdateMaintenanceExpenseParams {
  expenseId: string;
  amount: number;
  description: string;
  expenseAccountId: string;
  cashAccountId: string;
  jeDebitId: string;
  jeCreditId: string;
  transactionId: string;
}

export async function createMaintenanceExpenseRpc(params: CreateMaintenanceExpenseParams): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.rpc('create_maintenance_expense', {
    p_expense_id: params.expenseId,
    p_maintenance_id: params.maintenanceId,
    p_store_id: params.storeId,
    p_date: params.date,
    p_category: params.category,
    p_description: params.description,
    p_amount: params.amount,
    p_paid_from: params.paidFrom,
    p_vehicle_id: params.vehicleId,
    p_employee_id: params.employeeId,
    p_expense_account_id: params.expenseAccountId,
    p_cash_account_id: params.cashAccountId,
    p_je_debit_id: params.jeDebitId,
    p_je_credit_id: params.jeCreditId,
    p_transaction_id: params.transactionId,
  });
  if (error) throw new Error(`create_maintenance_expense RPC failed: ${error.message}`);
}

export async function updateMaintenanceExpenseRpc(params: UpdateMaintenanceExpenseParams): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.rpc('update_maintenance_expense', {
    p_expense_id: params.expenseId,
    p_amount: params.amount,
    p_description: params.description,
    p_expense_account_id: params.expenseAccountId,
    p_cash_account_id: params.cashAccountId,
    p_je_debit_id: params.jeDebitId,
    p_je_credit_id: params.jeCreditId,
    p_transaction_id: params.transactionId,
  });
  if (error) throw new Error(`update_maintenance_expense RPC failed: ${error.message}`);
}

export async function deleteMaintenanceExpenseRpc(maintenanceId: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.rpc('delete_maintenance_expense', {
    p_maintenance_id: maintenanceId,
  });
  if (error) throw new Error(`delete_maintenance_expense RPC failed: ${error.message}`);
}

export async function findExpenseByMaintenanceId(maintenanceId: string): Promise<{ id: string; amount: number } | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('expenses')
    .select('id, amount')
    .eq('maintenance_id', maintenanceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up expense for maintenance ${maintenanceId}: ${error.message}`);
  return data ? { id: data.id as string, amount: Number(data.amount) } : null;
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
