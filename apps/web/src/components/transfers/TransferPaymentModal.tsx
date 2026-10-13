import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../common/Modal.js';
import { useRecordTransferPayment, useTransferPaymentLink, generateTransferPaymentLink,
  emailTransferPaymentLink, cancelTransferPaymentLink, moneyAmount, type TransferRow } from '../../api/transfers.js';
import { usePaymentMethods, useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { Badge } from '../common/Badge.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';

interface Props {
  open: boolean;
  onClose: () => void;
  transfer: TransferRow;
  storeId: string;
}

export function TransferPaymentModal({ open, onClose, transfer, storeId }: Props) {
  const mutation = useRecordTransferPayment();
  const queryClient = useQueryClient();
  const link = useTransferPaymentLink(transfer.id, open);
  const [linkBusy, setLinkBusy] = useState(false);
  const { data: paymentMethods = [] } = usePaymentMethods();
  const { data: accounts = [] } = useChartOfAccounts();

  const pmList = (paymentMethods as Array<{ id: string; name: string; gatewayProvider?: string | null; isActive?: boolean }>)
    .filter((method) => method.isActive !== false && !method.gatewayProvider && !method.name.toLowerCase().includes('card'));
  const accList = accounts as Array<{ id: string; name: string; accountType?: string; storeId?: string | null }>;

  const storeAccounts = useMemo(
    () => accList.filter((a) => !a.storeId || a.storeId === storeId || a.storeId === 'company'),
    [accList, storeId],
  );
  const assetAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'asset');
  const transferIncomeAccounts = accList.filter(
    (a) => a.id === `INCOME-TRANSFER-${storeId}` || a.id === `MISC-INCOME-${storeId}`,
  );

  const totalPrice = moneyAmount(transfer.totalPrice);

  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [amount, setAmount] = useState<number | ''>(totalPrice);
  const [cashAccountId, setCashAccountId] = useState('');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [error, setError] = useState('');

  async function createLink() {
    setLinkBusy(true); setError('');
    try {
      await generateTransferPaymentLink(transfer.id);
      await queryClient.invalidateQueries({ queryKey: ['transfer-payment-link', transfer.id] });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not generate payment link'); }
    finally { setLinkBusy(false); }
  }

  async function sendLink(resend: boolean) {
    const session = link.data?.session;
    if (!session) return;
    setLinkBusy(true); setError('');
    try {
      await emailTransferPaymentLink(transfer.id, session.sessionId, resend);
      await queryClient.invalidateQueries({ queryKey: ['transfer-payment-link', transfer.id] });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not email payment link'); }
    finally { setLinkBusy(false); }
  }

  async function cancelLink() {
    const session = link.data?.session;
    if (!session || !window.confirm('Cancel this hosted payment link?')) return;
    setLinkBusy(true); setError('');
    try {
      await cancelTransferPaymentLink(transfer.id, session.sessionId);
      await queryClient.invalidateQueries({ queryKey: ['transfer-payment-link', transfer.id] });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel checkout'); }
    finally { setLinkBusy(false); }
  }

  useEffect(() => {
    if (open) {
      setPaymentMethodId('');
      setAmount(totalPrice);
      setCashAccountId('');
      setIncomeAccountId('');
      setError('');
    }
  }, [open, totalPrice]);

  const routing = usePaymentRouting();
  const routedCashAcct = routing.getReceivedInto(storeId, paymentMethodId);

  useEffect(() => {
    if (routedCashAcct && !cashAccountId) setCashAccountId(routedCashAcct);
  }, [routedCashAcct, cashAccountId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!paymentMethodId) { setError('Select a payment method'); return; }
    if (!amount || amount <= 0) { setError('Amount must be positive'); return; }

    if (!cashAccountId || !incomeAccountId) {
      setError('Select both debit and credit accounts');
      return;
    }

    try {
      await mutation.mutateAsync({
        transferId: transfer.id,
        amount: Number(amount),
        paymentMethod: paymentMethodId,
        date: new Date().toISOString().slice(0, 10),
        cashAccountId,
        transferIncomeAccountId: incomeAccountId,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    }
  }

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Record Transfer Payment" size="lg">
      <div className="mb-4 rounded-lg bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">{transfer.customerName}</p>
            <p className="text-sm text-gray-500">{transfer.route} · {transfer.serviceDate}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalPrice)}</p>
            <Badge color={transfer.paymentStatus === 'Paid' ? 'green' : transfer.paymentStatus === 'Partially Paid' ? 'yellow' : 'red'}>
              {transfer.paymentStatus}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mb-5 border-b pb-5 text-sm">
        <h3 className="font-semibold">Card payment link</h3>
        {link.data?.session && <p className="mt-1">{link.data.session.status === 'reconciliation_required' ? 'Payment verification required. Contact finance.'
          : link.data.session.status === 'completed' ? 'Paid online'
          : link.data.session.status === 'creating' ? 'Checkout is being prepared; contact finance before releasing it.'
          : link.data.session.status === 'active' ? 'Payment pending' : `Previous link ${link.data.session.status}`}</p>}
        {link.data?.amountPHP != null && <p className="mt-1">Rental {formatCurrency(link.data.principalPHP)} + card surcharge {formatCurrency(link.data.surchargePHP ?? 0)} = {formatCurrency(link.data.amountPHP)}</p>}
        {link.data?.session?.checkoutUrl ? <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="text-blue-700 underline" onClick={() => void navigator.clipboard.writeText(link.data!.session!.checkoutUrl!)}>Copy link</button>
          <button type="button" disabled={linkBusy || !transfer.customerEmail} className="text-blue-700 underline disabled:opacity-40" onClick={() => void sendLink(Boolean(link.data?.session?.emailAcceptedAt))}>
            {link.data.session.emailAcceptedAt ? 'Resend email' : 'Email customer'}
          </button>
          <button type="button" disabled={linkBusy} className="text-red-700 underline disabled:opacity-40" onClick={() => void cancelLink()}>Cancel link</button>
          {link.data.session.expiresAt && <span>Expires {new Date(link.data.session.expiresAt).toLocaleString()}</span>}
          {link.data.session.emailAcceptedAt && <span>Email accepted for sending</span>}
        </div> : !['creating', 'completed', 'reconciliation_required'].includes(link.data?.session?.status ?? '')
          && link.data?.amountPHP != null && transfer.paymentStatus !== 'Paid' && <button type="button" disabled={linkBusy} onClick={() => void createLink()} className="mt-2 text-blue-700 underline disabled:opacity-40">Generate payment link</button>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {['creating', 'active', 'reconciliation_required'].includes(link.data?.session?.status ?? '') &&
          <p className="text-sm text-amber-700">Manual collection is blocked while checkout is pending verification or requires finance review.</p>}
        <fieldset disabled={['creating', 'active', 'reconciliation_required', 'completed'].includes(link.data?.session?.status ?? '')} className="space-y-4 disabled:opacity-50">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Payment Method *</span>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select...</option>
              {pmList.map((pm) => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Amount *</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {paymentMethodId && (
          <div className="grid grid-cols-2 gap-3">
            {!routedCashAcct && (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Debit Account (Cash/GCash) *</span>
              <select
                value={cashAccountId}
                onChange={(e) => setCashAccountId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
            </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Credit Account (Income) *</span>
              <select
                value={incomeAccountId}
                onChange={(e) => setIncomeAccountId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {transferIncomeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
        </fieldset>
      </form>
    </Modal>
  );
}
