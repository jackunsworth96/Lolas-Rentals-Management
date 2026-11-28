import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink } from 'lucide-react';
import { api } from '../../api/client.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDateTime } from '../../utils/date.js';
import { Button } from '../common/Button.js';

const statusLabels = {
  creating: 'Creating checkout',
  awaiting_authorization: 'Awaiting authorization',
  authorized: 'Funds reserved',
  capture_pending: 'Capture pending',
  release_pending: 'Release pending',
  captured: 'Deposit captured',
  released: 'Hold released',
  expired: 'Hold expired',
  failed: 'Checkout closed',
  reconciliation_required: 'Finance review required',
};

type HoldStatus = {
  enabled: boolean;
  hold: null | {
    id: string;
    reference: string;
    status: keyof typeof statusLabels;
    amountPHP: number;
    capturedPHP: number | null;
    checkoutUrl: string | null;
    authorizationExpiresAt: string | null;
    coverage: 'verified' | 'unverified' | 'insufficient';
    blocking: boolean;
    canCapture: boolean;
    canRelease: boolean;
    canRefresh: boolean;
    canRecover: boolean;
    canContinueRelease: boolean;
  };
};

type Action = { action: 'create' | 'release' | 'refresh' | 'continue_release' }
  | { action: 'capture'; amountPHP: number; reason: string }
  | { action: 'recover_session'; sessionId: string }
  | { action: 'confirm_no_session'; supportCaseId: string; reason: string; confirmed: true };

export function useDepositCardHold(orderId: string, enabled: boolean) {
  const client = useQueryClient();
  const key = ['deposit-card-hold', orderId] as const;
  const url = `/payments/xendit/orders/${encodeURIComponent(orderId)}/deposit-holds`;
  const status = useQuery({
    queryKey: key,
    enabled,
    queryFn: () => api.get<HoldStatus>(url),
    refetchInterval: (query) => query.state.data?.hold?.blocking ? 5000 : false,
    retry: false,
  });
  const holdId = status.data?.hold?.id;
  const action = useMutation({
    mutationFn: (body: Action) => body.action === 'create'
      ? api.post<HoldStatus>(url, {})
      : api.post<HoldStatus>(`${url}/${holdId}/actions`, body),
    onSuccess: (data) => client.setQueryData(key, data),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const captured = status.data?.hold?.status === 'captured';
  useEffect(() => {
    if (captured) {
      void client.invalidateQueries({ queryKey: ['orders', orderId] });
      void client.invalidateQueries({ queryKey: ['orders', 'enriched'] });
    }
  }, [captured, holdId, client, orderId]);
  return { ...status, action, blocked: !!status.data?.hold?.blocking || action.isPending };
}

export function DepositCardHold({ state, due }: { state: ReturnType<typeof useDepositCardHold>; due: number }) {
  const hold = state.data?.hold;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  useEffect(() => {
    setAmount(hold?.amountPHP.toFixed(2) ?? '');
    setReason('');
    setCopied(false);
    setCopyError(false);
    setShowCapture(false);
  }, [hold?.id, hold?.amountPHP]);
  if (!hold && (!state.data?.enabled || due <= 0)) return null;
  const action = state.action;
  const captureAmount = Number(amount);

  return (
    <section className="space-y-3 border-t border-gray-200 pt-5" aria-label="Card hold">
      <h3 className="font-medium text-gray-900">Card hold</h3>
      {hold && <div className="space-y-1 text-sm" aria-live="polite">
        <p>{statusLabels[hold.status]}: {formatCurrency(hold.capturedPHP ?? hold.amountPHP)}</p>
        {hold.status === 'authorized' && <>
          <p className="font-medium">Reserved funds only. No deposit has been collected by this hold.</p>
          {hold.authorizationExpiresAt && <p>Authorization expires {formatDateTime(hold.authorizationExpiresAt)}</p>}
          <p>{hold.coverage === 'verified' ? 'Coverage verified through the rental return.'
            : hold.coverage === 'insufficient' ? 'This hold does not cover the rental return.'
            : 'Xendit has not provided a verified authorization expiry.'}</p>
          {hold.coverage !== 'verified' && <p className="text-amber-800">
            For a real deposit, release and verify the hold before taking a charged or manual deposit.
          </p>}
        </>}
        {(hold.status === 'reconciliation_required' || hold.canRecover) && <div className="text-amber-800">
          <p>Contact finance. Do not create another hold or collect another deposit.</p>
          <p className="break-all">Xendit reference: {hold.reference}</p>
        </div>}
      </div>}
      {hold?.checkoutUrl && <div className="flex items-center gap-2">
        <a href={hold.checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-teal-800 underline">
          Open authorization link <ExternalLink className="h-4 w-4" />
        </a>
        <button type="button" className="rounded border border-gray-300 p-2" title="Copy authorization link"
          aria-label="Copy authorization link" onClick={async () => {
            try {
              await navigator.clipboard.writeText(hold.checkoutUrl!);
              setCopied(true);
              setCopyError(false);
            } catch { setCopyError(true); }
          }}><Copy className="h-4 w-4" /></button>
        {copied && <span role="status" className="text-sm text-green-800">Link copied</span>}
        {copyError && <span role="alert" className="text-sm text-red-700">Copy failed. Open the link to copy it.</span>}
      </div>}
      <div className="flex flex-wrap gap-2">
        {state.data?.enabled && due > 0 && !hold?.blocking && <Button type="button"
          disabled={action.isPending} onClick={() => action.mutate({ action: 'create' })}>
          Create test card hold
        </Button>}
        {hold?.canRelease && <Button type="button" variant="secondary"
          disabled={action.isPending} onClick={() => action.mutate({ action: 'release' })}>Release hold</Button>}
        {hold?.canContinueRelease && <Button type="button" variant="secondary"
          disabled={action.isPending} onClick={() => action.mutate({ action: 'continue_release' })}>Finish release</Button>}
        {hold?.canRefresh && <Button type="button" variant="secondary"
          disabled={action.isPending} onClick={() => action.mutate({ action: 'refresh' })}>Verify with Xendit</Button>}
        {hold?.canCapture && !showCapture && <Button type="button" variant="secondary"
          disabled={action.isPending} onClick={() => setShowCapture(true)}>Capture funds</Button>}
      </div>
      {hold?.canRecover && <MissingCheckoutRecovery key={hold.id} action={action} />}
      {hold?.canCapture && showCapture && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault();
        action.mutate({ action: 'capture', amountPHP: captureAmount, reason });
      }}>
        <label className="text-sm">Amount to charge
          <input type="number" value={amount} onChange={(event) => setAmount(event.target.value)}
            min="0.01" max={hold.amountPHP} step="0.01" required className="mt-1 block w-32 rounded border p-2" />
        </label>
        <label className="text-sm">Capture reason
          <input value={reason} onChange={(event) => setReason(event.target.value)}
            maxLength={500} required className="mt-1 block max-w-full rounded border p-2" />
        </label>
        <Button type="submit" disabled={action.isPending || captureAmount <= 0 || captureAmount > hold.amountPHP || !reason.trim()}>
          Confirm capture
        </Button>
      </form>}
      {action.error && <p role="alert" className="text-sm text-red-700">{action.error.message}</p>}
    </section>
  );
}

function MissingCheckoutRecovery({ action }: { action: ReturnType<typeof useDepositCardHold>['action'] }) {
  const [mode, setMode] = useState<'found' | 'missing' | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [supportCaseId, setSupportCaseId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  if (mode === null) {
    return <Button type="button" variant="secondary" onClick={() => setMode('found')}>Resolve missing checkout</Button>;
  }
  return <form className="space-y-3 text-sm" onSubmit={(event) => {
    event.preventDefault();
    if (mode === 'found') action.mutate({ action: 'recover_session', sessionId: sessionId.trim() });
    else if (confirmed) action.mutate({ action: 'confirm_no_session', supportCaseId: supportCaseId.trim(), reason: reason.trim(), confirmed: true });
  }}>
    <fieldset className="space-y-2" disabled={action.isPending}>
      <legend className="font-medium">Xendit checkout outcome</legend>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="radio" name="checkout-outcome" checked={mode === 'found'} onChange={() => setMode('found')} /> Session found</label>
        <label className="flex items-center gap-2"><input type="radio" name="checkout-outcome" checked={mode === 'missing'} onChange={() => setMode('missing')} /> Xendit confirmed no session</label>
      </div>
      {mode === 'found' ? <label className="block">Xendit session ID
        <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} required maxLength={128}
          className="mt-1 block w-full max-w-xs rounded border p-2" />
      </label> : <>
        <label className="block">Xendit support case ID
          <input value={supportCaseId} onChange={(event) => setSupportCaseId(event.target.value)} required maxLength={100}
            className="mt-1 block w-full max-w-xs rounded border p-2" />
        </label>
        <label className="block">Recovery reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={10} maxLength={500}
            className="mt-1 block w-full max-w-md rounded border p-2" />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />
          I reviewed written confirmation from Xendit that it never created a session for this hold reference.
        </label>
      </>}
    </fieldset>
    <Button type="submit" disabled={action.isPending || (mode === 'found' ? !/^ps-[A-Za-z0-9]{1,125}$/.test(sessionId.trim())
      : !confirmed || supportCaseId.trim().length === 0 || reason.trim().length < 10)}>
      {mode === 'found' ? 'Verify and attach session' : 'Close missing checkout'}
    </Button>
  </form>;
}
