import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateJournalEntryRequestSchema,
  TransferFundsRequestSchema,
} from '@lolas/shared';
import { z } from 'zod';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';

const CHARITY_PAYABLE_ACCOUNT_ID = 'CHARITY-PAYABLE';

const router = Router();
router.use(authenticate);

const BalancesQuerySchema = z.object({ storeId: z.string(), period: z.string() });

router.get('/balances', requirePermission(Permission.ViewAccounts), validateQuery(BalancesQuerySchema), async (req, res, next) => {
  try {
    const { calculateBalances } = await import('../use-cases/accounting/calculate-balances.js');
    const result = await calculateBalances(
      { storeId: req.query.storeId as string, period: req.query.period as string },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

type HalfPeriod = '1' | '2' | 'full';

function halfMonthRange(month: string, half: HalfPeriod): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  if (half === '1') {
    return { from: `${month}-01`, to: `${month}-15` };
  }
  if (half === 'full') {
    return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
  }
  return { from: `${month}-16`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const BalancesV2QuerySchema = z.object({
  storeId: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  half: z.enum(['1', '2', 'full']),
  /** Optional cut-off inside the period: balances are reported through this date. */
  asOf: IsoDate.optional(),
});

router.get('/balances-v2', requirePermission(Permission.ViewAccounts), validateQuery(BalancesV2QuerySchema), async (req, res, next) => {
  try {
    const { storeId, month, half, asOf } = req.query as { storeId: string; month: string; half: HalfPeriod; asOf?: string };
    const range = halfMonthRange(month, half);
    const from = range.from;
    const to = asOf && asOf >= range.from && asOf < range.to ? asOf : range.to;

    const configRepo = req.app.locals.deps.configRepo;
    let storeIds: string[];
    if (storeId === 'all') {
      const stores = await configRepo.getStores();
      storeIds = stores.map((s: { id: string }) => s.id);
    } else {
      storeIds = [storeId];
    }

    const [summary, ledgerRes] = await Promise.all([
      req.app.locals.deps.accountingPort.calculateBalancesByDateRange(storeIds, from, to),
      getSupabaseClient().rpc('account_balances', { p_from: from, p_to: to }),
    ]);
    if (ledgerRes.error) throw new Error(`Ledger check failed: ${ledgerRes.error.message}`);
    // Whole-book check (every account, every store): total debits must equal total credits.
    let ledgerDebits = 0;
    let ledgerCredits = 0;
    for (const r of (ledgerRes.data ?? []) as Array<{ opening_debit: number; opening_credit: number; period_debit: number; period_credit: number }>) {
      ledgerDebits += Number(r.opening_debit) + Number(r.period_debit);
      ledgerCredits += Number(r.opening_credit) + Number(r.period_credit);
    }
    res.json({
      success: true,
      data: {
        storeId, month, half, from, to, summary,
        ledgerCheck: { debits: round2(ledgerDebits), credits: round2(ledgerCredits) },
      },
    });
  } catch (err) { next(err); }
});

interface AccountRow { id: string; name: string; account_type: string; store_id: string | null; is_active: boolean }

async function loadAccount(accountId: string): Promise<AccountRow | null> {
  const { data, error } = await getSupabaseClient()
    .from('chart_of_accounts')
    .select('id, name, account_type, store_id, is_active')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(`Account lookup failed: ${error.message}`);
  return data as AccountRow | null;
}

/** Ledger balance (debit − credit) of one account through a date, inclusive. */
async function balanceThrough(accountId: string, date: string): Promise<{ opening: number; closing: number }> {
  const { data, error } = await getSupabaseClient()
    .rpc('account_balances', { p_from: date, p_to: date })
    .eq('account_id', accountId);
  if (error) throw new Error(`Balance lookup failed: ${error.message}`);
  const row = (data ?? [])[0] as
    | { opening_debit: number; opening_credit: number; period_debit: number; period_credit: number }
    | undefined;
  if (!row) return { opening: 0, closing: 0 };
  const opening = Number(row.opening_debit) - Number(row.opening_credit);
  return { opening, closing: opening + Number(row.period_debit) - Number(row.period_credit) };
}

function isCreditNormal(accountType: string): boolean {
  return ['Liability', 'Income', 'Equity'].includes(accountType);
}

function badRequest(res: import('express').Response, message: string) {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── GET /account-summary — header data for the account detail page ──
router.get('/account-summary', requirePermission(Permission.ViewAccounts), validateQuery(z.object({
  accountId: z.string().min(1),
  from: IsoDate,
  to: IsoDate,
})), async (req, res, next) => {
  try {
    const { accountId, from, to } = req.query as { accountId: string; from: string; to: string };
    const account = await loadAccount(accountId);
    if (!account) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }); return; }

    const sb = getSupabaseClient();
    const [{ data: bal, error: balErr }, { data: recons, error: reconErr }] = await Promise.all([
      sb.rpc('account_balances', { p_from: from, p_to: to }).eq('account_id', accountId),
      sb.from('account_reconciliations')
        .select('id, as_of_date, ledger_balance, counted_balance, variance, adjustment_tx_id, notes, created_by, created_at')
        .eq('account_id', accountId)
        .order('as_of_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (balErr) throw new Error(balErr.message);
    if (reconErr) throw new Error(reconErr.message);
    const row = (bal ?? [])[0] as
      | { opening_debit: number; opening_credit: number; period_debit: number; period_credit: number }
      | undefined;
    const opening = row ? Number(row.opening_debit) - Number(row.opening_credit) : 0;
    const periodDebit = row ? Number(row.period_debit) : 0;
    const periodCredit = row ? Number(row.period_credit) : 0;

    res.json({
      success: true,
      data: {
        accountId: account.id,
        accountName: account.name,
        accountType: account.account_type,
        storeId: account.store_id ?? 'company',
        from,
        to,
        openingBalance: round2(opening),
        periodDebit: round2(periodDebit),
        periodCredit: round2(periodCredit),
        closingBalance: round2(opening + periodDebit - periodCredit),
        reconciliations: ((recons ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: r.id,
          asOfDate: r.as_of_date,
          ledgerBalance: Number(r.ledger_balance),
          countedBalance: Number(r.counted_balance),
          variance: Number(r.variance),
          adjustmentTxId: r.adjustment_tx_id,
          notes: r.notes,
          createdBy: r.created_by,
          createdAt: r.created_at,
        })),
      },
    });
  } catch (err) { next(err); }
});

// ── POST /reconcile — record a counted / statement balance ──
// countedBalance is entered the way staff read it (a positive amount owed for
// liabilities). Any difference is posted against offsetAccountId so the ledger
// matches the count, and every count is kept in account_reconciliations.
const ReconcileAccountSchema = z.object({
  accountId: z.string().min(1),
  asOfDate: IsoDate,
  countedBalance: z.number().finite(),
  notes: z.string().trim().min(3, 'Add a note explaining the count'),
  offsetAccountId: z.string().min(1).default('RECON-ADJ-EQUITY'),
});

router.post('/reconcile', requirePermission(Permission.EditAccounts), validateBody(ReconcileAccountSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof ReconcileAccountSchema>;
    if (body.asOfDate > formatManilaDate()) { badRequest(res, 'The count date cannot be in the future.'); return; }
    if (body.offsetAccountId === body.accountId) { badRequest(res, 'Choose a different account for the difference.'); return; }

    const [account, offset] = await Promise.all([loadAccount(body.accountId), loadAccount(body.offsetAccountId)]);
    if (!account || !account.is_active) { badRequest(res, 'Account not found or inactive.'); return; }
    if (!offset || !offset.is_active) { badRequest(res, 'Difference account not found or inactive.'); return; }
    if (!['Asset', 'Liability'].includes(account.account_type)) {
      badRequest(res, 'Only asset and liability accounts can be reconciled.');
      return;
    }

    const ledger = round2((await balanceThrough(account.id, body.asOfDate)).closing);
    const counted = round2(isCreditNormal(account.account_type) ? -body.countedBalance : body.countedBalance);
    const variance = round2(counted - ledger);

    let adjustmentTxId: string | null = null;
    if (Math.abs(variance) >= 0.01) {
      const { createJournalEntry } = await import('../use-cases/accounting/create-journal-entry.js');
      const description = `Reconciliation ${body.asOfDate}: ${body.notes}`;
      const amount = Math.abs(variance);
      const tx = await createJournalEntry(
        {
          storeId: account.store_id ?? 'company',
          date: body.asOfDate,
          period: body.asOfDate.slice(0, 7),
          createdBy: req.user!.employeeId,
          legs: [
            { accountId: account.id, debit: variance > 0 ? amount : 0, credit: variance < 0 ? amount : 0, description, referenceType: 'reconciliation_adjustment', referenceId: null },
            { accountId: offset.id, debit: variance < 0 ? amount : 0, credit: variance > 0 ? amount : 0, description, referenceType: 'reconciliation_adjustment', referenceId: null },
          ],
        },
        { accounting: req.app.locals.deps.accountingPort },
      );
      adjustmentTxId = tx.transactionId;
    }

    const { data, error } = await getSupabaseClient()
      .from('account_reconciliations')
      .insert({
        account_id: account.id,
        as_of_date: body.asOfDate,
        ledger_balance: ledger,
        counted_balance: counted,
        variance,
        adjustment_tx_id: adjustmentTxId,
        notes: body.notes,
        created_by: req.user!.employeeId ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to save reconciliation: ${error.message}`);

    res.json({ success: true, data: { id: (data as { id: string }).id, ledgerBalance: ledger, countedBalance: counted, variance, adjustmentTxId } });
  } catch (err) { next(err); }
});

// ── POST /charity-payout — money handed to the NGOs ──
const CharityPayoutSchema = z.object({
  amount: z.number().positive(),
  fromAccountId: z.string().min(1),
  date: IsoDate,
  note: z.string().trim().min(1, 'Say who received the donation'),
});

router.post('/charity-payout', requirePermission(Permission.EditAccounts), validateBody(CharityPayoutSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof CharityPayoutSchema>;
    if (body.date > formatManilaDate()) { badRequest(res, 'The payout date cannot be in the future.'); return; }
    const from = await loadAccount(body.fromAccountId);
    if (!from || !from.is_active || from.account_type !== 'Asset') { badRequest(res, 'Choose an active cash or bank account to pay from.'); return; }

    const owed = -(await balanceThrough(CHARITY_PAYABLE_ACCOUNT_ID, body.date)).closing;
    if (body.amount - owed > 0.009) {
      badRequest(res, `Only ${owed.toFixed(2)} is owed to charity as of ${body.date}.`);
      return;
    }

    const { createJournalEntry } = await import('../use-cases/accounting/create-journal-entry.js');
    const description = `Charity payout — ${body.note}`;
    const result = await createJournalEntry(
      {
        storeId: 'company',
        date: body.date,
        period: body.date.slice(0, 7),
        createdBy: req.user!.employeeId,
        legs: [
          { accountId: CHARITY_PAYABLE_ACCOUNT_ID, debit: body.amount, credit: 0, description, referenceType: 'charity_payout', referenceId: null },
          { accountId: from.id, debit: 0, credit: body.amount, description, referenceType: 'charity_payout', referenceId: null },
        ],
      },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/account-ledger', requirePermission(Permission.ViewAccounts), validateQuery(z.object({
  accountId: z.string(),
  from: z.string(),
  to: z.string(),
})), async (req, res, next) => {
  try {
    const { accountId, from, to } = req.query as { accountId: string; from: string; to: string };
    const entries = await req.app.locals.deps.accountingPort.findByAccountDateRange(accountId, from, to);
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
});

router.get('/entries', requirePermission(Permission.ViewAccounts), validateQuery(z.object({
  storeId: z.string(), period: z.string(),
})), async (req, res, next) => {
  try {
    const entries = await req.app.locals.deps.accountingPort.findByStore(
      req.query.storeId as string, req.query.period as string,
    );
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
});

router.post('/journal', requirePermission(Permission.EditAccounts), validateBody(CreateJournalEntryRequestSchema), async (req, res, next) => {
  try {
    const { createJournalEntry } = await import('../use-cases/accounting/create-journal-entry.js');
    const result = await createJournalEntry(
      { ...req.body, createdBy: req.user!.employeeId, storeId: req.body.locationId ?? req.user!.storeIds[0] },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

const OwnerDrawingsRequestSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'gcash', 'bank_transfer']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
  /** Account the money left from; defaults by payment method. */
  fromAccountId: z.string().min(1).optional(),
});

const DRAWINGS_CREDIT_ACCOUNTS: Record<string, string> = {
  cash: 'CASH-LOLA',
  gcash: 'GCASH-store-lolas',
  bank_transfer: 'Wise',
};

router.post('/drawings', requirePermission(Permission.EditAccounts), validateBody(OwnerDrawingsRequestSchema), async (req, res, next) => {
  try {
    const { amount, paymentMethod, date, note, fromAccountId } = req.body as z.infer<typeof OwnerDrawingsRequestSchema>;
    const creditAccountId = fromAccountId ?? DRAWINGS_CREDIT_ACCOUNTS[paymentMethod];
    const source = await loadAccount(creditAccountId);
    if (!source || !source.is_active || source.account_type !== 'Asset') {
      badRequest(res, 'Choose an active cash or bank account the money came from.');
      return;
    }
    const description = note?.trim() ? `Owner Drawings — ${note.trim()}` : 'Owner Drawings';
    const period = date.slice(0, 7);

    const { createJournalEntry } = await import('../use-cases/accounting/create-journal-entry.js');
    const result = await createJournalEntry(
      {
        storeId: 'company',
        date,
        period,
        createdBy: req.user!.employeeId,
        legs: [
          { accountId: 'OWNER-DRAWINGS-store-lolas', debit: amount, credit: 0, description, referenceType: 'owner_drawings', referenceId: null },
          { accountId: creditAccountId, debit: 0, credit: amount, description, referenceType: 'owner_drawings', referenceId: null },
        ],
      },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/transfer', requirePermission(Permission.EditAccounts), validateBody(TransferFundsRequestSchema), async (req, res, next) => {
  try {
    const { transferFunds } = await import('../use-cases/accounting/transfer-funds.js');
    const result = await transferFunds(
      { ...req.body, createdBy: req.user!.employeeId, storeId: req.body.locationId ?? req.user!.storeIds[0], period: req.body.date.slice(0, 7) },
      { accounting: req.app.locals.deps.accountingPort },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/last-depreciation', requirePermission(Permission.ViewAccounts), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data } = await sb
      .from('journal_entries')
      .select('date')
      .eq('reference_type', 'depreciation')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    res.json({ success: true, data: { date: (data as { date?: string } | null)?.date ?? null } });
  } catch (err) { next(err); }
});

export { router as accountingRoutes };
