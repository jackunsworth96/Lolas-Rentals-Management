import type {
  JournalTransaction,
  JournalLeg,
  AccountingPort,
  JournalEntry,
  AccountBalance,
  BalanceSummary,
} from '@lolas/domain';
import {
  JournalTransaction as JTEntity,
  Money,
} from '@lolas/domain';
import { getSupabaseClient } from './client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

interface JournalEntryRow {
  id: string;
  transaction_id: string;
  period: string;
  date: string;
  store_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
  reference_type: string;
  reference_id: string | null;
  created_by: string | null;
}

function rowToEntry(row: JournalEntryRow): JournalEntry {
  return {
    entryId: row.id,
    transactionId: row.transaction_id,
    period: row.period,
    date: row.date,
    storeId: row.store_id,
    accountId: row.account_id,
    debit: row.debit,
    credit: row.credit,
    description: row.description,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdBy: row.created_by,
  };
}

function legToRow(
  leg: JournalLeg,
  txId: string,
  period: string,
  date: string,
  storeId: string,
  createdBy: string | null,
): Record<string, unknown> {
  return {
    id: leg.entryId,
    transaction_id: txId,
    period,
    date,
    store_id: storeId,
    account_id: leg.accountId,
    debit: leg.debit.toNumber(),
    credit: leg.credit.toNumber(),
    description: leg.description,
    reference_type: leg.referenceType,
    reference_id: leg.referenceId,
    created_by: createdBy,
  };
}

export class SupabaseAccountingRepository implements AccountingPort {
  async createTransaction(
    legs: JournalLeg[],
    storeId: string,
    date?: string,
    createdBy: string | null = null,
  ): Promise<JournalTransaction> {
    const sb = getSupabaseClient();

    const txId = crypto.randomUUID();
    const resolvedDate = date ?? formatManilaDate();
    const period = resolvedDate.slice(0, 7);

    const firstLeg = legs[0];
    if (!firstLeg) throw new Error('Transaction must have at least one leg');

    const tx = JTEntity.create({
      transactionId: txId,
      period,
      date: resolvedDate,
      storeId,
      legs,
      createdBy,
    });

    const rows = legs.map((leg) =>
      legToRow(leg, txId, period, resolvedDate, storeId, createdBy),
    );

    const { error } = await sb.from('journal_entries').insert(rows);
    if (error) throw new Error(`createTransaction failed: ${error.message}`);

    return tx;
  }

  async findByAccount(
    accountId: string,
    period?: string,
  ): Promise<JournalEntry[]> {
    const sb = getSupabaseClient();
    let query = sb
      .from('journal_entries')
      .select('*')
      .eq('account_id', accountId)
      .order('date', { ascending: false });

    if (period) {
      query = query.eq('period', period);
    }

    const { data, error } = await query;
    if (error) throw new Error(`findByAccount failed: ${error.message}`);
    return (data as JournalEntryRow[]).map(rowToEntry);
  }

  async findByAccountDateRange(
    accountId: string,
    from: string,
    to: string,
  ): Promise<JournalEntry[]> {
    const sb = getSupabaseClient();
    const pageSize = 1000;
    const rows: JournalEntryRow[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await sb
        .from('journal_entries')
        .select('*')
        .eq('account_id', accountId)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`findByAccountDateRange failed: ${error.message}`);
      const page = (data ?? []) as JournalEntryRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows.map(rowToEntry);
  }

  async findByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<JournalEntry[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('journal_entries')
      .select('*')
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId)
      .order('date', { ascending: false });

    if (error) throw new Error(`findByReference failed: ${error.message}`);
    return (data as JournalEntryRow[]).map(rowToEntry);
  }

  async deleteByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<void> {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('journal_entries')
      .delete()
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId);
    if (error) throw new Error(`deleteByReference failed: ${error.message}`);
  }

  async findByStore(
    storeId: string,
    period: string,
  ): Promise<JournalEntry[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('journal_entries')
      .select('*')
      .eq('store_id', storeId)
      .eq('period', period)
      .order('date', { ascending: false });

    if (error) throw new Error(`findByStore failed: ${error.message}`);
    return (data as JournalEntryRow[]).map(rowToEntry);
  }

  async calculateBalance(
    accountId: string,
    throughDate?: string,
  ): Promise<AccountBalance> {
    const sb = getSupabaseClient();
    let query = sb
      .from('journal_entries')
      .select('debit, credit')
      .eq('account_id', accountId);

    if (throughDate) {
      query = query.lte('date', throughDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(`calculateBalance failed: ${error.message}`);

    const rows = (data ?? []) as { debit: number; credit: number }[];
    const debitTotal = rows.reduce((sum, r) => sum + (r.debit ?? 0), 0);
    const creditTotal = rows.reduce((sum, r) => sum + (r.credit ?? 0), 0);

    const { data: acct } = await sb
      .from('chart_of_accounts')
      .select('name, account_type')
      .eq('id', accountId)
      .maybeSingle();

    return {
      accountId,
      accountName: (acct as { name: string } | null)?.name ?? '',
      accountType: (acct as { account_type: string } | null)?.account_type ?? '',
      debitTotal,
      creditTotal,
      balance: debitTotal - creditTotal,
    };
  }

  async calculateAllBalances(
    storeId: string,
    period: string,
  ): Promise<AccountBalance[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('journal_entries')
      .select('account_id, debit, credit')
      .eq('store_id', storeId)
      .eq('period', period);

    if (error) throw new Error(`calculateAllBalances failed: ${error.message}`);

    const rows = (data ?? []) as {
      account_id: string;
      debit: number;
      credit: number;
    }[];

    const grouped = new Map<string, { debit: number; credit: number }>();
    for (const row of rows) {
      const existing = grouped.get(row.account_id) ?? { debit: 0, credit: 0 };
      existing.debit += row.debit ?? 0;
      existing.credit += row.credit ?? 0;
      grouped.set(row.account_id, existing);
    }

    const accountIds = [...grouped.keys()];
    if (accountIds.length === 0) return [];

    const { data: accounts } = await sb
      .from('chart_of_accounts')
      .select('id, name, account_type')
      .in('id', accountIds);

    const acctMap = new Map(
      ((accounts ?? []) as { id: string; name: string; account_type: string }[]).map(
        (a) => [a.id, a],
      ),
    );

    return accountIds.map((id) => {
      const totals = grouped.get(id)!;
      const acct = acctMap.get(id);
      return {
        accountId: id,
        accountName: acct?.name ?? '',
        accountType: acct?.account_type ?? '',
        debitTotal: totals.debit,
        creditTotal: totals.credit,
        balance: totals.debit - totals.credit,
      };
    });
  }

  async getBalanceSummaryByType(
    storeId: string,
    period: string,
  ): Promise<BalanceSummary[]> {
    const balances = await this.calculateAllBalances(storeId, period);

    const byType = new Map<string, AccountBalance[]>();
    for (const bal of balances) {
      const list = byType.get(bal.accountType) ?? [];
      list.push(bal);
      byType.set(bal.accountType, list);
    }

    return [...byType.entries()].map(([type, accounts]) => {
      const totalDebit = accounts.reduce((s, a) => s + a.debitTotal, 0);
      const totalCredit = accounts.reduce((s, a) => s + a.creditTotal, 0);
      return {
        type,
        totalDebit,
        totalCredit,
        netBalance: totalDebit - totalCredit,
        accounts,
      };
    });
  }

  /**
   * Per-account report for a period: opening balance, period debits/credits and
   * closing balance. An account's balance includes every journal line posted to
   * it whatever the line's store_id (company-level postings such as owner
   * drawings hit store accounts too). Accounts with no store are company-wide.
   */
  async calculateBalancesByDateRange(
    storeIds: string[],
    from: string,
    to: string,
  ): Promise<BalanceSummary[]> {
    const sb = getSupabaseClient();

    const acctStoreIds = [...new Set([...storeIds, 'company'])];
    const [acctRes, balRes, reconRes] = await Promise.all([
      sb
        .from('chart_of_accounts')
        .select('id, name, account_type, store_id')
        .eq('is_active', true)
        .or(`store_id.is.null,store_id.in.(${acctStoreIds.map((id) => `"${id}"`).join(',')})`),
      sb.rpc('account_balances', { p_from: from, p_to: to }),
      sb
        .from('account_reconciliations')
        .select('account_id, as_of_date, ledger_balance, counted_balance, variance, notes, created_at')
        .lte('as_of_date', to)
        .order('as_of_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    if (acctRes.error) throw new Error(`calculateBalancesByDateRange accounts: ${acctRes.error.message}`);
    if (balRes.error) throw new Error(`calculateBalancesByDateRange balances: ${balRes.error.message}`);
    if (reconRes.error) throw new Error(`calculateBalancesByDateRange reconciliations: ${reconRes.error.message}`);

    const totalsMap = new Map<string, { opening: number; debit: number; credit: number }>();
    for (const row of (balRes.data ?? []) as Array<{
      account_id: string; opening_debit: number; opening_credit: number; period_debit: number; period_credit: number;
    }>) {
      totalsMap.set(row.account_id, {
        opening: Number(row.opening_debit) - Number(row.opening_credit),
        debit: Number(row.period_debit),
        credit: Number(row.period_credit),
      });
    }

    const lastRecon = new Map<string, NonNullable<AccountBalance['lastReconciliation']>>();
    for (const r of (reconRes.data ?? []) as Array<{
      account_id: string; as_of_date: string; ledger_balance: number; counted_balance: number;
      variance: number; notes: string; created_at: string;
    }>) {
      if (lastRecon.has(r.account_id)) continue;
      lastRecon.set(r.account_id, {
        asOfDate: r.as_of_date,
        ledgerBalance: Number(r.ledger_balance),
        countedBalance: Number(r.counted_balance),
        variance: Number(r.variance),
        notes: r.notes,
        createdAt: r.created_at,
      });
    }

    const typeOrder = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'];
    const byType = new Map<string, AccountBalance[]>();
    for (const t of typeOrder) byType.set(t, []);

    for (const acct of (acctRes.data ?? []) as { id: string; name: string; account_type: string; store_id: string | null }[]) {
      const totals = totalsMap.get(acct.id) ?? { opening: 0, debit: 0, credit: 0 };
      const closing = round2(totals.opening + totals.debit - totals.credit);
      const list = byType.get(acct.account_type) ?? [];
      list.push({
        accountId: acct.id,
        accountName: acct.name,
        accountType: acct.account_type,
        storeId: acct.store_id ?? 'company',
        debitTotal: round2(totals.debit),
        creditTotal: round2(totals.credit),
        balance: closing,
        openingBalance: round2(totals.opening),
        closingBalance: closing,
        lastReconciliation: lastRecon.get(acct.id) ?? null,
      });
      byType.set(acct.account_type, list);
    }

    return [...byType.entries()]
      .filter(([, accounts]) => accounts.length > 0)
      .map(([type, accounts]) => {
        const totalDebit = round2(accounts.reduce((s, a) => s + a.debitTotal, 0));
        const totalCredit = round2(accounts.reduce((s, a) => s + a.creditTotal, 0));
        const netBalance = round2(accounts.reduce((s, a) => s + a.balance, 0));
        return { type, totalDebit, totalCredit, netBalance, accounts };
      });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
