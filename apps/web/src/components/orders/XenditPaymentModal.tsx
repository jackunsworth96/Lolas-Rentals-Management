import { useEffect, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { useCreateXenditSession } from '../../api/orders.js';
import { Modal } from '../common/Modal.js';
import { useAuthStore } from '../../stores/auth-store.js';

interface XenditPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderReference: string;
  balanceDue: number;
  paymentMethodId: string;
  surchargePercent: number;
}

type StaffXenditSession = {
  id: string;
  status: 'creating' | 'active' | 'completed' | 'reconciliation_required';
  operatorMessage: string;
  checkoutUrl: string | null;
};

export function XenditPaymentModal({
  isOpen,
  onClose,
  orderId,
  orderReference,
  balanceDue,
  paymentMethodId,
  surchargePercent,
}: XenditPaymentModalProps) {
  const [principalAmount, setPrincipalAmount] = useState(balanceDue > 0 ? balanceDue : 0);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [existingSession, setExistingSession] = useState<StaffXenditSession | null>(null);
  const [loadingExistingSession, setLoadingExistingSession] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reconciliationReason, setReconciliationReason] = useState('');
  const [copied, setCopied] = useState(false);
  const mutation = useCreateXenditSession();
  const canEditOrders = useAuthStore((s) => s.hasPermission('can_edit_orders'));
  const canReconcileOnlinePayments = useAuthStore((s) => s.hasPermission('can_reconcile_online_payments'));

  useEffect(() => {
    if (!isOpen) return;
    setPrincipalAmount(balanceDue > 0 ? balanceDue : 0);
    setCheckoutUrl(null);
    setSessionId(null);
    setExistingSession(null);
    setCopied(false);
    setActionError(null);
    setReconciliationReason('');
    mutation.reset();
    // Reset only when the modal is opened for a new balance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, balanceDue]);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    let cancelled = false;
    setLoadingExistingSession(true);
    api.get<StaffXenditSession | null>(`/payments/xendit/orders/${encodeURIComponent(orderId)}/session`)
      .then((session) => {
        if (!cancelled) {
          setExistingSession(session);
          if (session?.status === 'active') {
            setSessionId(session.id);
            setCheckoutUrl(session.checkoutUrl);
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setActionError(error instanceof Error ? error.message : 'Could not load the current Xendit checkout state.');
      })
      .finally(() => {
        if (!cancelled) setLoadingExistingSession(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, orderId]);

  const surcharge = Math.round(principalAmount * surchargePercent) / 100;
  const customerTotal = principalAmount + surcharge;

  function handleGenerate() {
    mutation.mutate(
      {
        orderId,
        principalAmountPHP: principalAmount,
        paymentMethodId,
        description: `Lola's Rentals - ${orderReference}`,
      },
      { onSuccess: (data) => {
        setCheckoutUrl(data.checkoutUrl);
        setSessionId(data.sessionId);
        setExistingSession({
          id: data.sessionId,
          status: 'active',
          checkoutUrl: data.checkoutUrl,
          operatorMessage: 'A customer can still pay through Xendit. Cancel or reconcile the checkout before changing this order.',
        });
      } },
    );
  }

  async function handleCopy() {
    if (!checkoutUrl) return;
    await navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCancelCheckout() {
    const activeSessionId = existingSession?.id ?? sessionId;
    if (!activeSessionId) return;
    setCancelling(true);
    try {
      const result = await api.post<{ status: string }>(`/payments/xendit/sessions/${encodeURIComponent(activeSessionId)}/cancel`, {});
      if (result.status === 'cancelled') {
        setCheckoutUrl(null);
        setSessionId(null);
        setExistingSession(null);
        mutation.reset();
      } else {
        setExistingSession((session) => session ? {
          ...session,
          status: result.status === 'completed'
            ? 'completed'
            : result.status === 'reconciliation_required'
              ? 'reconciliation_required'
              : session.status,
          checkoutUrl: null,
          operatorMessage: result.status === 'completed'
            ? 'The Xendit payment was completed. Refresh the order before making further changes.'
            : 'Xendit payment verification is required. Finance must resolve this before changing this order.',
        } : session);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not cancel the Xendit checkout.');
    } finally {
      setCancelling(false);
    }
  }

  async function handleReconcileTerminal() {
    const activeSessionId = existingSession?.id ?? sessionId;
    if (!activeSessionId || reconciliationReason.trim().length < 10) return;
    setCancelling(true);
    setActionError(null);
    try {
      const result = await api.post<{ status: string }>(
        `/payments/xendit/sessions/${encodeURIComponent(activeSessionId)}/reconcile-terminal`,
        { reason: reconciliationReason.trim() },
      );
      if (result.status === 'closed') {
        setCheckoutUrl(null);
        setSessionId(null);
        setExistingSession(null);
        mutation.reset();
      } else if (result.status === 'completed') {
        setExistingSession((session) => session ? {
          ...session,
          checkoutUrl: null,
          operatorMessage: 'The Xendit payment was completed. Refresh the order before making further changes.',
        } : session);
      } else {
        setExistingSession((session) => session ? {
          ...session,
          status: 'reconciliation_required',
          checkoutUrl: null,
          operatorMessage: 'Xendit payment verification is required. Finance must resolve this before changing this order.',
        } : session);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not reconcile the Xendit checkout.');
    } finally {
      setCancelling(false);
    }
  }

  async function handleReleaseCreating() {
    if (!existingSession || reconciliationReason.trim().length < 10) return;
    setCancelling(true);
    setActionError(null);
    try {
      await api.post(
        `/payments/xendit/sessions/${encodeURIComponent(existingSession.id)}/release-creating`,
        { reason: reconciliationReason.trim() },
      );
      setExistingSession(null);
      setSessionId(null);
      setCheckoutUrl(null);
      mutation.reset();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not release the unresolved Xendit checkout draft.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Request Payment via Xendit" size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Amount to collect (PHP)</label>
          <input
            type="number"
            step="0.01"
            min="1"
            max={balanceDue}
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(Number(event.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {surchargePercent > 0 && principalAmount > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Customer pays ₱{customerTotal.toFixed(2)}, including ₱{surcharge.toFixed(2)} fee ({surchargePercent}%).
            </p>
          )}
        </div>

        {loadingExistingSession && (
          <p className="text-sm text-gray-500">Loading current Xendit checkout state...</p>
        )}

        {existingSession && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">
              {existingSession.status === 'creating'
                ? 'Online payment checkout creation unresolved'
                : existingSession.status === 'reconciliation_required'
                  ? 'Online payment verification required'
                  : existingSession.status === 'completed'
                    ? 'Online payment completed'
                  : 'Online payment checkout in progress'}
            </p>
            <p className="text-xs">{existingSession.operatorMessage}</p>
            {existingSession.status === 'active' && checkoutUrl && (
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={checkoutUrl} className="block min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700" />
                <button type="button" onClick={() => void handleCopy()} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Link2 className="h-4 w-4" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
            {existingSession.status === 'active' && canEditOrders && (
              <button
                type="button"
                onClick={() => void handleCancelCheckout()}
                disabled={cancelling}
                className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling checkout...' : 'Cancel checkout before changing this order'}
              </button>
            )}
            {existingSession.status === 'active' && canReconcileOnlinePayments && (
              <div className="border-t border-amber-200 pt-3">
                <label className="block text-xs font-medium text-amber-900" htmlFor="xendit-terminal-reconciliation">
                  Provider-terminal reconciliation reason
                </label>
                <textarea
                  id="xendit-terminal-reconciliation"
                  value={reconciliationReason}
                  onChange={(event) => setReconciliationReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  className="mt-1 block min-h-20 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
                  placeholder="Verify the terminal Xendit status in the dashboard first."
                />
                <button
                  type="button"
                  onClick={() => void handleReconcileTerminal()}
                  disabled={cancelling || reconciliationReason.trim().length < 10}
                  className="mt-2 rounded-lg border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Verify provider terminal state
                </button>
              </div>
            )}
            {existingSession.status === 'creating' && canReconcileOnlinePayments && (
              <div className="border-t border-amber-200 pt-3">
                <label className="block text-xs font-medium text-amber-900" htmlFor="xendit-creating-reconciliation">
                  Creating-checkout release reason
                </label>
                <textarea
                  id="xendit-creating-reconciliation"
                  value={reconciliationReason}
                  onChange={(event) => setReconciliationReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  className="mt-1 block min-h-20 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
                  placeholder="Verify in the Xendit Dashboard that no payment session was created."
                />
                <button
                  type="button"
                  onClick={() => void handleReleaseCreating()}
                  disabled={cancelling || reconciliationReason.trim().length < 10}
                  className="mt-2 rounded-lg border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Release unresolved checkout draft
                </button>
              </div>
            )}
          </div>
        )}

        {!existingSession && !checkoutUrl && (
          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={mutation.isPending || principalAmount <= 0 || principalAmount > balanceDue}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mutation.isPending ? 'Generating...' : 'Generate Payment Link'}
            </button>
            {mutation.error && <p className="mt-2 text-sm text-red-600">{(mutation.error as Error).message}</p>}
          </div>
        )}

        {checkoutUrl && !existingSession && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Payment Link</label>
            <div className="flex items-center gap-2">
              <input type="text" readOnly value={checkoutUrl} className="block min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
              <button type="button" onClick={() => void handleCopy()} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Link2 className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500">Send this hosted checkout link to the customer. Payment is recorded only after the verified Xendit webhook arrives.</p>
            <button
              type="button"
              onClick={() => void handleCancelCheckout()}
              disabled={cancelling}
              className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling checkout...' : 'Cancel checkout before changing this order'}
            </button>
            {canReconcileOnlinePayments && (
              <div className="border-t border-amber-200 pt-3">
                <label className="block text-xs font-medium text-amber-900" htmlFor="xendit-terminal-reconciliation">
                  Provider-terminal reconciliation reason
                </label>
                <textarea
                  id="xendit-terminal-reconciliation"
                  value={reconciliationReason}
                  onChange={(event) => setReconciliationReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  className="mt-1 block min-h-20 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
                  placeholder="Verify the terminal Xendit status in the dashboard first."
                />
                <button
                  type="button"
                  onClick={() => void handleReconcileTerminal()}
                  disabled={cancelling || reconciliationReason.trim().length < 10}
                  className="mt-2 rounded-lg border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Verify provider terminal state
                </button>
              </div>
            )}
          </div>
        )}
        {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      </div>
    </Modal>
  );
}
