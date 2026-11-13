import { useState } from 'react';

const fieldClass =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

interface TipFieldProps {
  amount: number | '';
  onAmountChange: (value: number | '') => void;
  accountId?: string;
  onAccountChange?: (value: string) => void;
  accountOptions?: Array<{ id: string; name: string }>;
}

/** Tip / spare change left by the customer. Goes to the staff tips pool, split equally at month end. */
export function TipField({ amount, onAmountChange, accountId, onAccountChange, accountOptions }: TipFieldProps) {
  const [open, setOpen] = useState(amount !== '' && Number(amount) > 0);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-blue-600 hover:underline">
        + Record a tip / spare change
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="mb-2">
        <span className="text-sm font-medium text-gray-900">Tip / spare change</span>
        <span className="block text-xs text-gray-500">
          Added to the staff tips pool and shared equally on the end-of-month payslip.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-gray-600">Amount</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={amount}
            onChange={(e) => onAmountChange(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="0"
            className={fieldClass}
          />
        </label>
        {accountOptions && onAccountChange && (
          <label className="block">
            <span className="text-sm text-gray-600">Received into</span>
            <select value={accountId ?? ''} onChange={(e) => onAccountChange(e.target.value)} className={fieldClass}>
              <option value="">Till (cash)</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
