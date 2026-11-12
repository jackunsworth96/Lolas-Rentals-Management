import { Router, type Request, type Response, type NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ContractCounterpartyTypeSchema,
  ContractListQuerySchema,
  CreateContractRequestSchema,
  CreateContractTemplateRequestSchema,
  EmailContractRequestSchema,
  ResendContractRequestSchema,
  SendContractRequestSchema,
  UpdateContractRequestSchema,
  UpdateContractTemplateRequestSchema,
  VoidContractRequestSchema,
  extractPlaceholderKeys,
  fillBuiltInPlaceholders,
  formatContractDate,
  type ContractCategory,
  type ContractCounterparty,
  type ContractCounterpartyType,
  type ContractEvent,
  type ContractStatus,
  type CreateContractRequest,
  type CreateContractTemplateRequest,
  type EmailContractRequest,
  type ResendContractRequest,
  type SendContractRequest,
  type UpdateContractRequest,
  type UpdateContractTemplateRequest,
} from '@lolas/shared';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendEmail } from '../services/email.js';
import { contractSigningRequestHtml } from '../services/email-templates/contracts.js';
import { formatManilaDate, formatManilaDateTime } from '../utils/manila-date.js';
import {
  CONTRACT_BUCKET,
  allowedCategories,
  counterpartyKey,
  counterpartyNames,
  dataUrlToBuffer,
  effectiveStatus,
  emailContractPdf,
  ensureContractPdf,
  httpError,
  logContractEvent,
  newAccessToken,
  permissionForCategory,
  sha256Hex,
  signingUrl,
  toContract,
  toTemplate,
  uploadContractFile,
  type ContractRow,
  type TemplateRow,
} from '../lib/contracts.js';

const router = Router();
router.use(authenticate);

/** Anyone who can manage at least one contract category may use the module. */
router.use((req: Request, res: Response, next: NextFunction) => {
  if (allowedCategories(req.user?.permissions ?? []).length > 0) { next(); return; }
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Missing required permissions: can_manage_contracts' } });
});

const DAY_MS = 24 * 60 * 60 * 1000;

function actor(req: Request): string {
  return req.user?.username ?? 'staff';
}

function assertCategory(req: Request, category: ContractCategory): void {
  if (!req.user!.permissions.includes(permissionForCategory(category))) {
    throw httpError('You do not have access to this contract', 403, 'FORBIDDEN');
  }
}

/** Strips characters that would break a PostgREST `or()` filter. */
function searchTerm(q: string): string {
  return q.replace(/[,()*%_\\"']/g, ' ').trim();
}

async function loadTemplate(sb: SupabaseClient, id: string): Promise<TemplateRow> {
  const { data, error } = await sb.from('contract_templates').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load contract template: ${error.message}`);
  if (!data) throw httpError('Template not found', 404, 'NOT_FOUND');
  return data as TemplateRow;
}

async function loadContract(req: Request, id: string): Promise<ContractRow> {
  const { data, error } = await getSupabaseClient().from('contracts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load contract: ${error.message}`);
  if (!data) throw httpError('Contract not found', 404, 'NOT_FOUND');
  const row = data as ContractRow;
  assertCategory(req, row.category);
  return row;
}

async function contractResponse(sb: SupabaseClient, row: ContractRow, withEvents = false) {
  const names = await counterpartyNames(sb, [row]);
  let events: ContractEvent[] | undefined;
  if (withEvents) {
    const { data } = await sb.from('contract_events').select('event, actor, meta, created_at').eq('contract_id', row.id).order('created_at');
    events = ((data ?? []) as { event: ContractEvent['event']; actor: string | null; meta: Record<string, unknown>; created_at: string }[])
      .map((e) => ({ event: e.event, actor: e.actor, meta: e.meta ?? {}, createdAt: e.created_at }));
  }
  return toContract(row, names.get(counterpartyKey(row)) ?? null, events);
}

// ── Linked records (for auto-fill) ───────────────────────────

type PartnerRow = {
  id: string; name: string; contact_name: string | null; contact_email: string | null; contact_whatsapp: string | null;
  commission_type: string; commission_value: number | string; store_id: string; stores: { name: string } | null;
};
type EmployeeRow = {
  id: string; full_name: string; role: string | null; status: string; start_date: string | null; probation_end_date: string | null;
  rate_type: string | null; basic_rate: number | string | null; stores: { name: string } | null;
};

function clean(fields: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
}

async function listCounterparties(req: Request, type: ContractCounterpartyType, id?: string): Promise<ContractCounterparty[]> {
  const sb = getSupabaseClient();
  if (type === 'accommodation_partner') {
    assertCategory(req, 'accommodation_partner');
    let q = sb.from('accommodation_partners')
      .select('id, name, contact_name, contact_email, contact_whatsapp, commission_type, commission_value, store_id, stores(name)')
      .in('store_id', req.user!.storeIds)
      .order('name');
    if (id) q = q.eq('id', id);
    const { data, error } = await q;
    if (error) throw new Error(`Failed to load partners: ${error.message}`);
    return ((data ?? []) as unknown as PartnerRow[]).map((p) => ({
      type, id: p.id, name: p.name, email: p.contact_email,
      fields: clean({
        name: p.name, contact_name: p.contact_name, contact_email: p.contact_email, contact_whatsapp: p.contact_whatsapp,
        commission_type: p.commission_type, commission_value: p.commission_value, store_name: p.stores?.name,
      }),
    }));
  }
  if (type === 'paw_card_establishment') {
    assertCategory(req, 'paw_card_partner');
    let q = sb.from('paw_card_establishments').select('*').order('name');
    if (id) {
      const n = Number(id);
      if (!Number.isInteger(n)) return [];
      q = q.eq('id', n);
    }
    const { data, error } = await q;
    if (error) throw new Error(`Failed to load establishments: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      type, id: String(e.id), name: String(e.name ?? ''), email: null,
      fields: clean({
        name: e.name, category: e.category, discount_headline: e.discount_headline,
        discount_conditions: e.discount_conditions, discount_code: e.discount_code,
      }),
    }));
  }
  if (type === 'employee') {
    assertCategory(req, 'staff');
    let q = sb.from('employees')
      .select('id, full_name, role, status, start_date, probation_end_date, rate_type, basic_rate, stores(name)')
      .order('full_name');
    if (id) q = q.eq('id', id);
    const { data, error } = await q;
    if (error) throw new Error(`Failed to load employees: ${error.message}`);
    return ((data ?? []) as unknown as EmployeeRow[]).map((e) => ({
      type, id: e.id, name: e.full_name, email: null,
      fields: clean({
        full_name: e.full_name, role: e.role, start_date: e.start_date, probation_end_date: e.probation_end_date,
        rate_type: e.rate_type, basic_rate: e.basic_rate, store_name: e.stores?.name,
      }),
    }));
  }
  return [];
}

async function assertCounterparty(req: Request, type: ContractCounterpartyType, id: string | null | undefined): Promise<void> {
  if (type === 'external') return;
  if (!id) throw httpError('Choose the linked record for this contract', 400, 'VALIDATION_ERROR');
  const found = await listCounterparties(req, type, id);
  if (found.length === 0) throw httpError('Linked record not found', 404, 'NOT_FOUND');
}

router.get('/counterparties', async (req, res, next) => {
  try {
    const parsed = ContractCounterpartyTypeSchema.safeParse(req.query.type);
    if (!parsed.success) throw httpError('Unknown counterparty type', 400, 'VALIDATION_ERROR');
    res.json({ success: true, data: await listCounterparties(req, parsed.data) });
  } catch (err) { next(err); }
});

// ── Templates ────────────────────────────────────────────────

router.get('/templates', async (req, res, next) => {
  try {
    const categories = allowedCategories(req.user!.permissions);
    let q = getSupabaseClient().from('contract_templates').select('*').in('category', categories).order('name');
    if (req.query.includeInactive !== 'true') q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(`Failed to load contract templates: ${error.message}`);
    res.json({ success: true, data: ((data ?? []) as TemplateRow[]).map(toTemplate) });
  } catch (err) { next(err); }
});

router.get('/templates/:id', async (req, res, next) => {
  try {
    const row = await loadTemplate(getSupabaseClient(), req.params.id as string);
    assertCategory(req, row.category);
    res.json({ success: true, data: toTemplate(row) });
  } catch (err) { next(err); }
});

router.post('/templates', validateBody(CreateContractTemplateRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as CreateContractTemplateRequest;
    assertCategory(req, b.category);
    const { data, error } = await getSupabaseClient()
      .from('contract_templates')
      .insert({
        name: b.name,
        category: b.category,
        description: b.description,
        body_markdown: b.bodyMarkdown,
        placeholders: b.placeholders,
        is_active: b.isActive,
        created_by: req.user!.employeeId ?? null,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to create contract template: ${error?.message}`);
    res.status(201).json({ success: true, data: toTemplate(data as TemplateRow) });
  } catch (err) { next(err); }
});

router.patch('/templates/:id', validateBody(UpdateContractTemplateRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as UpdateContractTemplateRequest;
    const sb = getSupabaseClient();
    const existing = await loadTemplate(sb, req.params.id as string);
    assertCategory(req, existing.category);
    if (b.category) assertCategory(req, b.category);

    const wordingChanged =
      (b.bodyMarkdown !== undefined && b.bodyMarkdown !== existing.body_markdown) ||
      (b.placeholders !== undefined && JSON.stringify(b.placeholders) !== JSON.stringify(existing.placeholders ?? []));

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) update.name = b.name;
    if (b.category !== undefined) update.category = b.category;
    if (b.description !== undefined) update.description = b.description;
    if (b.bodyMarkdown !== undefined) update.body_markdown = b.bodyMarkdown;
    if (b.placeholders !== undefined) update.placeholders = b.placeholders;
    if (b.isActive !== undefined) update.is_active = b.isActive;
    if (wordingChanged) update.version = existing.version + 1;

    const { data, error } = await sb.from('contract_templates').update(update).eq('id', existing.id).select('*').single();
    if (error || !data) throw new Error(`Failed to update contract template: ${error?.message}`);
    res.json({ success: true, data: toTemplate(data as TemplateRow) });
  } catch (err) { next(err); }
});

// ── Contracts ────────────────────────────────────────────────

router.get('/', validateQuery(ContractListQuerySchema), async (req, res, next) => {
  try {
    const { q, status, category, counterpartyType, counterpartyId } = req.query as {
      q?: string; status?: ContractStatus; category?: ContractCategory; counterpartyType?: ContractCounterpartyType; counterpartyId?: string;
    };
    const sb = getSupabaseClient();
    const categories = allowedCategories(req.user!.permissions).filter((c) => !category || c === category);
    if (categories.length === 0) { res.json({ success: true, data: [] }); return; }

    let query = sb.from('contracts').select('*').in('category', categories).order('created_at', { ascending: false }).limit(300);
    if (counterpartyType) query = query.eq('counterparty_type', counterpartyType);
    if (counterpartyId) query = query.eq('counterparty_id', counterpartyId);
    const term = q ? searchTerm(q) : '';
    if (term) query = query.or(`title.ilike.*${term}*,recipient_name.ilike.*${term}*,recipient_email.ilike.*${term}*`);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load contracts: ${error.message}`);
    let rows = (data ?? []) as ContractRow[];
    if (status) rows = rows.filter((r) => effectiveStatus(r) === status);
    const names = await counterpartyNames(sb, rows);
    res.json({ success: true, data: rows.map((r) => toContract(r, names.get(counterpartyKey(r)) ?? null)) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await loadContract(req, req.params.id as string);
    res.json({ success: true, data: await contractResponse(getSupabaseClient(), row, true) });
  } catch (err) { next(err); }
});

router.post('/', validateBody(CreateContractRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as CreateContractRequest;
    assertCategory(req, b.category);
    await assertCounterparty(req, b.counterpartyType, b.counterpartyId);
    const sb = getSupabaseClient();

    let templateVersion: number | null = null;
    if (b.templateId) {
      const tpl = await loadTemplate(sb, b.templateId);
      assertCategory(req, tpl.category);
      templateVersion = tpl.version;
    }

    const { data, error } = await sb
      .from('contracts')
      .insert({
        template_id: b.templateId ?? null,
        template_version: templateVersion,
        title: b.title,
        category: b.category,
        counterparty_type: b.counterpartyType,
        counterparty_id: b.counterpartyType === 'external' ? null : b.counterpartyId,
        recipient_name: b.recipientName,
        recipient_email: b.recipientEmail ?? null,
        values: b.values,
        rendered_body: b.renderedBody,
        created_by: req.user!.employeeId ?? null,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to create contract: ${error?.message}`);
    const row = data as ContractRow;
    await logContractEvent(sb, row.id, 'created', actor(req), { templateId: b.templateId ?? null, templateVersion });
    res.status(201).json({ success: true, data: await contractResponse(sb, row) });
  } catch (err) { next(err); }
});

router.patch('/:id', validateBody(UpdateContractRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as UpdateContractRequest;
    const sb = getSupabaseClient();
    const existing = await loadContract(req, req.params.id as string);
    if (existing.status !== 'draft') throw httpError('Only draft contracts can be edited', 409, 'CONFLICT');
    if (b.category) assertCategory(req, b.category);
    const counterpartyType = b.counterpartyType ?? existing.counterparty_type;
    if (b.counterpartyType !== undefined || b.counterpartyId !== undefined) {
      await assertCounterparty(req, counterpartyType, b.counterpartyId ?? existing.counterparty_id);
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) update.title = b.title;
    if (b.category !== undefined) update.category = b.category;
    if (b.counterpartyType !== undefined) update.counterparty_type = b.counterpartyType;
    if (b.counterpartyId !== undefined || counterpartyType === 'external') {
      update.counterparty_id = counterpartyType === 'external' ? null : (b.counterpartyId ?? existing.counterparty_id);
    }
    if (b.recipientName !== undefined) update.recipient_name = b.recipientName;
    if (b.recipientEmail !== undefined) update.recipient_email = b.recipientEmail ?? null;
    if (b.values !== undefined) update.values = b.values;
    if (b.renderedBody !== undefined) update.rendered_body = b.renderedBody;

    const { data, error } = await sb.from('contracts').update(update).eq('id', existing.id).eq('status', 'draft').select('*').single();
    if (error || !data) throw new Error(`Failed to update contract: ${error?.message}`);
    await logContractEvent(sb, existing.id, 'updated', actor(req));
    res.json({ success: true, data: await contractResponse(sb, data as ContractRow) });
  } catch (err) { next(err); }
});

async function emailSigningLink(row: ContractRow, url: string): Promise<boolean> {
  if (!row.recipient_email) return false;
  await sendEmail({
    to: row.recipient_email,
    subject: `Please sign: ${row.title} | Lola's Rentals`,
    html: contractSigningRequestHtml({
      recipientName: row.recipient_name,
      title: row.title,
      signingUrl: url,
      lolaSignerName: row.lola_signer_name ?? "Lola's Rentals",
      expiresAt: row.token_expires_at ? formatManilaDateTime(row.token_expires_at) : '',
    }),
  });
  return true;
}

router.post('/:id/send', validateBody(SendContractRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as SendContractRequest;
    const sb = getSupabaseClient();
    const existing = await loadContract(req, req.params.id as string);
    if (existing.status !== 'draft') throw httpError('This contract has already been sent', 409, 'CONFLICT');
    if (b.sendEmail && !existing.recipient_email) throw httpError('Add the recipient email address before emailing the link', 400, 'NO_EMAIL');

    const finalBody = fillBuiltInPlaceholders(existing.rendered_body, {
      today: formatContractDate(formatManilaDate()),
      recipient_name: existing.recipient_name,
      lola_signer_name: b.lolaSignerName,
      lola_signer_title: b.lolaSignerTitle ?? '',
    });
    const unresolved = extractPlaceholderKeys(finalBody);
    if (unresolved.length > 0) {
      throw httpError(`Fill in every placeholder before sending: ${unresolved.map((k) => `{{${k}}}`).join(', ')}`, 400, 'UNRESOLVED_PLACEHOLDERS');
    }
    if (!finalBody.trim()) throw httpError('The contract has no text', 400, 'VALIDATION_ERROR');

    const signaturePath = `contracts/${existing.id}/lola-signature.png`;
    await uploadContractFile(sb, signaturePath, dataUrlToBuffer(b.signatureDataUrl), 'image/png');

    const now = new Date();
    const { token, hash } = newAccessToken();
    const { data, error } = await sb
      .from('contracts')
      .update({
        rendered_body: finalBody,
        body_sha256: sha256Hex(finalBody),
        status: 'sent',
        access_token_hash: hash,
        token_expires_at: new Date(now.getTime() + b.expiresInDays * DAY_MS).toISOString(),
        sent_at: now.toISOString(),
        lola_signer_user_id: req.user!.userId,
        lola_signer_name: b.lolaSignerName,
        lola_signer_title: b.lolaSignerTitle,
        lola_signature_path: signaturePath,
        lola_signed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id)
      .eq('status', 'draft')
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to send contract: ${error?.message}`);
    const row = data as ContractRow;

    const url = signingUrl(token);
    const emailed = b.sendEmail ? await emailSigningLink(row, url) : false;
    await logContractEvent(sb, row.id, 'sent', actor(req), { emailed, expiresAt: row.token_expires_at });
    res.json({ success: true, data: { contract: await contractResponse(sb, row), signingUrl: url, emailed } });
  } catch (err) { next(err); }
});

/** Issues a fresh link (the old one stops working) and optionally emails it. */
router.post('/:id/resend', validateBody(ResendContractRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as ResendContractRequest;
    const sb = getSupabaseClient();
    const existing = await loadContract(req, req.params.id as string);
    if (!['sent', 'viewed'].includes(existing.status)) throw httpError('Only contracts awaiting signature can be resent', 409, 'CONFLICT');
    if (b.sendEmail && !existing.recipient_email) throw httpError('This contract has no recipient email address', 400, 'NO_EMAIL');

    const { token, hash } = newAccessToken();
    const { data, error } = await sb
      .from('contracts')
      .update({
        access_token_hash: hash,
        token_expires_at: new Date(Date.now() + b.expiresInDays * DAY_MS).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .in('status', ['sent', 'viewed'])
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to resend contract: ${error?.message}`);
    const row = data as ContractRow;

    const url = signingUrl(token);
    const emailed = b.sendEmail ? await emailSigningLink(row, url) : false;
    await logContractEvent(sb, row.id, 'resent', actor(req), { emailed, expiresAt: row.token_expires_at });
    res.json({ success: true, data: { contract: await contractResponse(sb, row), signingUrl: url, emailed } });
  } catch (err) { next(err); }
});

router.post('/:id/void', validateBody(VoidContractRequestSchema), async (req, res, next) => {
  try {
    const { reason } = req.body as { reason: string | null };
    const sb = getSupabaseClient();
    const existing = await loadContract(req, req.params.id as string);
    if (existing.status === 'voided') throw httpError('This contract is already void', 409, 'CONFLICT');
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from('contracts')
      .update({ status: 'voided', voided_at: now, void_reason: reason, access_token_hash: null, updated_at: now })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to void contract: ${error?.message}`);
    await logContractEvent(sb, existing.id, 'voided', actor(req), { reason });
    res.json({ success: true, data: await contractResponse(sb, data as ContractRow) });
  } catch (err) { next(err); }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const row = await loadContract(req, req.params.id as string);
    await ensureContractPdf(sb, row);
    const { data, error } = await sb.storage.from(CONTRACT_BUCKET).createSignedUrl(row.pdf_path!, 300, {
      download: `${row.title.replace(/[^a-zA-Z0-9 -]+/g, '').trim() || 'contract'}.pdf`,
    });
    if (error || !data?.signedUrl) throw new Error(`Could not create PDF link: ${error?.message ?? 'no url'}`);
    res.json({ success: true, data: { url: data.signedUrl } });
  } catch (err) { next(err); }
});

router.post('/:id/email', validateBody(EmailContractRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as EmailContractRequest;
    const sb = getSupabaseClient();
    const row = await loadContract(req, req.params.id as string);
    await emailContractPdf(sb, row, b.to, actor(req), b.message);
    res.json({ success: true, data: { sentTo: b.to } });
  } catch (err) { next(err); }
});

export { router as contractRoutes };
