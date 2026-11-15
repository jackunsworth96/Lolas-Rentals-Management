import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { usePayExpenses, type EnrichedExpense } from '../../api/expenses.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatCurrency } from '../../utils/currency.js';
import { errorReasons, inputCls, labelCls } from './expense-ui.js';

interface Props {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  storeId: string;
  expenses: EnrichedExpense[];
  paymentMethods: Array<{ id: string; name: string }>;
  accountName: (id: string | null) => string;
}

const isCard = (id: string) => ['card', 'creditcard', 'debitcard'].includes(id.toLowerCase().replace(/[\s_-]/g, ''));

export function PayUnpaidModal({ open, onClose, onPaid, storeId, expenses, paymentMethods, accountName }: Props) {
  const payMut = usePayExpenses();
  const routing = usePaymentRouting();
  const [methodId, setMethodId] = useState('');
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const paysFrom = methodId ? routing.resolveReceivedIntoForStore(storeId, methodId) : null;

  function pay() {
    payMut.mutate(
      { expenseIds: expenses.map((e) => e.id), paymentMethodId: methodId, storeId },
      {
        onSuccess: () => {
          setMethodId('');
          onPaid();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pay ${expenses.length} expense${expenses.length === 1 ? '' : 's'}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={payMut.isPending}>Cancel</Button>
          <Button onClick={pay} loading={payMut.isPending} disabled={!methodId || !paysFrom}>
            Pay {formatCurrency(total)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 text-sm">
          {expenses.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 px-3 py-2">
              <span className="truncate text-gray-700">{e.category} · {e.description}</span>
              <span className="tabular-nums text-gray-900">{formatCurrency(e.amount)}</span>
            </li>
          ))}
        </ul>
        <div>
          <label htmlFor="pay-method" className={labelCls}>Paid with</label>
          <select id="pay-method" value={methodId} onChange={(e) => setMethodId(e.target.value)} className={inputCls}>
            <option value="">Choose payment method</option>
            {paymentMethods.filter((m) => !isCard(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {methodId && (
            <p className={`mt-1 text-xs ${paysFrom ? 'text-gray-500' : 'text-red-600'}`}>
              {paysFrom ? `Comes out of ${accountName(paysFrom)}, dated today` : 'No account is set up for this payment method.'}
            </p>
          )}
        </div>
        {payMut.error && (
          <ul role="alert" className="list-inside list-disc rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorReasons(payMut.error).map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </div>
    </Modal>
  );
}
