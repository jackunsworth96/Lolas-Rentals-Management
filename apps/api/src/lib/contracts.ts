import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Permission,
  type Contract,
  type ContractCategory,
  type ContractCounterpartyType,
  type ContractEvent,
  type ContractPlaceholderField,
  type ContractStatus,
  type ContractTemplate,
} from '@lolas/shared';
import { buildContractPdf } from './contract-pdf.js';
import { normalizePublicWebOrigin, publicWebOriginFromEnv } from './public-web-url.js';
import { sendEmail, NOTIFICATION_EMAIL } from '../services/email.js';
import { contractCompletedHtml } from '../services/email-templates/contracts.js';
import { formatManilaDateTime } from '../utils/manila-date.js';

export const CONTRACT_BUCKET = 'contract-documents';

export type ContractRow = {
  id: string;
  template_id: string | null;
  template_version: number | null;
  title: string;
  category: ContractCategory;
  counterparty_type: ContractCounterpartyType;
  counterparty_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  values: Record<string, string> | null;
  rendered_body: string;
  body_sha256: string | null;
  status: ContractStatus;
  access_token_hash: string | null;
  token_expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  lola_signer_user_id: string | null;
  lola_signer_name: string | null;
  lola_signer_title: string | null;
  lola_signature_path: string | null;
  lola_signed_at: string | null;
  signer_name: string | null;
  signer_signature_path: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signed_at: string | null;
  pdf_path: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateRow = {
  id: string;
  name: string;
  category: ContractCategory;
  description: string | null;
  body_markdown: string;
  placeholders: ContractPlaceholderField[] | null;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function httpError(message: string, statusCode: number, code?: string): Error {
  return Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function signingUrl(token: string): string {
  const raw = process.env.WEB_URL;
  const base = raw?.trim() ? normalizePublicWebOrigin(raw) : publicWebOriginFromEnv(undefined);
  return `${base}/contract/${token}`;
}

/** Sent or viewed links past their expiry read as expired without a write. */
export function effectiveStatus(row: Pick<ContractRow, 'status' | 'token_expires_at'>, now = Date.now()): ContractStatus {
  if ((row.status === 'sent' || row.status === 'viewed') && row.token_expires_at && Date.parse(row.token_expires_at) < now) {
    return 'expired';
  }
  return row.status;
}

/** Staff contracts can hold pay terms, so they sit behind the HR permission. */
export function permissionForCategory(category: ContractCategory): string {
  return category === 'staff' ? Permission.ManageStaffContracts : Permission.ManageContracts;
}

export function allowedCategories(permissions: string[]): ContractCategory[] {
  const all: ContractCategory[] = ['accommodation_partner', 'paw_card_partner', 'staff', 'other'];
  return all.filter((c) => permissions.includes(permissionForCategory(c)));
}

export function toTemplate(r: TemplateRow): ContractTemplate {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    bodyMarkdown: r.body_markdown,
    placeholders: r.placeholders ?? [],
    version: r.version,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toContract(r: ContractRow, counterpartyName: string | null = null, events?: ContractEvent[]): Contract {
  return {
    id: r.id,
    templateId: r.template_id,
    templateVersion: r.template_version,
    title: r.title,
    category: r.category,
    counterpartyType: r.counterparty_type,
    counterpartyId: r.counterparty_id,
    counterpartyName,
    recipientName: r.recipient_name,
    recipientEmail: r.recipient_email,
    values: r.values ?? {},
    renderedBody: r.rendered_body,
    bodySha256: r.body_sha256,
    status: effectiveStatus(r),
    tokenExpiresAt: r.token_expires_at,
    sentAt: r.sent_at,
    viewedAt: r.viewed_at,
    lolaSignerName: r.lola_signer_name,
    lolaSignerTitle: r.lola_signer_title,
    lolaSignedAt: r.lola_signed_at,
    signerName: r.signer_name,
    signedAt: r.signed_at,
    hasPdf: !!r.pdf_path,
    voidedAt: r.voided_at,
    voidReason: r.void_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(events ? { events } : {}),
  };
}

export async function logContractEvent(
  sb: SupabaseClient,
  contractId: string,
  event: ContractEvent['event'],
  actor: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await sb.from('contract_events').insert({ contract_id: contractId, event, actor, meta });
  if (error) console.error('contract_events insert failed:', error.message);
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

export async function uploadContractFile(sb: SupabaseClient, path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await sb.storage.from(CONTRACT_BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Contract storage upload failed: ${error.message}`);
}

export async function downloadContractFile(sb: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await sb.storage.from(CONTRACT_BUCKET).download(path);
  if (error || !data) throw new Error(`Contract storage download failed: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}

async function signatureDataUrl(sb: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    return `data:image/png;base64,${(await downloadContractFile(sb, path)).toString('base64')}`;
  } catch (err) {
    console.error('Contract signature download failed:', err);
    return null;
  }
}

export function contractPdfFilename(row: Pick<ContractRow, 'title' | 'recipient_name'>): string {
  const slug = `${row.title} ${row.recipient_name}`.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `${slug || 'contract'}.pdf`;
}

/** Builds the signed PDF from the stored record and both signature images. */
export async function buildSignedContractPdf(sb: SupabaseClient, row: ContractRow): Promise<Buffer> {
  const [lolaSig, recipientSig] = await Promise.all([
    signatureDataUrl(sb, row.lola_signature_path),
    signatureDataUrl(sb, row.signer_signature_path),
  ]);
  return buildContractPdf({
    contractId: row.id,
    title: row.title,
    renderedBody: row.rendered_body,
    bodySha256: row.body_sha256 ?? sha256Hex(row.rendered_body),
    signerIp: row.signer_ip,
    lola: {
      heading: "For Lola's Rentals",
      name: row.lola_signer_name ?? "Lola's Rentals",
      title: row.lola_signer_title,
      signedAt: row.lola_signed_at ? formatManilaDateTime(row.lola_signed_at) : '',
      signatureDataUrl: lolaSig,
    },
    recipient: {
      heading: row.recipient_name,
      name: row.signer_name ?? row.recipient_name,
      signedAt: row.signed_at ? formatManilaDateTime(row.signed_at) : '',
      signatureDataUrl: recipientSig,
    },
  });
}

/** Returns the stored PDF, generating and storing it first if missing. */
export async function ensureContractPdf(sb: SupabaseClient, row: ContractRow): Promise<Buffer> {
  if (row.status !== 'completed') throw httpError('The contract has not been signed yet', 409, 'NOT_SIGNED');
  if (row.pdf_path) {
    try {
      return await downloadContractFile(sb, row.pdf_path);
    } catch (err) {
      console.error('Stored contract PDF unavailable, regenerating:', err);
    }
  }
  const pdf = await buildSignedContractPdf(sb, row);
  const path = `contracts/${row.id}/signed.pdf`;
  await uploadContractFile(sb, path, pdf, 'application/pdf');
  const { error } = await sb.from('contracts').update({ pdf_path: path, updated_at: new Date().toISOString() }).eq('id', row.id);
  if (error) console.error('contracts pdf_path update failed:', error.message);
  row.pdf_path = path;
  return pdf;
}

export function contractsNotificationEmail(): string {
  return process.env.CONTRACTS_NOTIFICATION_EMAIL?.trim() || NOTIFICATION_EMAIL;
}

export async function emailContractPdf(
  sb: SupabaseClient,
  row: ContractRow,
  to: string[],
  actor: string | null,
  message?: string | null,
): Promise<void> {
  const pdf = await ensureContractPdf(sb, row);
  await sendEmail({
    to,
    subject: `Signed: ${row.title} | Lola's Rentals`,
    html: contractCompletedHtml({
      recipientName: row.recipient_name,
      title: row.title,
      signedAt: row.signed_at ? formatManilaDateTime(row.signed_at) : '',
      message,
    }),
    attachments: [{ filename: contractPdfFilename(row), content: pdf }],
  });
  await logContractEvent(sb, row.id, 'emailed', actor, { to });
}

/** Display names for linked partners, establishments and employees. */
export async function counterpartyNames(sb: SupabaseClient, rows: Pick<ContractRow, 'counterparty_type' | 'counterparty_id'>[]): Promise<Map<string, string>> {
  const ids = (type: ContractCounterpartyType) =>
    [...new Set(rows.filter((r) => r.counterparty_type === type && r.counterparty_id).map((r) => r.counterparty_id!))];
  const partnerIds = ids('accommodation_partner');
  const establishmentIds = ids('paw_card_establishment').map(Number).filter(Number.isFinite);
  const employeeIds = ids('employee');

  const [partners, establishments, employees] = await Promise.all([
    partnerIds.length ? sb.from('accommodation_partners').select('id, name').in('id', partnerIds) : Promise.resolve({ data: [] }),
    establishmentIds.length ? sb.from('paw_card_establishments').select('id, name').in('id', establishmentIds) : Promise.resolve({ data: [] }),
    employeeIds.length ? sb.from('employees').select('id, full_name').in('id', employeeIds) : Promise.resolve({ data: [] }),
  ]);

  const names = new Map<string, string>();
  for (const p of (partners.data ?? []) as { id: string; name: string }[]) names.set(`accommodation_partner:${p.id}`, p.name);
  for (const e of (establishments.data ?? []) as { id: number; name: string }[]) names.set(`paw_card_establishment:${e.id}`, e.name);
  for (const e of (employees.data ?? []) as { id: string; full_name: string }[]) names.set(`employee:${e.id}`, e.full_name);
  return names;
}

export function counterpartyKey(r: Pick<ContractRow, 'counterparty_type' | 'counterparty_id'>): string {
  return `${r.counterparty_type}:${r.counterparty_id}`;
}
