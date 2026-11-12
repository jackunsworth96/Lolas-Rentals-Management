import { useRef, useState } from 'react';
import { CONTRACT_CATEGORY_LABELS, extractPlaceholderKeys } from '@lolas/shared';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { SignaturePad, isCanvasBlank } from '../common/SignaturePad.js';
import { ContractMarkdown } from './ContractMarkdown.js';
import { ContractStatusBadge, fmtContractDateTime } from './contract-ui.js';
import {
  openContractPdf,
  useContract,
  useEmailContract,
  useResendContract,
  useSendContract,
  useVoidContract,
  type Contract,
} from '../../api/contracts.js';
import { useAuthStore } from '../../stores/auth-store.js';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
const BUILT_IN_AT_SEND = new Set(['today', 'recipient_name', 'lola_signer_name', 'lola_signer_title']);

const EVENT_LABELS: Record<string, string> = {
  created: 'Draft created',
  updated: 'Draft edited',
  sent: 'Signed by Lola\'s and sent',
  resent: 'New link issued',
  viewed: 'Opened by recipient',
  signed: 'Signed by recipient',
  voided: 'Voided',
  emailed: 'Signed PDF emailed',
};

function LinkBox({ url, emailed, email }: { url: string; emailed: boolean; email: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
      <p className="font-medium text-teal-900">
        {emailed ? `Signing link emailed to ${email}.` : 'Signing link ready. Send it to the signer (for example on WhatsApp).'}
      </p>
      <div className="flex gap-2">
        <input readOnly className={`${inputCls} bg-white font-mono text-xs`} value={url} onFocus={(e) => e.target.select()} />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)); }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-teal-800">For security this link is only shown now. If it's lost, issue a new one (the old link then stops working).</p>
    </div>
  );
}

function SignAndSend({ contract, onLink }: { contract: Contract; onLink: (r: { url: string; emailed: boolean }) => void }) {
  const username = useAuthStore((s) => s.user?.username ?? '');
  const [signerName, setSignerName] = useState(username);
  const [signerTitle, setSignerTitle] = useState('');
  const [emailLink, setEmailLink] = useState(!!contract.recipientEmail);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const send = useSendContract();

  const unresolved = extractPlaceholderKeys(contract.renderedBody).filter((k) => !BUILT_IN_AT_SEND.has(k));

  async function submit() {
    setError(null);
    const canvas = canvasRef.current;
    if (!signerName.trim()) { setError('Enter the name of the person signing for Lola\'s.'); return; }
    if (!canvas || isCanvasBlank(canvas)) { setError('Draw your signature first.'); return; }
    try {
      const r = await send.mutateAsync({
        id: contract.id,
        lolaSignerName: signerName.trim(),
        lolaSignerTitle: signerTitle.trim() || null,
        signatureDataUrl: canvas.toDataURL('image/png'),
        sendEmail: emailLink,
        expiresInDays: 30,
      });
      onLink({ url: r.signingUrl, emailed: r.emailed });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (unresolved.length > 0) {
    return (
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        Fill in these placeholders before sending: {unresolved.map((k) => `{{${k}}}`).join(', ')}. Use "Edit draft".
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900">Sign for Lola's and send</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Signing for Lola's</span>
          <input className={inputCls} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Title (optional)</span>
          <input className={inputCls} value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="Owner" />
        </label>
      </div>
      <SignaturePad canvasRef={canvasRef} onDrawingChange={setHasInk} className="h-[150px]" />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={emailLink} disabled={!contract.recipientEmail} onChange={(e) => setEmailLink(e.target.checked)} />
        {contract.recipientEmail ? `Email the signing link to ${contract.recipientEmail}` : 'No email on file: you will get a link to share'}
      </label>
      <p className="text-xs text-gray-500">Once sent, the text is locked. The link is valid for 30 days.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Button loading={send.isPending} disabled={!hasInk} onClick={() => void submit()}>Sign and send</Button>
      </div>
    </div>
  );
}

function EmailPdf({ contract }: { contract: Contract }) {
  const [to, setTo] = useState(contract.recipientEmail ?? '');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const email = useEmailContract();

  async function submit() {
    setError(null);
    const list = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { setError('Enter at least one email address.'); return; }
    try {
      await email.mutateAsync({ id: contract.id, to: list });
      setDone(list.join(', '));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, other@example.com" />
        <Button variant="secondary" loading={email.isPending} onClick={() => void submit()}>Email PDF</Button>
      </div>
      {done && <p className="text-xs text-green-700">Sent to {done}.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface Props {
  contractId: string;
  onClose: () => void;
  onEdit: (id: string) => void;
}

export function ContractDetailModal({ contractId, onClose, onEdit }: Props) {
  const { data: contract, isLoading, error } = useContract(contractId);
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const resend = useResendContract();
  const voidContract = useVoidContract();

  async function reissue(sendEmail: boolean) {
    if (!contract) return;
    setActionError(null);
    if (!window.confirm('Issue a new signing link? The previous link will stop working.')) return;
    try {
      const r = await resend.mutateAsync({ id: contract.id, sendEmail });
      setLink({ url: r.signingUrl, emailed: r.emailed });
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function doVoid() {
    if (!contract) return;
    const reason = window.prompt('Why are you voiding this contract? (optional)');
    if (reason === null) return;
    setActionError(null);
    try {
      await voidContract.mutateAsync({ id: contract.id, reason: reason.trim() || null });
      setLink(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function downloadPdf() {
    if (!contract) return;
    setPdfLoading(true);
    setActionError(null);
    try {
      await openContractPdf(contract.id);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setPdfLoading(false);
    }
  }

  const awaiting = contract && ['sent', 'viewed', 'expired'].includes(contract.status);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={contract ? contract.title : 'Contract'}
      headerActions={contract && <ContractStatusBadge status={contract.status} />}
    >
      {isLoading || !contract ? (
        <p className="py-12 text-center text-sm text-gray-500">{error ? (error as Error).message : 'Loading…'}</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-gray-500">Type</dt><dd>{CONTRACT_CATEGORY_LABELS[contract.category]}</dd></div>
            <div><dt className="text-xs text-gray-500">Signer</dt><dd>{contract.recipientName}{contract.recipientEmail && <span className="block text-xs text-gray-500">{contract.recipientEmail}</span>}</dd></div>
            <div><dt className="text-xs text-gray-500">Linked to</dt><dd>{contract.counterpartyName ?? 'Not linked'}</dd></div>
            <div><dt className="text-xs text-gray-500">Sent</dt><dd>{fmtContractDateTime(contract.sentAt)}{contract.lolaSignerName && <span className="block text-xs text-gray-500">by {contract.lolaSignerName}</span>}</dd></div>
            <div><dt className="text-xs text-gray-500">Signed by recipient</dt><dd>{fmtContractDateTime(contract.signedAt)}{contract.signerName && <span className="block text-xs text-gray-500">as {contract.signerName}</span>}</dd></div>
            <div><dt className="text-xs text-gray-500">{contract.status === 'completed' ? 'Copy available until' : 'Link expires'}</dt><dd>{fmtContractDateTime(contract.tokenExpiresAt)}</dd></div>
          </dl>

          {contract.status === 'voided' && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Voided {fmtContractDateTime(contract.voidedAt)}{contract.voidReason ? `: ${contract.voidReason}` : ''}</p>
          )}

          {link && <LinkBox url={link.url} emailed={link.emailed} email={contract.recipientEmail} />}

          {contract.status === 'draft' && !link && <SignAndSend contract={contract} onLink={setLink} />}

          <div className="flex flex-wrap gap-2">
            {contract.status === 'draft' && <Button variant="secondary" onClick={() => onEdit(contract.id)}>Edit draft</Button>}
            {awaiting && (
              <>
                <Button variant="secondary" loading={resend.isPending} onClick={() => void reissue(false)}>Get new link</Button>
                {contract.recipientEmail && <Button variant="secondary" loading={resend.isPending} onClick={() => void reissue(true)}>Resend email</Button>}
              </>
            )}
            {contract.status === 'completed' && <Button loading={pdfLoading} onClick={() => void downloadPdf()}>Download PDF</Button>}
            {contract.status !== 'voided' && <Button variant="ghost" className="text-red-600" loading={voidContract.isPending} onClick={() => void doVoid()}>Void</Button>}
          </div>

          {contract.status === 'completed' && <EmailPdf contract={contract} />}
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
            <ContractMarkdown body={contract.renderedBody} />
          </div>
          {contract.bodySha256 && <p className="break-all font-mono text-[11px] text-gray-400">SHA-256 {contract.bodySha256}</p>}

          {contract.events && contract.events.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">History</h3>
              <ol className="space-y-1 text-xs text-gray-600">
                {contract.events.map((e, i) => (
                  <li key={i}>
                    <span className="text-gray-400">{fmtContractDateTime(e.createdAt)}</span>{' '}
                    {EVENT_LABELS[e.event] ?? e.event}
                    {e.actor && e.actor !== 'recipient' && e.actor !== 'system' ? ` (${e.actor})` : ''}
                    {e.event === 'emailed' && Array.isArray(e.meta.to) ? ` to ${(e.meta.to as string[]).join(', ')}` : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
