import type {
  BudgetPort,
  BudgetLine,
  UpsertLine,
  ExpenseActual,
  JournalActual,
  RevenueActual,
} from '@lolas/domain';
import { getSupabaseClient } from './client.js';

function monthOf(dateStr: string): number {
  return parseInt(dateStr.split('-')[1], 10);
}

function dateRange(year: number, month?: number): { from: string; to: string } {
  if (month !== undefined) {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    return {
      from: `${year}-${mm}-01`,
      to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function toBudgetLine(row: Record<string, unknown>): BudgetLine {
  return {
    id: row.id as string,
    budgetPeriodId: row.budget_period_id as string,
    lineType: row.line_type as string,
    categoryLabel: row.category_label as string,
    coaAccountId: (row.coa_account_id as string) ?? null,
    expenseCategoryId:
      row.expense_category_id != null ? Number(row.expense_category_id) : null,
    month: Number(row.month),
    amount: Number(row.amount),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const REF_TYPE_TO_LINE_TYPE: Record<string, string> = {
  payroll: 'payroll',
  depreciation: 'depreciation',
  owner_drawings: 'drawings',
};

export function createBudgetRepo(): BudgetPort {
  const sb = getSupabaseClient();

  async function findPeriodId(
    storeId: string | null,
    year: number,
  ): Promise<string | null> {
    let query = sb.from('budget_periods').select('id').eq('year', year);
    if (storeId === null) {
      query = query.is('store_id', null);
    } else {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query.maybeSingle();
    if (error)
      throw new Error(`Failed to fetch budget period: ${error.message}`);
    return (data as Record<string, unknown> | null)?.id as string | null;
  }

  async function getBudgetLines(
    storeId: string | null,
    year: number,
  ): Promise<BudgetLine[]> {
    const periodId = await findPeriodId(storeId, year);
    if (!periodId) return [];

    const { data, error } = await sb
      .from('budget_lines')
      .select('*')
      .eq('budget_period_id', periodId)
      .order('line_type')
      .order('category_label')
      .order('month');
    if (error)
      throw new Error(`Failed to fetch budget lines: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(toBudgetLine);
  }

  async function upsertBudgetLines(
    storeId: string | null,
    year: number,
    createdBy: string,
    lines: UpsertLine[],
  ): Promise<void> {
    let periodId = await findPeriodId(storeId, year);

    if (periodId) {
      const { error: touchErr } = await sb
        .from('budget_periods')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', periodId);
      if (touchErr)
        throw new Error(`Failed to touch budget period: ${touchErr.message}`);
    } else {
      const { data: inserted, error: insertErr } = await sb
        .from('budget_periods')
        .insert({ store_id: storeId, year, created_by: createdBy })
        .select('id')
        .single();
      if (insertErr)
        throw new Error(
          `Failed to create budget period: ${insertErr.message}`,
        );
      periodId = (inserted as Record<string, unknown>).id as string;
    }

    if (lines.length === 0) return;

    const rows = lines.map((l) => ({
      budget_period_id: periodId,
      line_type: l.lineType,
      category_label: l.categoryLabel,
      coa_account_id: l.coaAccountId ?? null,
      expense_category_id: l.expenseCategoryId ?? null,
      month: l.month,
      amount: l.amount,
    }));

    const { error: linesErr } = await sb
      .from('budget_lines')
      .upsert(rows, {
        onConflict: 'budget_period_id,line_type,category_label,month',
      });
    if (linesErr)
      throw new Error(`Failed to upsert budget lines: ${linesErr.message}`);
  }

  // TODO: Replace JS aggregation with a Supabase RPC for better performance
  // at scale (e.g. budget_expense_actuals(p_store_id, p_year, p_month))
  async function getExpenseActuals(
    storeId: string | null,
    year: number,
    month?: number,
  ): Promise<ExpenseActual[]> {
    const range = dateRange(year, month);
    let query = sb
      .from('expenses')
      .select('date, category, amount')
      .eq('status', 'paid')
      .gte('date', range.from)
      .lte('date', range.to);
    if (storeId !== null) query = query.eq('store_id', storeId);

    const { data: expenses, error } = await query;
    if (error)
      throw new Error(`Failed to fetch expense actuals: ${error.message}`);

    const { data: cats } = await sb
      .from('expense_categories')
      .select('id, name');
    const catMap = new Map(
      ((cats ?? []) as { id: number; name: string }[]).map((c) => [
        c.name,
        c.id,
      ]),
    );

    const agg = new Map<string, ExpenseActual>();
    for (const e of (expenses ?? []) as Record<string, unknown>[]) {
      const m = monthOf(e.date as string);
      const cat = (e.category as string) || 'Uncategorized';
      const key = `${cat}:${m}`;
      const existing = agg.get(key);
      if (existing) {
        existing.total += Number(e.amount);
      } else {
        agg.set(key, {
          expenseCategoryId: catMap.get(cat) ?? null,
          categoryLabel: cat,
          month: m,
          total: Number(e.amount),
        });
      }
    }
    return Array.from(agg.values());
  }

  // TODO: Replace JS aggregation with a Supabase RPC for better performance
  async function getJournalActuals(
    storeId: string | null,
    year: number,
    month?: number,
  ): Promise<JournalActual[]> {
    const range = dateRange(year, month);
    let query = sb
      .from('journal_entries')
      .select('account_id, debit, date, reference_type')
      .in('reference_type', ['payroll', 'depreciation', 'owner_drawings'])
      .gt('debit', 0)
      .gte('date', range.from)
      .lte('date', range.to);
    if (storeId !== null) query = query.eq('store_id', storeId);

    const { data: entries, error } = await query;
    if (error)
      throw new Error(`Failed to fetch journal actuals: ${error.message}`);

    const accountIds = [
      ...new Set(
        ((entries ?? []) as Record<string, unknown>[]).map(
          (e) => e.account_id as string,
        ),
      ),
    ];
    const accMap = new Map<string, string>();
    if (accountIds.length > 0) {
      const { data: accounts } = await sb
        .from('chart_of_accounts')
        .select('id, name')
        .in('id', accountIds);
      for (const a of (accounts ?? []) as { id: string; name: string }[]) {
        accMap.set(a.id, a.name);
      }
    }

    const agg = new Map<string, JournalActual>();
    for (const e of (entries ?? []) as Record<string, unknown>[]) {
      const m = monthOf(e.date as string);
      const accountId = e.account_id as string;
      const lineType =
        REF_TYPE_TO_LINE_TYPE[e.reference_type as string] ?? 'expense';
      const key = `${accountId}:${lineType}:${m}`;
      const existing = agg.get(key);
      if (existing) {
        existing.total += Number(e.debit);
      } else {
        agg.set(key, {
          accountId,
          accountName: accMap.get(accountId) ?? accountId,
          lineType,
          month: m,
          total: Number(e.debit),
        });
      }
    }
    return Array.from(agg.values());
  }

  // TODO: Replace JS aggregation with a Supabase RPC for better performance
  async function getRevenueActuals(
    storeId: string | null,
    year: number,
    month?: number,
  ): Promise<RevenueActual[]> {
    const range = dateRange(year, month);

    let ordersQ = sb
      .from('orders')
      .select('order_date, final_total')
      .neq('status', 'cancelled')
      .gte('order_date', range.from)
      .lte('order_date', range.to);
    if (storeId !== null) ordersQ = ordersQ.eq('store_id', storeId);

    let transfersQ = sb
      .from('transfers')
      .select('service_date, total_price')
      .gte('service_date', range.from)
      .lte('service_date', range.to);
    if (storeId !== null) transfersQ = transfersQ.eq('store_id', storeId);

    let miscQ = sb
      .from('misc_sales')
      .select('date, amount, category')
      .gte('date', range.from)
      .lte('date', range.to);
    if (storeId !== null) miscQ = miscQ.eq('store_id', storeId);

    const [ordersRes, transfersRes, miscRes] = await Promise.all([
      ordersQ,
      transfersQ,
      miscQ,
    ]);

    if (ordersRes.error)
      throw new Error(
        `Failed to fetch order revenue: ${ordersRes.error.message}`,
      );
    if (transfersRes.error)
      throw new Error(
        `Failed to fetch transfer revenue: ${transfersRes.error.message}`,
      );
    if (miscRes.error)
      throw new Error(
        `Failed to fetch misc revenue: ${miscRes.error.message}`,
      );

    const agg = new Map<string, RevenueActual>();
    function add(
      lineType: string,
      label: string,
      m: number,
      amount: number,
    ) {
      const key = `${lineType}:${label}:${m}`;
      const existing = agg.get(key);
      if (existing) {
        existing.total += amount;
      } else {
        agg.set(key, {
          lineType,
          categoryLabel: label,
          month: m,
          total: amount,
        });
      }
    }

    for (const o of (ordersRes.data ?? []) as Record<string, unknown>[]) {
      add(
        'revenue',
        'Scooter & Vehicle Rentals',
        monthOf(o.order_date as string),
        Number(o.final_total),
      );
    }

    for (const t of (transfersRes.data ?? []) as Record<string, unknown>[]) {
      add(
        'transfer_revenue',
        'Airport Transfers',
        monthOf(t.service_date as string),
        Number(t.total_price),
      );
    }

    for (const s of (miscRes.data ?? []) as Record<string, unknown>[]) {
      const cat = (s.category as string) || 'Miscellaneous Sales';
      add('misc_revenue', cat, monthOf(s.date as string), Number(s.amount));
    }

    return Array.from(agg.values());
  }

  async function getLastYearActuals(
    storeId: string | null,
    year: number,
  ): Promise<UpsertLine[]> {
    const lastYear = year - 1;
    const [expenses, journals, revenue] = await Promise.all([
      getExpenseActuals(storeId, lastYear),
      getJournalActuals(storeId, lastYear),
      getRevenueActuals(storeId, lastYear),
    ]);

    const lines: UpsertLine[] = [];

    for (const e of expenses) {
      lines.push({
        lineType: 'expense',
        categoryLabel: e.categoryLabel,
        expenseCategoryId: e.expenseCategoryId,
        month: e.month,
        amount: e.total,
      });
    }

    for (const j of journals) {
      lines.push({
        lineType: j.lineType,
        categoryLabel: j.accountName,
        coaAccountId: j.accountId,
        month: j.month,
        amount: j.total,
      });
    }

    for (const r of revenue) {
      lines.push({
        lineType: r.lineType,
        categoryLabel: r.categoryLabel,
        month: r.month,
        amount: r.total,
      });
    }

    return lines;
  }

  return {
    getBudgetLines,
    upsertBudgetLines,
    getExpenseActuals,
    getJournalActuals,
    getRevenueActuals,
    getLastYearActuals,
  };
}
