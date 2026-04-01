import { getSupabaseClient } from './client.js';
import type { CashReconciliation, CashReconciliationRepository } from '@lolas/domain';

function toRow(r: CashReconciliation) {
  return {
    id: r.id,
    store_id: r.storeId,
    date: r.date,
    opening_balance: r.openingBalance,
    expected_cash: r.expectedCash,
    actual_counted: r.actualCounted,
    variance: r.variance,
    variance_type: r.varianceType,
    submitted_by: r.submittedBy,
    submitted_at: r.submittedAt?.toISOString() ?? null,
    is_locked: r.isLocked,
    overridden_by: r.overriddenBy,
    overridden_at: r.overriddenAt?.toISOString() ?? null,
    override_reason: r.overrideReason,
    till_counted: r.tillCounted,
    deposits_counted: r.depositsCounted,
    till_denoms: r.tillDenoms,
    deposit_denoms: r.depositDenoms,
    till_expected: r.tillExpected,
    deposits_expected: r.depositsExpected,
    till_variance: r.tillVariance,
    deposit_variance: r.depositVariance,
    closing_balance: r.closingBalance,
  };
}

function toDomain(row: Record<string, unknown>): CashReconciliation {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    date: row.date as string,
    openingBalance: Number(row.opening_balance ?? 0),
    expectedCash: Number(row.expected_cash ?? 0),
    actualCounted: Number(row.actual_counted ?? 0),
    variance: Number(row.variance ?? 0),
    varianceType: (row.variance_type as string) ?? null,
    submittedBy: (row.submitted_by as string) ?? null,
    submittedAt: row.submitted_at ? new Date(row.submitted_at as string) : null,
    isLocked: row.is_locked as boolean,
    overriddenBy: (row.overridden_by as string) ?? null,
    overriddenAt: row.overridden_at ? new Date(row.overridden_at as string) : null,
    overrideReason: (row.override_reason as string) ?? null,
    tillCounted: row.till_counted != null ? Number(row.till_counted) : null,
    depositsCounted: row.deposits_counted != null ? Number(row.deposits_counted) : null,
    tillDenoms: (row.till_denoms as Record<string, number>) ?? null,
    depositDenoms: (row.deposit_denoms as Record<string, number>) ?? null,
    tillExpected: row.till_expected != null ? Number(row.till_expected) : null,
    depositsExpected: row.deposits_expected != null ? Number(row.deposits_expected) : null,
    tillVariance: row.till_variance != null ? Number(row.till_variance) : null,
    depositVariance: row.deposit_variance != null ? Number(row.deposit_variance) : null,
    closingBalance: row.closing_balance != null ? Number(row.closing_balance) : null,
  };
}

export function createCashReconciliationRepo(): CashReconciliationRepository {
  const sb = getSupabaseClient();

  return {
    async findByDate(storeId, date) {
      const { data, error } = await sb
        .from('cash_reconciliation')
        .select('*')
        .eq('store_id', storeId)
        .eq('date', date)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch cash reconciliation: ${error.message}`);
      return data ? toDomain(data) : null;
    },

    async findPreviousDay(storeId, date) {
      const { data, error } = await sb
        .from('cash_reconciliation')
        .select('*')
        .eq('store_id', storeId)
        .lt('date', date)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch previous reconciliation: ${error.message}`);
      return data ? toDomain(data) : null;
    },

    async save(reconciliation) {
      const { error } = await sb
        .from('cash_reconciliation')
        .upsert(toRow(reconciliation));
      if (error) throw new Error(`Failed to save cash reconciliation: ${error.message}`);
    },

    async lock(id) {
      const { error } = await sb
        .from('cash_reconciliation')
        .update({ is_locked: true })
        .eq('id', id);
      if (error) throw new Error(`Failed to lock reconciliation: ${error.message}`);
    },

    async unlock(id) {
      const { error } = await sb
        .from('cash_reconciliation')
        .update({ is_locked: false })
        .eq('id', id);
      if (error) throw new Error(`Failed to unlock reconciliation: ${error.message}`);
    },

    async override(id, actualCounted, overriddenBy, reason) {
      const { error } = await sb
        .from('cash_reconciliation')
        .update({
          actual_counted: actualCounted,
          overridden_by: overriddenBy,
          overridden_at: new Date().toISOString(),
          override_reason: reason,
        })
        .eq('id', id);
      if (error) throw new Error(`Failed to override reconciliation: ${error.message}`);
    },

    async reconcileAtomic(reconciliation) {
      const row = toRow(reconciliation);

      const { error } = await sb.rpc('reconcile_cash_atomic', {
        p_id:                row.id,
        p_store_id:          row.store_id,
        p_date:              row.date,
        p_opening_balance:   row.opening_balance,
        p_expected_cash:     row.expected_cash,
        p_actual_counted:    row.actual_counted,
        p_variance:          row.variance,
        p_variance_type:     row.variance_type,
        p_submitted_by:      row.submitted_by,
        p_submitted_at:      row.submitted_at,
        p_is_locked:         row.is_locked,
        p_overridden_by:     row.overridden_by ?? null,
        p_overridden_at:     row.overridden_at ?? null,
        p_override_reason:   row.override_reason ?? null,
        p_till_counted:      row.till_counted,
        p_deposits_counted:  row.deposits_counted,
        p_till_denoms:       row.till_denoms,
        p_deposit_denoms:    row.deposit_denoms,
        p_till_expected:     row.till_expected,
        p_deposits_expected: row.deposits_expected,
        p_till_variance:     row.till_variance,
        p_deposit_variance:  row.deposit_variance,
        p_closing_balance:   row.closing_balance,
      });

      if (error) throw new Error(`reconcile_cash_atomic RPC failed: ${error.message}`);
    },
  };
}
