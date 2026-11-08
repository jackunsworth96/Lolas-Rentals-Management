import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  ReconcileCashRequestSchema,
  ReopenReconciliationRequestSchema,
  OverrideReconciliationRequestSchema,
  CashupQuerySchema,
} from '@lolas/shared';
import type { AccountingPort } from '@lolas/domain';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { buildCashupSummary } from '../use-cases/cashup/build-cashup-summary.js';
import { addDaysToDateStr, formatManilaDate } from '../utils/manila-date.js';

const router = Router();
router.use(authenticate);

function lockedResponse(message: string) {
  return { success: false, error: { code: 'LOCKED', message } };
}

function futureResponse(date: string) {
  return { success: false, error: { code: 'FUTURE_DATE', message: `${date} is in the future.` } };
}

async function recordCashDeposit(
  accountingPort: AccountingPort,
  input: { storeId: string; date: string; amount: number; cashAccountId: string; bankAccountId: string; notes?: string },
): Promise<string> {
  const { Money } = await import('@lolas/domain');
  const depositId = crypto.randomUUID();
  const description = input.notes ? `Bank deposit: ${input.notes}` : 'Bank deposit from cash drawer';
  await accountingPort.createTransaction(
    [
      {
        entryId: crypto.randomUUID(),
        accountId: input.bankAccountId,
        debit: Money.php(input.amount),
        credit: Money.zero(),
        description,
        referenceType: 'cash_deposit',
        referenceId: depositId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.cashAccountId,
        debit: Money.zero(),
        credit: Money.php(input.amount),
        description,
        referenceType: 'cash_deposit',
        referenceId: depositId,
      },
    ],
    input.storeId,
    input.date,
  );
  return depositId;
}

const DEPOSIT_ENVELOPE_ACCOUNT_ID = 'CASH-DEPOSIT-ENVELOPE';

/**
 * Customer deposit cash sits in the till but is counted separately at cash-up.
 * After each locked count, move the difference between the counted envelope and
 * the envelope ledger account between it and the till account, so the ledger
 * mirrors the physical split. Re-running for the same day posts nothing new.
 */
async function syncDepositEnvelope(
  accountingPort: AccountingPort,
  input: { storeId: string; date: string; envelopeCounted: number },
): Promise<void> {
  const sb = getSupabaseClient();
  const [{ data: envelope }, { data: cashRule }, { data: balances, error: balErr }] = await Promise.all([
    sb.from('chart_of_accounts').select('id')
      .eq('id', DEPOSIT_ENVELOPE_ACCOUNT_ID).eq('store_id', input.storeId).eq('is_active', true).maybeSingle(),
    sb.from('payment_routing_rules').select('received_into_account_id')
      .eq('store_id', input.storeId).ilike('payment_method_id', 'cash').maybeSingle(),
    sb.rpc('account_balances', { p_from: input.date, p_to: input.date }).eq('account_id', DEPOSIT_ENVELOPE_ACCOUNT_ID),
  ]);
  const tillAccountId = (cashRule as { received_into_account_id?: string | null } | null)?.received_into_account_id;
  if (!envelope || !tillAccountId) return;
  if (balErr) throw new Error(`Envelope balance lookup failed: ${balErr.message}`);

  const row = (balances ?? [])[0] as
    | { opening_debit: number; opening_credit: number; period_debit: number; period_credit: number }
    | undefined;
  const ledger = row
    ? Number(row.opening_debit) + Number(row.period_debit) - Number(row.opening_credit) - Number(row.period_credit)
    : 0;
  const delta = Math.round((input.envelopeCounted - ledger) * 100) / 100;
  if (Math.abs(delta) < 0.01) return;

  const { Money } = await import('@lolas/domain');
  const amount = Money.php(Math.abs(delta));
  const description = `Deposit envelope counted at cash-up (${input.envelopeCounted.toFixed(2)})`;
  const referenceId = `${input.storeId}:${input.date}`;
  const [debitAccount, creditAccount] = delta > 0
    ? [DEPOSIT_ENVELOPE_ACCOUNT_ID, tillAccountId]
    : [tillAccountId, DEPOSIT_ENVELOPE_ACCOUNT_ID];
  await accountingPort.createTransaction(
    [
      { entryId: crypto.randomUUID(), accountId: debitAccount, debit: amount, credit: Money.zero(), description, referenceType: 'deposit_envelope_sync', referenceId },
      { entryId: crypto.randomUUID(), accountId: creditAccount, debit: Money.zero(), credit: amount, description, referenceType: 'deposit_envelope_sync', referenceId },
    ],
    input.storeId,
    input.date,
  );
}

// ── GET /summary — single aggregation endpoint for the Cash Up page ──
router.get(
  '/summary',
  requirePermission(Permission.ViewCashup),
  validateQuery(CashupQuerySchema),
  async (req, res, next) => {
    try {
      const { storeId, date } = req.query as { storeId: string; date: string };
      const data = await buildCashupSummary(getSupabaseClient(), storeId, date);
      res.json({ success: true, data });
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
        await req.app.locals.deps.cashReconciliationRepo.findByDate(storeId, date);
      res.json({ success: true, data: reconciliation });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /history — recent cash-ups with variances, for the history strip ──
router.get(
  '/history',
  requirePermission(Permission.ViewCashup),
  validateQuery(z.object({ storeId: z.string(), days: z.coerce.number().int().min(1).max(90).default(14) })),
  async (req, res, next) => {
    try {
      const { storeId, days } = req.query as unknown as { storeId: string; days: number };
      const sb = getSupabaseClient();
      const today = formatManilaDate();
      const from = addDaysToDateStr(today, -(days - 1));
      const { data, error } = await sb
        .from('cash_reconciliation')
        .select('*')
        .eq('store_id', storeId)
        .gte('date', from)
        .lte('date', today)
        .order('date', { ascending: true });
      if (error) throw new Error(`Cash-up history query failed: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];

      const employeeIds = [...new Set(rows.map((r) => r.submitted_by).filter((v): v is string => !!v))];
      const names = new Map<string, string>();
      if (employeeIds.length > 0) {
        const { data: emps } = await sb.from('employees').select('id, full_name').in('id', employeeIds);
        for (const e of (emps ?? []) as { id: string; full_name: string | null }[]) names.set(e.id, e.full_name ?? '');
      }

      const byDate = new Map(rows.map((r) => [String(r.date), r]));
      const out: Array<Record<string, unknown>> = [];
      for (let d = from; d <= today; d = addDaysToDateStr(d, 1)) {
        const r = byDate.get(d);
        const n = (v: unknown) => (v != null ? Number(v) : null);
        out.push({
          date: d,
          status: !r ? 'missing' : r.is_locked ? 'locked' : 'open',
          tillVariance: r ? n(r.till_variance) : null,
          depositVariance: r ? n(r.deposit_variance) : null,
          varianceNote: r ? ((r.variance_note as string | null) ?? null) : null,
          submittedBy: r ? ((r.submitted_by as string | null) ?? null) : null,
          submittedByName: r?.submitted_by ? names.get(String(r.submitted_by)) ?? null : null,
          reopened: !!r?.overridden_by,
          overrideReason: r ? ((r.override_reason as string | null) ?? null) : null,
        });
      }
      res.json({ success: true, data: out });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /deposit-register — cash deposits currently held for open orders ──
router.get(
  '/deposit-register',
  requirePermission(Permission.ViewCashup),
  validateQuery(z.object({ storeId: z.string() })),
  async (req, res, next) => {
    try {
      const { storeId } = req.query as { storeId: string };
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('payments')
        .select(
          'id, amount, payment_method_id, transaction_date, order_id, orders!order_id!inner(id, status, booking_token, customers!customer_id(name))',
        )
        .eq('store_id', storeId)
        .in('payment_type', ['deposit', 'security_deposit'])
        .not('orders.status', 'in', '(completed,cancelled)')
        .order('transaction_date', { ascending: true });
      if (error) throw new Error(`Deposit register query failed: ${error.message}`);

      type Row = {
        id: string;
        amount: number;
        payment_method_id: string | null;
        transaction_date: string | null;
        order_id: string;
        orders: {
          id: string;
          status: string;
          booking_token: string | null;
          customers: { name: string } | { name: string }[] | null;
        } | null;
      };
      const rows = ((data ?? []) as unknown as Row[]).filter(
        (r) => (r.payment_method_id ?? '').toLowerCase() === 'cash',
      );

      const orderIds = [...new Set(rows.map((r) => r.order_id))];
      const dueByOrder = new Map<string, string>();
      if (orderIds.length > 0) {
        const { data: items } = await sb
          .from('order_items')
          .select('order_id, dropoff_datetime')
          .in('order_id', orderIds);
        for (const i of (items ?? []) as { order_id: string; dropoff_datetime: string | null }[]) {
          if (!i.dropoff_datetime) continue;
          const prev = dueByOrder.get(i.order_id);
          if (!prev || i.dropoff_datetime > prev) dueByOrder.set(i.order_id, i.dropoff_datetime);
        }
      }

      const entries = rows.map((r) => {
        const c = r.orders?.customers;
        const customerName = Array.isArray(c) ? c[0]?.name ?? null : c?.name ?? null;
        return {
          paymentId: r.id,
          orderId: r.order_id,
          bookingToken: r.orders?.booking_token ?? null,
          customerName,
          amount: Number(r.amount ?? 0),
          collectedOn: r.transaction_date,
          returnDue: dueByOrder.get(r.order_id) ?? null,
        };
      });
      const total = entries.reduce((s, e) => s + e.amount, 0);
      res.json({ success: true, data: { entries, total } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /order-lookup — where did an order's money land, and on which day ──
router.get(
  '/order-lookup',
  requirePermission(Permission.ViewCashup),
  validateQuery(z.object({ storeId: z.string(), q: z.string().trim().min(3) })),
  async (req, res, next) => {
    try {
      const { storeId, q } = req.query as { storeId: string; q: string };
      const sb = getSupabaseClient();
      const term = q.replace(/[%,()]/g, '');

      const { data: customers } = await sb.from('customers').select('id').ilike('name', `%${term}%`).limit(20);
      const customerIds = ((customers ?? []) as { id: string }[]).map((c) => c.id);

      let ordersQ = sb
        .from('orders')
        .select('id, booking_token, woo_order_id, status, order_date, settled_at, customers!customer_id(name)')
        .eq('store_id', storeId)
        .order('order_date', { ascending: false })
        .limit(8);
      ordersQ = customerIds.length > 0
        ? ordersQ.or(`booking_token.ilike.%${term}%,woo_order_id.ilike.%${term}%,customer_id.in.(${customerIds.join(',')})`)
        : ordersQ.or(`booking_token.ilike.%${term}%,woo_order_id.ilike.%${term}%`);
      const { data: orders, error } = await ordersQ;
      if (error) throw new Error(`Order lookup failed: ${error.message}`);

      type OrderRow = {
        id: string;
        booking_token: string | null;
        woo_order_id: string | null;
        status: string;
        order_date: string | null;
        settled_at: string | null;
        customers: { name: string } | { name: string }[] | null;
      };
      const orderRows = (orders ?? []) as unknown as OrderRow[];
      const ids = orderRows.map((o) => o.id);
      if (ids.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      const [paymentsRes, journalRes] = await Promise.all([
        sb
          .from('payments')
          .select('id, order_id, payment_type, payment_method_id, amount, transaction_date, settlement_status, created_at')
          .in('order_id', ids)
          .order('created_at', { ascending: true }),
        sb
          .from('journal_entries')
          .select('id, reference_id, reference_type, credit, date, created_at, chart_of_accounts!account_id(name)')
          .in('reference_id', ids)
          .in('reference_type', ['refund', 'deposit'])
          .gt('credit', 0),
      ]);
      if (paymentsRes.error) throw new Error(`Order lookup payments failed: ${paymentsRes.error.message}`);

      type Entry = {
        orderId: string;
        kind: string;
        method: string;
        amount: number;
        date: string | null;
        createdAt: string | null;
      };
      const entries: Entry[] = [];
      for (const p of (paymentsRes.data ?? []) as Record<string, unknown>[]) {
        const pending = p.settlement_status === 'pending' && ['extension', 'addon'].includes(String(p.payment_type));
        if (p.settlement_status === 'absorbed') continue;
        entries.push({
          orderId: String(p.order_id),
          kind: pending ? `${p.payment_type} (unpaid)` : String(p.payment_type),
          method: String(p.payment_method_id ?? ''),
          amount: Number(p.amount ?? 0),
          date: (p.transaction_date as string | null) ?? null,
          createdAt: (p.created_at as string | null) ?? null,
        });
      }
      for (const j of (journalRes.data ?? []) as Record<string, unknown>[]) {
        const acct = j.chart_of_accounts as { name: string } | { name: string }[] | null;
        const acctName = Array.isArray(acct) ? acct[0]?.name : acct?.name;
        entries.push({
          orderId: String(j.reference_id),
          kind: j.reference_type === 'deposit' ? 'deposit applied to rental' : 'deposit return',
          method: acctName ?? '',
          amount: Number(j.credit ?? 0),
          date: (j.date as string | null) ?? null,
          createdAt: (j.created_at as string | null) ?? null,
        });
      }

      const dates = [...new Set(entries.map((e) => e.date).filter((d): d is string => !!d))];
      const lockByDate = new Map<string, { isLocked: boolean; submittedAt: string | null }>();
      if (dates.length > 0) {
        const { data: recons } = await sb
          .from('cash_reconciliation')
          .select('date, is_locked, submitted_at')
          .eq('store_id', storeId)
          .in('date', dates);
        for (const r of (recons ?? []) as { date: string; is_locked: boolean; submitted_at: string | null }[]) {
          lockByDate.set(r.date, { isLocked: r.is_locked, submittedAt: r.submitted_at });
        }
      }

      const result = orderRows.map((o) => {
        const c = o.customers;
        return {
          orderId: o.id,
          bookingToken: o.booking_token ?? o.woo_order_id,
          customerName: Array.isArray(c) ? c[0]?.name ?? null : c?.name ?? null,
          status: o.status,
          orderDate: o.order_date,
          settledAt: o.settled_at,
          entries: entries
            .filter((e) => e.orderId === o.id)
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
            .map((e) => {
              const lock = e.date ? lockByDate.get(e.date) : undefined;
              return {
                ...e,
                cashupStatus: !lock ? 'not cashed up' : lock.isLocked ? 'locked' : 'open',
                postedAfterLock:
                  !!lock?.isLocked && !!lock.submittedAt && !!e.createdAt && e.createdAt > lock.submittedAt,
              };
            }),
        };
      });
      res.json({ success: true, data: result });
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

      if (date > formatManilaDate()) {
        res.status(400).json(futureResponse(date));
        return;
      }
      const recon = await req.app.locals.deps.cashReconciliationRepo.findByDate(storeId, date);
      if (recon?.isLocked) {
        res.status(400).json(lockedResponse(`Cash-up for ${date} is locked. Reopen it first.`));
        return;
      }

      const depositId = await recordCashDeposit(req.app.locals.deps.accountingPort, {
        storeId, date, amount, cashAccountId, bankAccountId, notes,
      });
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

      if (date > formatManilaDate()) {
        res.status(400).json(futureResponse(date));
        return;
      }

      const sb = getSupabaseClient();
      const reconRepo = req.app.locals.deps.cashReconciliationRepo;

      const [fromRecon, toRecon] = await Promise.all([
        reconRepo.findByDate(fromStoreId, date),
        reconRepo.findByDate(toStoreId, date),
      ]);
      if (fromRecon?.isLocked) {
        res.status(400).json(lockedResponse(`Cash-up for the sending store is locked for ${date}. Reopen it first.`));
        return;
      }
      if (toRecon?.isLocked) {
        res.status(400).json(lockedResponse(`Cash-up for the receiving store is locked for ${date}. Reopen it first.`));
        return;
      }

      const { data: stores } = await sb
        .from('stores')
        .select('id, name')
        .in('id', [fromStoreId, toStoreId]);
      const storeMap = new Map(
        ((stores ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
      );
      const fromName = storeMap.get(fromStoreId) ?? fromStoreId;
      const toName = storeMap.get(toStoreId) ?? toStoreId;

      const transferId = crypto.randomUUID();
      const txId = crypto.randomUUID();
      const period = date.slice(0, 7);

      const typeLabel = transferType === 'float' ? 'Float issued' : 'Cash transferred';
      const fromDesc = notes ? `${typeLabel} to ${toName}: ${notes}` : `${typeLabel} to ${toName}`;
      const toDesc = notes ? `${typeLabel} from ${fromName}: ${notes}` : `${typeLabel} from ${fromName}`;

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
      if (error) throw new Error(`Failed to create inter-store transfer: ${error.message}`);

      res.json({
        success: true,
        data: { transferId, amount, transferType, from: fromName, to: toName },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /reconcile — submit denomination counts and lock the day ──
router.post(
  '/reconcile',
  requirePermission(Permission.ViewCashup),
  validateBody(ReconcileCashRequestSchema),
  async (req, res, next) => {
    try {
      const { reconcileCash } = await import('../use-cases/cashup/reconcile-cash.js');
      const sb = getSupabaseClient();
      const accountingPort = req.app.locals.deps.accountingPort as AccountingPort;
      const body = req.body as z.infer<typeof ReconcileCashRequestSchema>;

      const result = await reconcileCash(
        {
          storeId: body.storeId,
          date: body.date,
          tillDenoms: body.tillDenoms,
          depositDenoms: body.depositDenoms,
          varianceNote: body.varianceNote ?? null,
          cashDrop: body.cashDrop ?? null,
          submittedBy: req.user!.employeeId,
        },
        {
          cashReconciliation: req.app.locals.deps.cashReconciliationRepo,
          today: formatManilaDate(),
          loadExpected: async (storeId, date) => {
            const s = await buildCashupSummary(sb, storeId, date);
            return {
              openingTill: s.openingFloat.amount,
              tillExpected: s.expected.till.total,
              envelopeExpected: s.expected.envelope.total,
            };
          },
          recordCashDrop: async (drop) => {
            await recordCashDeposit(accountingPort, { ...drop, notes: 'Close-of-day drop' });
          },
        },
      );
      res.json({ success: true, data: result });

      const envelopeCounted = result.reconciliation.depositsClosingBalance;
      if (envelopeCounted != null) {
        void syncDepositEnvelope(accountingPort, { storeId: body.storeId, date: body.date, envelopeCounted })
          .catch((err) => console.error('[cashup] Deposit envelope ledger sync failed:', err));
      }

      void import('../jobs/cashup-telegram.js')
        .then(({ sendCashupLockedTelegram }) => sendCashupLockedTelegram(result.reconciliation))
        .catch((err) => console.error('[cashup] Telegram cash-up message failed:', err));

      // Evening Telegram is tied to the active Lola's operation.
      if (body.storeId === 'store-lolas') {
        const { triggerEveningNotifications } = await import('../jobs/evening-trigger.js');
        void triggerEveningNotifications('cashup');
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /reopen — unlock a locked day for a recount (manager) ──
async function handleReopen(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) {
  try {
    const { reopenReconciliation } = await import('../use-cases/cashup/reopen-reconciliation.js');
    const { storeId, date, reason } = req.body as { storeId: string; date: string; reason: string };
    const result = await reopenReconciliation(
      { storeId, date, reason, reopenedBy: req.user!.employeeId },
      { cashReconciliation: req.app.locals.deps.cashReconciliationRepo },
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

router.post(
  '/reopen',
  requirePermission(Permission.OverrideCashup),
  validateBody(ReopenReconciliationRequestSchema),
  handleReopen,
);

// Older clients call /override; it now reopens the day for a recount.
router.post(
  '/override',
  requirePermission(Permission.OverrideCashup),
  validateBody(OverrideReconciliationRequestSchema),
  handleReopen,
);

// ── GET /late-returns-check ── active orders due back at or after 20:00 Manila on a given date
router.get(
  '/late-returns-check',
  requirePermission(Permission.ViewCashup),
  validateQuery(z.object({ storeId: z.string(), date: z.string() })),
  async (req, res, next) => {
    try {
      const { storeId, date } = req.query as { storeId: string; date: string };
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('order_items')
        .select('id, order_id, dropoff_datetime, orders!inner(store_id, status)')
        .eq('orders.store_id', storeId)
        .eq('orders.status', 'active')
        .gte('dropoff_datetime', `${date}T00:00:00+08:00`)
        .lt('dropoff_datetime', `${addDaysToDateStr(date, 1)}T00:00:00+08:00`);
      if (error) throw new Error(`late-returns-check failed: ${error.message}`);
      const rows = (data ?? []) as { order_id: string; dropoff_datetime: string }[];

      // A "9pm return" add-on makes a return late even when dropoff_datetime
      // still holds the original earlier time.
      const ninePmOrderIds = new Set<string>();
      const dayOrderIds = [...new Set(rows.map((r) => r.order_id))];
      if (dayOrderIds.length > 0) {
        const { data: addons } = await sb
          .from('order_addons')
          .select('order_id')
          .in('order_id', dayOrderIds)
          .ilike('addon_name', '%9pm%');
        for (const a of (addons ?? []) as { order_id: string }[]) ninePmOrderIds.add(a.order_id);
      }
      const lateFrom = Date.parse(`${date}T20:00:00+08:00`);
      const lateOrderIds = new Set(
        rows
          .filter((r) => ninePmOrderIds.has(r.order_id) || Date.parse(r.dropoff_datetime) >= lateFrom)
          .map((r) => r.order_id),
      );
      const count = lateOrderIds.size;
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
