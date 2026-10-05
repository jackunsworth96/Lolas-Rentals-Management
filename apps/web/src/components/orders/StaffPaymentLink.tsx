import { useEffect, useState } from 'react';
import { Copy, CreditCard, ExternalLink } from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { formatCurrency } from '../../utils/currency.js';

type Target = { kind: 'raw'; id: string } | { kind: 'rental' | 'addon'; id: string };
type Preview = {
  principalPHP: number;
  surchargePHP: number;
  amountPHP: number;
  originalQuotePHP?: number;
  requiresAcknowledgement?: boolean;
};
type Session = { sessionId: string; checkoutUrl: string; expiresAt: string; amountPHP: number };
type SessionStatus = 'creating' | 'active' | 'completed' | 'expired' | 'cancelled' | 'failed' | 'reconciliation_required';

function paths(target: Target): { preview: string; create: string } {
  return target.kind === 'raw'
    ? {
        preview: `/payments/xendit/raw-orders/${encodeURIComponent(target.id)}/preview`,
        create: '/payments/xendit/raw-orders/sessions',
      }
    : {
        preview: `/payments/xendit/orders/${encodeURIComponent(target.id)}/${target.kind}-preview`,
        create: `/payments/xendit/orders/${encodeURIComponent(target.id)}/${target.kind}-session`,
      };
}

export function StaffPaymentLink({ target }: { target: Target }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    setPreview(null);
    setSession(null);
    setSessionStatus(null);
    setError(null);
    setAcknowledged(false);
    void api.get<Preview>(paths(target).preview)
      .then((value) => { if (mounted) setPreview(value); })
      .catch((cause) => { if (mounted) setError(cause instanceof ApiError ? cause.message : 'Could not load the card payment total.'); });
    return () => { mounted = false; };
  }, [target.kind, target.id]);

  useEffect(() => {
    if (!session?.sessionId || (sessionStatus && !['creating', 'active'].includes(sessionStatus))) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const state = await api.get<{ status: SessionStatus }>(`/payments/xendit/sessions/${encodeURIComponent(session.sessionId)}/status`);
        if (mounted) setSessionStatus(state.status);
      } catch {
        if (mounted) setError('Payment status could not be verified. Refresh before taking another payment.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [session?.sessionId, sessionStatus]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const body = target.kind === 'raw'
        ? { rawOrderId: target.id, acknowledgePriceChange: acknowledged }
        : {};
      const created = await api.post<Session>(paths(target).create, body);
      setSession(created);
      setSessionStatus('active');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create a card payment link.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.checkoutUrl);
      setCopied(true);
    } catch {
      setError('Could not copy the link. Open it and copy the URL from your browser.');
    }
  }

  return (
    <section className="border-t border-gray-200 pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <CreditCard className="h-4 w-4" /> Card Payment
      </h3>
      {preview && (
        <div className="mt-3 space-y-1 text-sm text-gray-700">
          <p>Rental/add-on balance: {formatCurrency(preview.principalPHP)}</p>
          <p>Card surcharge: {formatCurrency(preview.surchargePHP)}</p>
          <p className="font-semibold">Customer pays: {formatCurrency(preview.amountPHP)}</p>
          {preview.requiresAcknowledgement && (
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>I confirm the revised total differs from the original {formatCurrency(preview.originalQuotePHP ?? 0)} quote.</span>
            </label>
          )}
        </div>
      )}
      {session && ['active', 'creating'].includes(sessionStatus ?? 'active') ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-600">Payment pending until the Xendit webhook confirms it.</p>
          <div className="flex items-center gap-2">
            <a className="min-w-0 flex-1 truncate text-sm text-teal-700 underline" href={session.checkoutUrl} target="_blank" rel="noreferrer">
              {session.checkoutUrl}<ExternalLink className="ml-1 inline h-3 w-3" />
            </a>
            <button type="button" onClick={() => void copy()} title="Copy payment link" aria-label="Copy payment link"
              className="rounded border border-gray-300 p-2 text-gray-700"><Copy className="h-4 w-4" /></button>
          </div>
          {copied && <p className="text-xs text-green-700">Link copied</p>}
        </div>
      ) : sessionStatus === 'completed' ? (
        <p className="mt-3 text-sm font-medium text-green-700">Paid online. Payment confirmed.</p>
      ) : sessionStatus === 'reconciliation_required' ? (
        <p className="mt-3 text-sm text-amber-800">Payment verification required. Contact finance before taking another payment.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {sessionStatus && <p className="text-sm text-gray-700">The previous payment link is {sessionStatus}. The rental balance remains due.</p>}
        <button type="button" onClick={() => void generate()}
          disabled={!preview || busy || (preview.requiresAcknowledgement && !acknowledged)}
          className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Creating link...' : 'Generate card payment link'}
        </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
