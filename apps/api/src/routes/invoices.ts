import { Router, type Request } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateInvoiceRequestSchema,
  UpdateInvoiceRequestSchema,
  InvoicePreviewRequestSchema,
  InvoiceListQuerySchema,
  InvoiceOrderSearchQuerySchema,
  UpdateInvoiceSettingsRequestSchema,
  type CreateInvoiceRequest,
  type UpdateInvoiceRequest,
  type UpdateInvoiceSettingsRequest,
  type Invoice,
  type InvoiceLine,
  type InvoiceOrderSearchResult,
  type InvoicePreview,
  type InvoiceSettings,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { buildInvoiceLines } from '../use-cases/invoices/build-invoice-lines.js';
import { formatManilaDate } from '../utils/manila-date.js';

const router = Router();
router.use(authenticate);

const perm = requirePermission(Permission.ManageInvoices);

type InvoiceRow = {
  id: string;
  invoice_number: string;
  store_id: string | null;
  status: 'issued' | 'void';
  issue_date: string;
  due_date: string | null;
  bill_to_name: string;
  bill_to_company: string | null;
  bill_to_address: string | null;
  bill_to_email: string | null;
  bill_to_tin: string | null;
  notes: string | null;
  subtotal: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  deposit_held: number | string;
  last_refreshed_at: string;
  voided_at: string | null;
  created_at: string;
  invoice_orders?: { order_reference: string; sort_order: number }[];
  invoice_lines?: {
    order_reference: string;
    line_type: InvoiceLine['lineType'];
    description: string;
    quantity: number | string;
    unit_price: number | string;
    amount: number | string;
    sort_order: number;
  }[];
};

type SettingsRow = {
  legal_name: string;
  address: string | null;
  tin: string | null;
  email: string | null;
  phone: string | null;
  show_logo: boolean;
  payment_instructions: string | null;
  footer_note: string | null;
  number_prefix: string;
  next_number: number;
};

const INVOICE_SELECT = '*, invoice_orders(order_reference, sort_order), invoice_lines(order_reference, line_type, description, quantity, unit_price, amount, sort_order)';

function notFound(): Error {
  return Object.assign(new Error('Invoice not found'), { statusCode: 404 });
}

function toInvoice(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    storeId: r.store_id,
    status: r.status,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    billToName: r.bill_to_name,
    billToCompany: r.bill_to_company,
    billToAddress: r.bill_to_address,
    billToEmail: r.bill_to_email,
    billToTin: r.bill_to_tin,
    notes: r.notes,
    subtotal: Number(r.subtotal),
    amountPaid: Number(r.amount_paid),
    balanceDue: Number(r.balance_due),
    depositHeld: Number(r.deposit_held),
    orderReferences: [...(r.invoice_orders ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => o.order_reference),
    lines: [...(r.invoice_lines ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        orderReference: l.order_reference,
        lineType: l.line_type,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        amount: Number(l.amount),
      })),
    lastRefreshedAt: r.last_refreshed_at,
    voidedAt: r.voided_at,
    createdAt: r.created_at,
  };
}

function toSettings(r: SettingsRow | null): InvoiceSettings {
  return {
    legalName: r?.legal_name ?? "Lola's Rentals",
    address: r?.address ?? null,
    tin: r?.tin ?? null,
    email: r?.email ?? null,
    phone: r?.phone ?? null,
    showLogo: r?.show_logo ?? true,
    paymentInstructions: r?.payment_instructions ?? null,
    footerNote: r?.footer_note ?? null,
    numberPrefix: r?.number_prefix ?? 'INV-',
    nextNumber: r?.next_number ?? 1,
  };
}

function deps(req: Request) {
  return { sb: getSupabaseClient(), configRepo: req.app.locals.deps.configRepo };
}

/** Only orders in the staff member's stores may be invoiced. */
function assertStoreAccess(req: Request, preview: InvoicePreview): void {
  const allowed = new Set(req.user!.storeIds);
  const blocked = preview.orders.find((o) => o.storeId && !allowed.has(o.storeId));
  if (blocked) {
    throw Object.assign(new Error(`You do not have access to the store for ${blocked.orderReference}`), { statusCode: 403 });
  }
}

async function loadInvoice(sb: SupabaseClient, id: string): Promise<InvoiceRow> {
  const { data, error } = await sb.from('invoices').select(INVOICE_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load invoice: ${error.message}`);
  if (!data) throw notFound();
  return data as InvoiceRow;
}

async function writeSnapshot(sb: SupabaseClient, invoiceId: string, refs: string[], preview: InvoicePreview): Promise<void> {
  const del = await Promise.all([
    sb.from('invoice_orders').delete().eq('invoice_id', invoiceId),
    sb.from('invoice_lines').delete().eq('invoice_id', invoiceId),
  ]);
  for (const r of del) if (r.error) throw new Error(`Failed to reset invoice lines: ${r.error.message}`);

  const orderRows = refs.map((ref, i) => ({ invoice_id: invoiceId, order_reference: ref, sort_order: i }));
  const lineRows = preview.orders.flatMap((o) => o.lines).map((l, i) => ({
    invoice_id: invoiceId,
    order_reference: l.orderReference,
    line_type: l.lineType,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    amount: l.amount,
    sort_order: i,
  }));
  const { error: ordersErr } = await sb.from('invoice_orders').insert(orderRows);
  if (ordersErr) throw new Error(`Failed to save invoice orders: ${ordersErr.message}`);
  if (lineRows.length > 0) {
    const { error: linesErr } = await sb.from('invoice_lines').insert(lineRows);
    if (linesErr) throw new Error(`Failed to save invoice lines: ${linesErr.message}`);
  }
}

function totalsRow(preview: InvoicePreview) {
  return {
    subtotal: preview.subtotal,
    amount_paid: preview.amountPaid,
    balance_due: preview.balanceDue,
    deposit_held: preview.depositHeld,
    last_refreshed_at: new Date().toISOString(),
  };
}

async function previewFor(req: Request, refs: string[]): Promise<InvoicePreview> {
  const preview = await buildInvoiceLines(deps(req), refs);
  if (preview.missing.length > 0) {
    throw Object.assign(new Error(`Booking not found: ${preview.missing.join(', ')}`), { statusCode: 404 });
  }
  assertStoreAccess(req, preview);
  return preview;
}

/** Strips characters that would break a PostgREST `or()` filter. */
function searchTerm(q: string): string {
  return q.replace(/[,()*%_\\"']/g, ' ').trim();
}

// ── Settings ─────────────────────────────────────────────────

router.get('/settings', perm, async (_req, res, next) => {
  try {
    const { data, error } = await getSupabaseClient().from('invoice_settings').select('*').eq('id', 'default').maybeSingle();
    if (error) throw new Error(`Failed to load invoice settings: ${error.message}`);
    res.json({ success: true, data: toSettings(data as SettingsRow | null) });
  } catch (err) { next(err); }
});

router.put('/settings', requirePermission(Permission.EditSettings), validateBody(UpdateInvoiceSettingsRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as UpdateInvoiceSettingsRequest;
    const { data, error } = await getSupabaseClient()
      .from('invoice_settings')
      .upsert({
        id: 'default',
        legal_name: b.legalName,
        address: b.address,
        tin: b.tin,
        email: b.email,
        phone: b.phone,
        show_logo: b.showLogo,
        payment_instructions: b.paymentInstructions,
        footer_note: b.footerNote,
        number_prefix: b.numberPrefix,
        next_number: b.nextNumber,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new Error(`Failed to save invoice settings: ${error.message}`);
    res.json({ success: true, data: toSettings(data as SettingsRow) });
  } catch (err) { next(err); }
});

// ── Order search across inbox, active and completed ──────────

router.get('/order-search', perm, validateQuery(InvoiceOrderSearchQuerySchema), async (req, res, next) => {
  try {
    const { q, storeId } = req.query as { q: string; storeId?: string };
    const term = searchTerm(q);
    if (term.length < 2) { res.json({ success: true, data: [] }); return; }
    const storeIds = storeId ? req.user!.storeIds.filter((s) => s === storeId) : req.user!.storeIds;
    if (storeIds.length === 0) { res.json({ success: true, data: [] }); return; }
    const sb = getSupabaseClient();
    const like = `*${term}*`;

    const { data: customers } = await sb
      .from('customers')
      .select('id')
      .in('store_id', storeIds)
      .or(`name.ilike.${like},email.ilike.${like},mobile.ilike.${like}`)
      .limit(50);
    const customerIds = ((customers ?? []) as { id: string }[]).map((c) => c.id);

    const orderFilters = [`booking_token.ilike.${like}`, `booking_customer_name.ilike.${like}`, `woo_order_id.ilike.${like}`];
    if (customerIds.length > 0) orderFilters.push(`customer_id.in.(${customerIds.join(',')})`);

    const [ordersRes, rawRes] = await Promise.all([
      sb.from('orders')
        .select('id, store_id, status, booking_token, booking_customer_name, final_total, order_date, customers!customer_id(name, email), order_items(pickup_datetime, dropoff_datetime)')
        .in('store_id', storeIds)
        .neq('status', 'cancelled')
        .or(orderFilters.join(','))
        .order('order_date', { ascending: false })
        .limit(25),
      sb.from('orders_raw')
        .select('id, store_id, order_reference, customer_name, customer_email, pickup_datetime, dropoff_datetime, web_quote_raw')
        .in('store_id', storeIds)
        .eq('status', 'unprocessed')
        .or(`order_reference.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like},customer_mobile.ilike.${like},customer_company.ilike.${like}`)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    if (ordersRes.error) throw new Error(`Order search failed: ${ordersRes.error.message}`);
    if (rawRes.error) throw new Error(`Inbox search failed: ${rawRes.error.message}`);

    type SearchOrderRow = {
      id: string; store_id: string; status: string; booking_token: string | null; booking_customer_name: string | null;
      final_total: number | string | null; customers: { name: string | null; email: string | null } | null;
      order_items: { pickup_datetime: string | null; dropoff_datetime: string | null }[] | null;
    };
    type SearchRawRow = {
      id: string; store_id: string | null; order_reference: string | null; customer_name: string | null;
      customer_email: string | null; pickup_datetime: string | null; dropoff_datetime: string | null; web_quote_raw: number | string | null;
    };

    const results: InvoiceOrderSearchResult[] = [
      ...((rawRes.data ?? []) as SearchRawRow[]).map((r) => ({
        orderReference: r.order_reference ?? r.id,
        stage: 'inbox' as const,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        storeId: r.store_id,
        pickupDatetime: r.pickup_datetime,
        dropoffDatetime: r.dropoff_datetime,
        total: r.web_quote_raw != null ? Number(r.web_quote_raw) : null,
      })),
      ...((ordersRes.data ?? []) as unknown as SearchOrderRow[]).map((o) => {
        const pickups = (o.order_items ?? []).map((i) => i.pickup_datetime).filter(Boolean) as string[];
        const dropoffs = (o.order_items ?? []).map((i) => i.dropoff_datetime).filter(Boolean) as string[];
        return {
          orderReference: o.booking_token ?? o.id,
          stage: o.status === 'completed' ? 'completed' as const : 'active' as const,
          customerName: o.booking_customer_name?.trim() || o.customers?.name || null,
          customerEmail: o.customers?.email ?? null,
          storeId: o.store_id,
          pickupDatetime: pickups.sort()[0] ?? null,
          dropoffDatetime: dropoffs.sort().at(-1) ?? null,
          total: o.final_total != null ? Number(o.final_total) : null,
        };
      }),
    ];
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// ── Preview ──────────────────────────────────────────────────

router.post('/preview', perm, validateBody(InvoicePreviewRequestSchema), async (req, res, next) => {
  try {
    const { orderReferences } = req.body as { orderReferences: string[] };
    const preview = await buildInvoiceLines(deps(req), orderReferences);
    assertStoreAccess(req, preview);
    res.json({ success: true, data: preview });
  } catch (err) { next(err); }
});

// ── Invoices CRUD ────────────────────────────────────────────

router.get('/', perm, validateQuery(InvoiceListQuerySchema), async (req, res, next) => {
  try {
    const { orderReference, q, status } = req.query as { orderReference?: string; q?: string; status?: 'issued' | 'void' };
    const sb = getSupabaseClient();
    let query = sb.from('invoices').select(INVOICE_SELECT).order('created_at', { ascending: false }).limit(200);

    if (orderReference) {
      const { data: links, error } = await sb.from('invoice_orders').select('invoice_id').eq('order_reference', orderReference);
      if (error) throw new Error(`Failed to load invoices: ${error.message}`);
      const ids = ((links ?? []) as { invoice_id: string }[]).map((l) => l.invoice_id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      query = query.in('id', ids);
    }
    if (status) query = query.eq('status', status);
    const term = q ? searchTerm(q) : '';
    if (term) {
      const { data: links } = await sb.from('invoice_orders').select('invoice_id').ilike('order_reference', `%${term}%`).limit(100);
      const ids = ((links ?? []) as { invoice_id: string }[]).map((l) => l.invoice_id);
      const filters = [`invoice_number.ilike.*${term}*`, `bill_to_name.ilike.*${term}*`, `bill_to_company.ilike.*${term}*`];
      if (ids.length > 0) filters.push(`id.in.(${ids.join(',')})`);
      query = query.or(filters.join(','));
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load invoices: ${error.message}`);
    const allowed = new Set(req.user!.storeIds);
    const invoices = ((data ?? []) as InvoiceRow[])
      .filter((r) => !r.store_id || allowed.has(r.store_id))
      .map(toInvoice);
    res.json({ success: true, data: invoices });
  } catch (err) { next(err); }
});

router.get('/:id', perm, async (req, res, next) => {
  try {
    const row = await loadInvoice(getSupabaseClient(), req.params.id as string);
    if (row.store_id && !req.user!.storeIds.includes(row.store_id)) throw notFound();
    res.json({ success: true, data: toInvoice(row) });
  } catch (err) { next(err); }
});

router.post('/', perm, validateBody(CreateInvoiceRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as CreateInvoiceRequest;
    const refs = [...new Set(b.orderReferences)];
    const preview = await previewFor(req, refs);
    const sb = getSupabaseClient();

    const { data: number, error: numErr } = await sb.rpc('next_invoice_number');
    if (numErr || !number) throw new Error(`Failed to allocate invoice number: ${numErr?.message ?? 'no number'}`);

    const { data: created, error } = await sb
      .from('invoices')
      .insert({
        invoice_number: number as string,
        store_id: preview.orders[0]?.storeId ?? null,
        issue_date: b.issueDate ?? formatManilaDate(),
        due_date: b.dueDate ?? null,
        bill_to_name: b.billToName,
        bill_to_company: b.billToCompany,
        bill_to_address: b.billToAddress,
        bill_to_email: b.billToEmail,
        bill_to_tin: b.billToTin,
        notes: b.notes,
        created_by: req.user!.employeeId ?? null,
        ...totalsRow(preview),
      })
      .select('id')
      .single();
    if (error || !created) throw new Error(`Failed to create invoice: ${error?.message}`);

    const id = (created as { id: string }).id;
    await writeSnapshot(sb, id, refs, preview);
    res.status(201).json({ success: true, data: toInvoice(await loadInvoice(sb, id)) });
  } catch (err) { next(err); }
});

router.patch('/:id', perm, validateBody(UpdateInvoiceRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as UpdateInvoiceRequest;
    const sb = getSupabaseClient();
    const existing = await loadInvoice(sb, req.params.id as string);
    if (existing.store_id && !req.user!.storeIds.includes(existing.store_id)) throw notFound();
    if (existing.status === 'void') throw Object.assign(new Error('Void invoices cannot be edited'), { statusCode: 409 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.billToName !== undefined) update.bill_to_name = b.billToName;
    if (b.billToCompany !== undefined) update.bill_to_company = b.billToCompany;
    if (b.billToAddress !== undefined) update.bill_to_address = b.billToAddress;
    if (b.billToEmail !== undefined) update.bill_to_email = b.billToEmail;
    if (b.billToTin !== undefined) update.bill_to_tin = b.billToTin;
    if (b.issueDate !== undefined) update.issue_date = b.issueDate;
    if (b.dueDate !== undefined) update.due_date = b.dueDate;
    if (b.notes !== undefined) update.notes = b.notes;

    if (b.orderReferences) {
      const refs = [...new Set(b.orderReferences)];
      const preview = await previewFor(req, refs);
      Object.assign(update, totalsRow(preview), { store_id: preview.orders[0]?.storeId ?? existing.store_id });
      await writeSnapshot(sb, existing.id, refs, preview);
    }

    const { error } = await sb.from('invoices').update(update).eq('id', existing.id);
    if (error) throw new Error(`Failed to update invoice: ${error.message}`);
    res.json({ success: true, data: toInvoice(await loadInvoice(sb, existing.id)) });
  } catch (err) { next(err); }
});

router.post('/:id/refresh', perm, async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const existing = await loadInvoice(sb, req.params.id as string);
    if (existing.store_id && !req.user!.storeIds.includes(existing.store_id)) throw notFound();
    if (existing.status === 'void') throw Object.assign(new Error('Void invoices cannot be refreshed'), { statusCode: 409 });

    const refs = toInvoice(existing).orderReferences;
    const preview = await previewFor(req, refs);
    await writeSnapshot(sb, existing.id, refs, preview);
    const { error } = await sb.from('invoices')
      .update({ ...totalsRow(preview), updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new Error(`Failed to refresh invoice: ${error.message}`);
    res.json({ success: true, data: toInvoice(await loadInvoice(sb, existing.id)) });
  } catch (err) { next(err); }
});

router.post('/:id/void', perm, async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const existing = await loadInvoice(sb, req.params.id as string);
    if (existing.store_id && !req.user!.storeIds.includes(existing.store_id)) throw notFound();
    const { error } = await sb.from('invoices')
      .update({ status: 'void', voided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new Error(`Failed to void invoice: ${error.message}`);
    res.json({ success: true, data: toInvoice(await loadInvoice(sb, existing.id)) });
  } catch (err) { next(err); }
});

export { router as invoiceRoutes };
