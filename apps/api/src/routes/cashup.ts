import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  ReconcileCashRequestSchema,
  OverrideReconciliationRequestSchema,
  CashupQuerySchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

// ── GET /summary — single aggregation endpoint for the Cash Up page ──
router.get(
  '/summary',
  requirePermission(Permission.ViewCashup),
  validateQuery(CashupQuerySchema),
  async (req, res, next) => {
    try {
      const { storeId, date } = req.query as { storeId: string; date: string };
      const sb = getSupabaseClient();

      const [paymentsRes, expensesRes, depositsRes, transfersRes, miscSalesRes, reconRes, prevReconRes, storesRes, charityRes] =
        await Promise.all([
          sb
            .from('payments')
            .select(
              'id, payment_type, amount, payment_method_id, transaction_date, settlement_ref, settlement_status, customer_id, order_id, created_at, customers!customer_id(name), orders!order_id(woo_order_id)',
            )
            .eq('store_id', storeId)
            .eq('transaction_date', date)
            .order('created_at', { ascending: true }),

          sb
            .from('expenses')
            .select(
              'id, category, description, amount, paid_from, employee_id, account_id, created_at, chart_of_accounts!paid_from(name)',
            )
            .eq('store_id', storeId)
            .eq('date', date)
            .eq('status', 'paid')
            .order('created_at', { ascending: true }),

          sb
            .from('journal_entries')
            .select('id, description, debit, credit, date, created_at, reference_id, account_id, chart_of_accounts!account_id(name)')
            .eq('store_id', storeId)
            .eq('date', date)
            .eq('reference_type', 'cash_deposit')
            .order('created_at', { ascending: true }),

          sb
            .from('journal_entries')
            .select('id, description, debit, credit, date, created_at, reference_id')
            .eq('store_id', storeId)
            .eq('date', date)
            .eq('reference_type', 'inter_store_transfer')
            .order('created_at', { ascending: true }),

          sb
            .from('misc_sales')
            .select(
              'id, description, category, amount, received_into, employee_id, created_at, chart_of_accounts!received_into(id, name)',
            )
            .eq('store_id', storeId)
            .eq('date', date)
            .order('created_at', { ascending: true }),

          sb
            .from('cash_reconciliation')
            .select('*')
            .eq('store_id', storeId)
            .eq('date', date)
            .maybeSingle(),

          sb
            .from('cash_reconciliation')
            .select('closing_balance, actual_counted, date, overridden_by')
            .eq('store_id', storeId)
            .lt('date', date)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle(),

          sb.from('stores').select('id, name, default_float_amount'),

          sb
            .from('journal_entries')
            .select('id, description, credit, date, created_at, reference_id')
            .eq('store_id', storeId)
            .eq('date', date)
            .eq('reference_type', 'order_charity')
            .gt('credit', 0)
            .order('created_at', { ascending: true }),
        ]);

      if (paymentsRes.error)
        throw new Error(`Payments query failed: ${paymentsRes.error.message}`);
      if (expensesRes.error)
        throw new Error(`Expenses query failed: ${expensesRes.error.message}`);
      if (depositsRes.error)
        throw new Error(`Deposits query failed: ${depositsRes.error.message}`);
      if (transfersRes.error)
        throw new Error(`Transfers query failed: ${transfersRes.error.message}`);
      if (miscSalesRes.error)
        throw new Error(`Misc sales query failed: ${miscSalesRes.error.message}`);
      if (reconRes.error)
        throw new Error(`Reconciliation query failed: ${reconRes.error.message}`);
      if (prevReconRes.error)
        throw new Error(`Previous recon query failed: ${prevReconRes.error.message}`);
      if (charityRes.error)
        throw new Error(`Charity donations query failed: ${charityRes.error.message}`);

      const payments = (paymentsRes.data ?? []) as Record<string, unknown>[];
      const expenses = (expensesRes.data ?? []) as Record<string, unknown>[];
      const depositEntries = (depositsRes.data ?? []) as Record<string, unknown>[];
      const transferEntries = (transfersRes.data ?? []) as Record<string, unknown>[];
      const miscSales = (miscSalesRes.data ?? []) as Record<string, unknown>[];
      const charityEntries = (charityRes.data ?? []) as Record<string, unknown>[];
      const allStores = ((storesRes.data ?? []) as { id: string; name: string; default_float_amount: number }[]);
      const currentStore = allStores.find((s) => s.id === storeId);
      const otherStores = allStores.filter((s) => s.id !== storeId);

      const GCASH_IDS = new Set(['gcash', 'paymaya']);
      const DEPOSIT_TYPES = new Set(['deposit', 'security_deposit']);

      // Income buckets (by method)
      const cashSalesTx: unknown[] = [];
      const cardSalesTx: unknown[] = [];
      const gcashSalesTx: unknown[] = [];
      const bankTransferTx: unknown[] = [];
      let cashSalesTotal = 0;
      let cardSalesTotal = 0;
      let gcashSalesTotal = 0;
      let bankTransferTotal = 0;

      // Deposits held buckets (by method, but shown together)
      const depositsHeldByMethod: Record<string, { label: string; rows: unknown[]; total: number }> = {};
      let depositsHeldTotal = 0;

      function resolveMethodLabel(key: string, raw: string): string {
        if (key === 'cash') return 'Cash';
        if (key === 'card' || key === 'creditcard' || key === 'debitcard') return 'Card';
        if (GCASH_IDS.has(key)) return 'GCash';
        return raw || 'Other';
      }

      function resolveMethodCategory(key: string): 'cash' | 'card' | 'gcash' | 'bank' {
        if (key === 'cash') return 'cash';
        if (key === 'card' || key === 'creditcard' || key === 'debitcard') return 'card';
        if (GCASH_IDS.has(key)) return 'gcash';
        return 'bank';
      }

      for (const p of payments) {
        const rawMethodId = (p.payment_method_id as string) ?? '';
        const methodKey = rawMethodId.toLowerCase().replace(/[\s_-]/g, '');
        const paymentType = ((p.payment_type as string) ?? '').toLowerCase();
        const amount = Number(p.amount ?? 0);
        const customer = p.customers as { name: string } | null;
        const order = p.orders as { woo_order_id: string | null } | null;

        const row = {
          id: p.id,
          paymentType: p.payment_type,
          amount,
          methodId: rawMethodId,
          settlementRef: p.settlement_ref ?? null,
          settlementStatus: p.settlement_status ?? null,
          customerName: customer?.name ?? null,
          wooOrderId: order?.woo_order_id ?? null,
          orderId: p.order_id ?? null,
          createdAt: p.created_at,
        };

        const isDeposit = DEPOSIT_TYPES.has(paymentType);

        if (isDeposit) {
          const label = resolveMethodLabel(methodKey, rawMethodId);
          if (!depositsHeldByMethod[label]) {
            depositsHeldByMethod[label] = { label, rows: [], total: 0 };
          }
          depositsHeldByMethod[label].rows.push(row);
          depositsHeldByMethod[label].total += amount;
          depositsHeldTotal += amount;
        } else {
          const cat = resolveMethodCategory(methodKey);
          if (cat === 'cash') {
            cashSalesTx.push(row);
            cashSalesTotal += amount;
          } else if (cat === 'card') {
            cardSalesTx.push(row);
            cardSalesTotal += amount;
          } else if (cat === 'gcash') {
            gcashSalesTx.push(row);
            gcashSalesTotal += amount;
          } else {
            bankTransferTx.push(row);
            bankTransferTotal += amount;
          }
        }
      }

      // ── Misc sales bucketed by payment method (derived from account name) ──
      function accountMethodCategory(accountName: string): 'cash' | 'card' | 'gcash' | 'bank' {
        const lower = accountName.toLowerCase();
        if (lower.includes('cash')) return 'cash';
        if (lower.includes('card') || lower.includes('credit') || lower.includes('debit')) return 'card';
        if (lower.includes('gcash') || lower.includes('paymaya')) return 'gcash';
        return 'bank';
      }

      const miscCashTx: unknown[] = [];
      const miscCardTx: unknown[] = [];
      const miscGcashTx: unknown[] = [];
      const miscBankTx: unknown[] = [];
      let miscCashTotal = 0;
      let miscCardTotal = 0;
      let miscGcashTotal = 0;
      let miscBankTotal = 0;

      for (const ms of miscSales) {
        const acct = ms.chart_of_accounts as { id: string; name: string } | null;
        const amount = Number(ms.amount ?? 0);
        const row = {
          id: ms.id,
          description: ms.description,
          category: ms.category,
          amount,
          receivedInto: ms.received_into,
          accountName: acct?.name ?? null,
          employeeId: ms.employee_id,
          createdAt: ms.created_at,
        };

        const cat = accountMethodCategory(acct?.name ?? '');
        if (cat === 'cash') {
          miscCashTx.push(row);
          miscCashTotal += amount;
        } else if (cat === 'card') {
          miscCardTx.push(row);
          miscCardTotal += amount;
        } else if (cat === 'gcash') {
          miscGcashTx.push(row);
          miscGcashTotal += amount;
        } else {
          miscBankTx.push(row);
          miscBankTotal += amount;
        }
      }

      // Only cash deposits affect the physical till
      const cashDepositsHeldTotal = depositsHeldByMethod['Cash']?.total ?? 0;

      // Expenses — all payment methods, with method label for non-cash
      const expenseRows = expenses.map((e) => {
        const paidFromAcct = e.chart_of_accounts as { name: string } | null;
        return {
          id: e.id,
          category: e.category,
          description: e.description,
          amount: Number(e.amount ?? 0),
          paidFrom: e.paid_from,
          paidFromName: paidFromAcct?.name ?? null,
          employeeId: e.employee_id,
          createdAt: e.created_at,
        };
      });
      const expenseTotal = expenseRows.reduce((s, e) => s + e.amount, 0);
      const cashExpenseTotal = expenseRows.reduce((s, e) => {
        const name = (e.paidFromName ?? '').toLowerCase();
        const isCash = name.includes('cash') &&
          !name.includes('gcash') &&
          !name.includes('paymaya');
        return isCash ? s + e.amount : s;
      }, 0);

      // Cash deposited — pair credit leg (cash leaving) with debit leg (destination)
      const debitByRef = new Map<string, { name: string | null }>();
      for (const d of depositEntries) {
        if (Number(d.debit ?? 0) > 0) {
          const acct = d.chart_of_accounts as { name: string } | null;
          debitByRef.set(String(d.reference_id), { name: acct?.name ?? null });
        }
      }
      const depositRows = depositEntries
        .filter((d) => Number(d.credit ?? 0) > 0)
        .map((d) => {
          const dest = debitByRef.get(String(d.reference_id));
          return {
            id: d.id,
            amount: Number(d.credit ?? 0),
            description: d.description,
            accountName: dest?.name ?? null,
            referenceId: d.reference_id,
            createdAt: d.created_at,
          };
        });
      const depositTotal = depositRows.reduce((s, d) => s + d.amount, 0);

      // Inter-store transfers
      let interStoreIn = 0;
      let interStoreOut = 0;
      const transferInRows: unknown[] = [];
      const transferOutRows: unknown[] = [];
      for (const t of transferEntries) {
        const debit = Number(t.debit ?? 0);
        const credit = Number(t.credit ?? 0);
        const row = {
          id: t.id,
          description: t.description,
          amount: debit > 0 ? debit : credit,
          referenceId: t.reference_id,
          createdAt: t.created_at,
        };
        if (debit > 0) {
          transferInRows.push(row);
          interStoreIn += debit;
        } else if (credit > 0) {
          transferOutRows.push(row);
          interStoreOut += credit;
        }
      }

      // Opening float: previous day's closing balance, or 0 if none
      const prev = prevReconRes.data;
      let openingAmount = 0;
      let openingSource: 'previous_day' | 'override' | 'none' = 'none';
      if (prev) {
        openingAmount = Number(prev.closing_balance ?? prev.actual_counted ?? 0);
        openingSource = prev.overridden_by ? 'override' : 'previous_day';
      }

      // Only cash-method payments affect the physical till
      const totalCashIn = cashSalesTotal + cashDepositsHeldTotal + miscCashTotal;
      const expectedCash =
        openingAmount + totalCashIn + interStoreIn - cashExpenseTotal - depositTotal - interStoreOut;

      const charityDonationRows = charityEntries.map((c) => ({
        id: c.id,
        description: c.description,
        amount: Number(c.credit ?? 0),
        orderId: c.reference_id,
        createdAt: c.created_at,
      }));
      const charityDonationsTotal = charityDonationRows.reduce((s, r) => s + r.amount, 0);

      const recon = reconRes.data;

      res.json({
        success: true,
        data: {
          openingFloat: {
            amount: openingAmount,
            source: openingSource,
            previousDate: prev?.date ?? null,
          },
          transactions: {
            cashSales: cashSalesTx,
            cardSales: cardSalesTx,
            gcashSales: gcashSalesTx,
            bankTransfer: bankTransferTx,
            depositsHeld: Object.values(depositsHeldByMethod),
            miscSales: {
              cash: miscCashTx,
              card: miscCardTx,
              gcash: miscGcashTx,
              bank: miscBankTx,
            },
            expenses: expenseRows,
            bankDeposits: depositRows,
            transfersIn: transferInRows,
            transfersOut: transferOutRows,
          },
          totals: {
            cashSalesTotal,
            cashDepositsHeldTotal,
            totalCashIn,
            cardSalesTotal,
            gcashSalesTotal,
            bankTransferTotal,
            depositsHeldTotal,
            miscCashTotal,
            miscCardTotal,
            miscGcashTotal,
            miscBankTotal,
            miscSalesTotal: miscCashTotal + miscCardTotal + miscGcashTotal + miscBankTotal,
            expenseTotal,
            cashExpenseTotal,
            depositTotal,
            interStoreIn,
            interStoreOut,
            charityDonationsTotal,
          },
          charityDonations: charityDonationRows,
          expectedCash,
          stores: allStores.map((s) => ({
            id: s.id,
            name: s.name,
            defaultFloatAmount: Number(s.default_float_amount ?? 3000),
          })),
          otherStores: otherStores.map((s) => ({
            id: s.id,
            name: s.name,
            defaultFloatAmount: Number(s.default_float_amount ?? 3000),
          })),
          reconciliation: recon
            ? {
                id: recon.id,
                isLocked: recon.is_locked,
                actualCounted: Number(recon.actual_counted ?? 0),
                variance: Number(recon.variance ?? 0),
                varianceType: recon.variance_type,
                submittedBy: recon.submitted_by,
                submittedAt: recon.submitted_at,
                overriddenBy: recon.overridden_by,
                overriddenAt: recon.overridden_at,
                overrideReason: recon.override_reason,
                tillCounted: recon.till_counted != null ? Number(recon.till_counted) : null,
                depositsCounted:
                  recon.deposits_counted != null
                    ? Number(recon.deposits_counted)
                    : null,
                tillDenoms: recon.till_denoms,
                depositDenoms: recon.deposit_denoms,
                closingBalance:
                  recon.closing_balance != null
                    ? Number(recon.closing_balance)
                    : null,
              }
            : null,
          isLocked: recon?.is_locked ?? false,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET / — fetch reconciliation record for a date ──
router.get(
  '/',
  requirePermission(Permission.ViewCashup),
  validateQuery(CashupQuerySchema),
  async (req, res, next) => {
    try {
      const { storeId, date } = req.query as { storeId: string; date: string };
      const reconciliation =
        await req.app.locals.deps.cashReconciliationRepo.findByDate(
          storeId,
          date,
        );
      res.json({ success: true, data: reconciliation });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /deposit — record a bank deposit from the cash drawer ──
const DepositFundsSchema = z.object({
  storeId: z.string().min(1),
  date: z.string().min(1),
  amount: z.number().positive(),
  cashAccountId: z.string().min(1),
  bankAccountId: z.string().min(1),
  notes: z.string().optional(),
});

router.post(
  '/deposit',
  requirePermission(Permission.ViewCashup),
  validateBody(DepositFundsSchema),
  async (req, res, next) => {
    try {
      const { storeId, date, amount, cashAccountId, bankAccountId, notes } =
        req.body as z.infer<typeof DepositFundsSchema>;
      const { Money } = await import('@lolas/domain');
      const accountingPort = req.app.locals.deps.accountingPort;

      const depositId = crypto.randomUUID();
      const description = notes
        ? `Bank deposit: ${notes}`
        : 'Bank deposit from cash drawer';

      const legs = [
        {
          entryId: crypto.randomUUID(),
          accountId: bankAccountId,
          debit: Money.php(amount),
          credit: Money.zero(),
          description,
          referenceType: 'cash_deposit',
          referenceId: depositId,
        },
        {
          entryId: crypto.randomUUID(),
          accountId: cashAccountId,
          debit: Money.zero(),
          credit: Money.php(amount),
          description,
          referenceType: 'cash_deposit',
          referenceId: depositId,
        },
      ];

      await accountingPort.createTransaction(legs, storeId);

      res.json({ success: true, data: { depositId, amount } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /inter-store-transfer — move cash between stores ──
const InterStoreTransferSchema = z.object({
  fromStoreId: z.string().min(1),
  toStoreId: z.string().min(1),
  amount: z.number().positive(),
  fromCashAccountId: z.string().min(1),
  toCashAccountId: z.string().min(1),
  transferType: z.enum(['consolidation', 'float']),
  date: z.string().min(1),
  notes: z.string().optional(),
});

router.post(
  '/inter-store-transfer',
  requirePermission(Permission.ViewCashup),
  validateBody(InterStoreTransferSchema),
  async (req, res, next) => {
    try {
      const {
        fromStoreId,
        toStoreId,
        amount,
        fromCashAccountId,
        toCashAccountId,
        transferType,
        date,
        notes,
      } = req.body as z.infer<typeof InterStoreTransferSchema>;

      const sb = getSupabaseClient();
      const reconRepo = req.app.locals.deps.cashReconciliationRepo;

      // Block if either store's day is locked
      const [fromRecon, toRecon] = await Promise.all([
        reconRepo.findByDate(fromStoreId, date),
        reconRepo.findByDate(toStoreId, date),
      ]);
      if (fromRecon?.isLocked) {
        res.status(400).json({
          success: false,
          error: { code: 'LOCKED', message: `Reconciliation for sending store is locked for ${date}. Unlock it first.` },
        });
        return;
      }
      if (toRecon?.isLocked) {
        res.status(400).json({
          success: false,
          error: { code: 'LOCKED', message: `Reconciliation for receiving store is locked for ${date}. Unlock it first.` },
        });
        return;
      }

      // Look up store names for descriptions
      const { data: stores } = await sb
        .from('stores')
        .select('id, name')
        .in('id', [fromStoreId, toStoreId]);
      const storeMap = new Map(
        ((stores ?? []) as { id: string; name: string }[]).map((s) => [
          s.id,
          s.name,
        ]),
      );
      const fromName = storeMap.get(fromStoreId) ?? fromStoreId;
      const toName = storeMap.get(toStoreId) ?? toStoreId;

      const transferId = crypto.randomUUID();
      const txId = crypto.randomUUID();
      const period = date.slice(0, 7);

      const typeLabel =
        transferType === 'float' ? 'Float issued' : 'Cash transferred';
      const fromDesc = notes
        ? `${typeLabel} to ${toName}: ${notes}`
        : `${typeLabel} to ${toName}`;
      const toDesc = notes
        ? `${typeLabel} from ${fromName}: ${notes}`
        : `${typeLabel} from ${fromName}`;

      const rows = [
        {
          id: crypto.randomUUID(),
          transaction_id: txId,
          period,
          date,
          store_id: toStoreId,
          account_id: toCashAccountId,
          debit: amount,
          credit: 0,
          description: toDesc,
          reference_type: 'inter_store_transfer',
          reference_id: transferId,
          created_by: req.user!.employeeId ?? null,
        },
        {
          id: crypto.randomUUID(),
          transaction_id: txId,
          period,
          date,
          store_id: fromStoreId,
          account_id: fromCashAccountId,
          debit: 0,
          credit: amount,
          description: fromDesc,
          reference_type: 'inter_store_transfer',
          reference_id: transferId,
          created_by: req.user!.employeeId ?? null,
        },
      ];

      const { error } = await sb.from('journal_entries').insert(rows);
      if (error)
        throw new Error(`Failed to create inter-store transfer: ${error.message}`);

      res.json({
        success: true,
        data: { transferId, amount, transferType, from: fromName, to: toName },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /reconcile — submit denomination count and lock the day ──
router.post(
  '/reconcile',
  requirePermission(Permission.ViewCashup),
  validateBody(ReconcileCashRequestSchema),
  async (req, res, next) => {
    try {
      const { reconcileCash } = await import(
        '../use-cases/cashup/reconcile-cash.js'
      );
      const result = await reconcileCash(
        { ...req.body, submittedBy: req.user!.employeeId },
        {
          cashReconciliation: req.app.locals.deps.cashReconciliationRepo,
        },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /override — admin override of a locked reconciliation ──
router.post(
  '/override',
  requirePermission(Permission.OverrideCashup),
  validateBody(OverrideReconciliationRequestSchema),
  async (req, res, next) => {
    try {
      const { overrideReconciliation } = await import(
        '../use-cases/cashup/override-reconciliation.js'
      );
      const result = await overrideReconciliation(
        { ...req.body, overriddenBy: req.user!.employeeId },
        { cashReconciliation: req.app.locals.deps.cashReconciliationRepo },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /late-returns-check ── checks if any active orders drop off >= 20:00 on a given date
router.get(
  '/late-returns-check',
  requirePermission(Permission.ViewCashup),
  validateQuery(z.object({ storeId: z.string(), date: z.string() })),
  async (req, res, next) => {
    try {
      const { storeId, date } = req.query as { storeId: string; date: string };
      const sb = getSupabaseClient();
      // Join order_items → orders to filter by store and date
      const { data, error } = await sb
        .from('order_items')
        .select('id, dropoff_datetime, orders!inner(store_id, status)')
        .eq('orders.store_id', storeId)
        .neq('orders.status', 'cancelled')
        .gte('dropoff_datetime', `${date}T20:00:00`)
        .lt('dropoff_datetime', `${date}T23:59:59`);
      if (error) throw new Error(`late-returns-check failed: ${error.message}`);
      const count = (data ?? []).length;
      res.json({ success: true, data: { hasLateReturns: count > 0, count } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /late-return-assignment ── fetch today's assignment for a store
router.get(
  '/late-return-assignment',
  requirePermission(Permission.ViewCashup),
  validateQuery(z.object({ storeId: z.string(), date: z.string() })),
  async (req, res, next) => {
    try {
      const { storeId, date } = req.query as { storeId: string; date: string };
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('late_return_assignments')
        .select('*')
        .eq('store_id', storeId)
        .eq('date', date)
        .maybeSingle();
      if (error) throw new Error(`late-return-assignment fetch failed: ${error.message}`);
      res.json({ success: true, data: data ?? null });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /late-return-assignment ── upsert assignment for the day
router.post(
  '/late-return-assignment',
  requirePermission(Permission.ViewCashup),
  validateBody(z.object({
    storeId: z.string(),
    date: z.string(),
    employeeId: z.string(),
    note: z.string().optional(),
  })),
  async (req, res, next) => {
    try {
      const { storeId, date, employeeId, note } = req.body as {
        storeId: string;
        date: string;
        employeeId: string;
        note?: string;
      };
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('late_return_assignments')
        .upsert(
          { store_id: storeId, date, employee_id: employeeId, note: note ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'store_id,date' },
        )
        .select()
        .single();
      if (error) throw new Error(`late-return-assignment upsert failed: ${error.message}`);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

export { router as cashupRoutes };
