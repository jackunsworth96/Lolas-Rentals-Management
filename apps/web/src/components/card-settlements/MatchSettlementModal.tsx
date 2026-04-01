import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useMatchSettlement } from '../../api/card-settlements.js';
import { useChartOfAccounts } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatCurrency } from '../../utils/currency.js';

interface Settlement {
  id: string;
  orderId: string | null;
  name: string | null;
  amount: number;
}

interface MatchSettlementModalProps {
  open: boolean;
  onClose: () => void;
  selected: Settlement[];
}

export function MatchSettlementModal({ open, onClose, selected }: MatchSettlementModalProps) {
  const matchMutation = useMatchSettlement();
  const { data: accounts = [] } = useChartOfAccounts();
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const routing = usePaymentRouting();

  const grossTotal = selected.reduce((s, r) => s + r.amount, 0);
  const grossRounded = Math.round(grossTotal * 100) / 100;

  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankReference, setBankReference] = useState('');
  const [netAmount, setNetAmount] = useState(String(grossRounded));
  const [bankAccountId, setBankAccountId] = useState('');
  const [cardFeeAccountId, setCardFeeAccountId] = useState('');
  const [cardReceivableAccountId, setCardReceivableAccountId] = useState('');

  const accList = accounts as Array<{ id: string; name: string; type?: string; accountType?: string }>;
  const accType = (a: (typeof accList)[0]) => (a.type ?? a.accountType ?? '').toLowerCase();

  const routedBankAcct = routing.getCardSettlement(storeId);
  const routedCardFeeAcct = routing.getCardFeeAccount(storeId);
  const routedCardReceivable = routing.getCardReceivable(storeId);

  useEffect(() => {
    if (routedBankAcct && !bankAccountId) setBankAccountId(routedBankAcct);
  }, [routedBankAcct, bankAccountId]);
  useEffect(() => {
    if (routedCardFeeAcct && !cardFeeAccountId) setCardFeeAccountId(routedCardFeeAcct);
  }, [routedCardFeeAcct, cardFeeAccountId]);
  useEffect(() => {
    if (routedCardReceivable && !cardReceivableAccountId) setCardReceivableAccountId(routedCardReceivable);
  }, [routedCardReceivable, cardReceivableAccountId]);

  const netNum = Number(netAmount) || 0;
  const feeComputedDisplay = Math.max(
    0,
    Math.round((grossRounded - netNum) * 100) / 100,
  );
  const sumCheck = Math.round((netNum + feeComputedDisplay) * 100) / 100;
  const isBalanced = netNum >= 0 && netNum <= grossRounded;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) return;
    const feeNum = Math.round((grossRounded - netNum) * 100) / 100;
    matchMutation.mutate(
      {
        settlementIds: selected.map((s) => s.id),
        settlementDate,
        bankReference: bankReference.trim(),
        netAmount: netNum,
        feeAmount: feeNum,
        bankAccountId,
        cardFeeAccountId,
        cardReceivableAccountId,
      },
      { onSuccess: () => onClose() },
    );
  };

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Match settlement" size="xl">
      <div className="mb-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          {selected.length} settlement{selected.length > 1 ? 's' : ''} selected
        </p>
        <p className="text-lg font-bold text-gray-900">
          Gross total: {formatCurrency(grossRounded)}
        </p>
        <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-500">
          {selected.map((s) => (
            <li key={s.id}>
              {s.orderId ?? '—'} · {s.name ?? 'Unknown'} · {formatCurrency(s.amount)}
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Settlement date</span>
            <input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Bank reference</span>
            <input type="text" value={bankReference} onChange={(e) => setBankReference(e.target.value)} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="block">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Net amount received</span>
              <input type="number" step="0.01" value={netAmount} onChange={(e) => setNetAmount(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            {Number(netAmount) > grossRounded && (
              <p className="mt-1 text-xs text-red-600">
                Net amount cannot exceed gross total of {formatCurrency(grossRounded)}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Fee / charge deducted (auto-computed)
            </label>
            <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {formatCurrency(
                Math.max(0, Math.round((grossRounded - (Number(netAmount) || 0)) * 100) / 100),
              )}
            </div>
          </div>
        </div>

        <div className={`rounded-lg px-3 py-2 text-sm font-medium ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          Net ({formatCurrency(netNum)}) + Fee ({formatCurrency(feeComputedDisplay)}) = {formatCurrency(sumCheck)}
          {isBalanced ? ' ✓ Balanced' : ` ✗ Net must be between ${formatCurrency(0)} and ${formatCurrency(grossRounded)}`}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {!routedBankAcct ? (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Bank account (debit net)</span>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select</option>
              {accList.filter((a) => accType(a) === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
          </label>
          ) : null}
          {!routedCardFeeAcct ? (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Card fee expense (debit fee)</span>
            <select value={cardFeeAccountId} onChange={(e) => setCardFeeAccountId(e.target.value)} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select</option>
              {accList.filter((a) => accType(a) === 'expense').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-amber-600">No store card fee account configured — select manually</p>
          </label>
          ) : null}
          {!routedCardReceivable ? (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Card receivable (credit gross)</span>
            <select value={cardReceivableAccountId} onChange={(e) => setCardReceivableAccountId(e.target.value)} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select</option>
              {accList.filter((a) => accType(a) === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
          </label>
          ) : null}
        </div>

        {matchMutation.error && <p className="text-sm text-red-600">{(matchMutation.error as Error).message}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={!isBalanced || matchMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {matchMutation.isPending ? 'Matching...' : 'Confirm match'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
