import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { SignContractRequestSchema, type PublicContractView, type SignContractRequest } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { validateBody } from '../middleware/validate.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';
import {
  contractPdfFilename,
  contractsNotificationEmail,
  dataUrlToBuffer,
  effectiveStatus,
  emailContractPdf,
  ensureContractPdf,
  httpError,
  logContractEvent,
  sha256Hex,
  uploadContractFile,
  type ContractRow,
} from '../lib/contracts.js';

const contractLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/** After signing, the link keeps working this long so the signer can download their copy. */
const DOWNLOAD_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

const router = Router();
router.use(contractLimiter);

async function loadByToken(req: Request): Promise<ContractRow> {
  const token = String(req.params.token ?? '');
  if (!TOKEN_RE.test(token)) throw httpError('This contract link is not valid', 404, 'NOT_FOUND');
  const { data, error } = await getSupabaseClient()
    .from('contracts')
    .select('*')
    .eq('access_token_hash', sha256Hex(token))
    .maybeSingle();
  if (error) throw new Error(`Contract lookup failed: ${error.message}`);
  const row = data as ContractRow | null;
  if (!row || row.status === 'draft' || row.status === 'voided') throw httpError('This contract link is not valid', 404, 'NOT_FOUND');
  const status = effectiveStatus(row);
  if (status === 'expired' || (row.token_expires_at && Date.parse(row.token_expires_at) < Date.now())) {
    throw httpError('This contract link has expired. Please ask Lola\'s Rentals for a new one.', 410, 'EXPIRED');
  }
  return row;
}

function toPublicView(row: ContractRow): PublicContractView {
  return {
    title: row.title,
    recipientName: row.recipient_name,
    renderedBody: row.rendered_body,
    bodySha256: row.body_sha256 ?? sha256Hex(row.rendered_body),
    status: row.status === 'completed' ? 'completed' : 'awaiting_signature',
    lolaSignerName: row.lola_signer_name,
    lolaSignerTitle: row.lola_signer_title,
    lolaSignedAt: row.lola_signed_at,
    signerName: row.signer_name,
    signedAt: row.signed_at,
  };
}

router.get('/:token', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const row = await loadByToken(req);
    if (row.status === 'sent') {
      const viewedAt = new Date().toISOString();
      const { error } = await sb.from('contracts').update({ status: 'viewed', viewed_at: viewedAt }).eq('id', row.id).eq('status', 'sent');
      if (!error) {
        row.status = 'viewed';
        row.viewed_at = viewedAt;
        await logContractEvent(sb, row.id, 'viewed', 'recipient', { ip: req.ip ?? null });
      }
    }
    res.json({ success: true, data: toPublicView(row) });
  } catch (err) { next(err); }
});

router.post('/:token/sign', validateBody(SignContractRequestSchema), async (req, res, next) => {
  try {
    const b = req.body as SignContractRequest;
    const sb = getSupabaseClient();
    const row = await loadByToken(req);
    if (row.status === 'completed') throw httpError('This contract has already been signed', 409, 'ALREADY_SIGNED');

    const signaturePath = `contracts/${row.id}/recipient-signature.png`;
    await uploadContractFile(sb, signaturePath, dataUrlToBuffer(b.signatureDataUrl), 'image/png');

    const now = new Date();
    const ip = req.ip ?? req.socket.remoteAddress ?? null;
    const { data, error } = await sb
      .from('contracts')
      .update({
        status: 'completed',
        signer_name: b.signerName,
        signer_signature_path: signaturePath,
        signer_ip: ip,
        signer_user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null,
        signed_at: now.toISOString(),
        token_expires_at: new Date(now.getTime() + DOWNLOAD_WINDOW_MS).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', row.id)
      .in('status', ['sent', 'viewed'])
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to save signature: ${error.message}`);
    if (!data) throw httpError('This contract has already been signed', 409, 'ALREADY_SIGNED');
    const signed = data as ContractRow;
    await logContractEvent(sb, signed.id, 'signed', 'recipient', { ip, signerName: b.signerName });

    try {
      await ensureContractPdf(sb, signed);
    } catch (pdfErr) {
      console.error('Contract PDF generation failed after signing:', pdfErr);
    }

    const recipients = [signed.recipient_email, contractsNotificationEmail()].filter((e): e is string => !!e);
    void emailContractPdf(sb, signed, [...new Set(recipients)], 'system')
      .catch((mailErr) => console.error('Signed contract email failed:', mailErr));
    void sendTelegramAlert(
      `✍️ <b>Contract Signed</b>\n${escapeHtml(signed.title)}\nSigned by: ${escapeHtml(b.signerName)}`,
      getTelegramChatId('ops'),
    );

    res.status(201).json({ success: true, data: toPublicView(signed) });
  } catch (err) { next(err); }
});

router.get('/:token/pdf', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const row = await loadByToken(req);
    if (row.status !== 'completed') throw httpError('The contract has not been signed yet', 409, 'NOT_SIGNED');
    const pdf = await ensureContractPdf(sb, row);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${contractPdfFilename(row)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } catch (err) { next(err); }
});

export { router as publicContractRoutes };
