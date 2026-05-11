import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { useGrantCashAdvance, type GrantCashAdvancePayload } from '../../api/hr.js';
import { useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the employee. When provided, the employee selector is hidden. */
  employeeId?: string;
  employeeName?: string;
  storeId: string;
  /** All employees for the store — used in the selector when employeeId is not pre-filled. */
  employees: Array<{ id: string; fullName: string }>;
}

type PaydayType = 'mid_month' | 'end_of_month';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500';
const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

const PAYDAY_LABELS: Record<PaydayType, string> = {
  mid_month: '15th (mid-month)',
  end_of_month: 'Last day (end of month)',
};

function PaydayToggle({
  value,
  onChange,
}: {
  value: PaydayType;
  onChange: (v: PaydayType) => void;
}) {
  const btn = (v: PaydayType) =>
    `flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
      value === v
        ? 'border-blue-500 bg-blue-50 text-blue-700'
        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
    }`;
  return (
    <div className="flex gap-2">
      <button type="button" className={btn('mid_month')} onClick={() => onChange('mid_month')}>
        15th
      </button>
      <button type="button" className={btn('end_of_month')} onClick={() => onChange('end_of_month')}>
        Last day
      </button>
    </div>
  );
}

/** Build the list of payday labels for a split preview. */
function buildSplitPreview(periods: number, startPayday: PaydayType, amountEach: number): string[] {
  const paydays: PaydayType[] = ['mid_month', 'end_of_month'];
  const startIdx = startPayday === 'mid_month' ? 0 : 1;
  return Array.from({ length: periods }, (_, i) => {
    const payday = paydays[(startIdx + i) % 2];
    return `${PAYDAY_LABELS[payday]}: ${formatCurrency(amountEach)}`;
  });
}

export function GrantCashAdvanceModal({
  open,
  onClose,
  employeeId: initialEmployeeId,
  employeeName: initialEmployeeName,
  storeId,
  employees,
}: Props) {
  const grantMut = useGrantCashAdvance();
  const { data: accounts = [] } = useChartOfAccounts();

  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [repaymentType, setRepaymentType] = useState<'lump-sum' | 'installments'>('lump-sum');
  const [deductOn, setDeductOn] = useState<PaydayType>('end_of_month');
  const [periods, setPeriods] = useState('2');
  const [startPayday, setStartPayday] = useState<PaydayType>('end_of_month');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [description, setDescription] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setEmployeeId(initialEmployeeId ?? '');
      setAmount('');
      setDate(todayStr());
      setRepaymentType('lump-sum');
      setDeductOn('end_of_month');
      setPeriods('2');
      setStartPayday('end_of_month');
      setExpenseAccountId('');
      setCashAccountId('');
      setDescription('');
      grantMut.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cashAccounts = useMemo(
    () =>
      (accounts as Array<{ id: string; name: string; account_type?: string; accountType?: string }>).filter(
        (a) => (a.account_type ?? a.accountType ?? '').toLowerCase() === 'asset',
      ),
    [accounts],
  );

  const advanceAccounts = useMemo(
    () =>
      (accounts as Array<{ id: string; name: string; account_type?: string; accountType?: string }>).filter(
        (a) => (a.account_type ?? a.accountType ?? '').toLowerCase() === 'asset',
      ),
    [accounts],
  );

  const parsedAmount = parseFloat(amount) || 0;
  const parsedPeriods = parseInt(periods, 10) || 2;
  const perPeriodAmount =
    repaymentType === 'installments' && parsedAmount > 0 && parsedPeriods >= 2
      ? parsedAmount / parsedPeriods
      : null;

  const splitPreview = useMemo(() => {
    if (repaymentType !== 'installments' || !perPeriodAmount) return [];
    return buildSplitPreview(parsedPeriods, startPayday, perPeriodAmount);
  }, [repaymentType, parsedPeriods, startPayday, perPeriodAmount]);

  const isValid =
    !!employeeId &&
    parsedAmount > 0 &&
    !!expenseAccountId &&
    !!cashAccountId &&
    (repaymentType === 'lump-sum' || parsedPeriods >= 2);

  async function handleSubmit() {
    if (!isValid) return;

    const payload: GrantCashAdvancePayload = {
      storeId,
      employeeId,
      amount: parsedAmount,
      date,
      repaymentType,
      expenseAccountId,
      cashAccountId,
      description: description.trim() || undefined,
    };

    if (repaymentType === 'lump-sum') {
      payload.deductOn = deductOn;
    } else {
      payload.periods = parsedPeriods;
      payload.startPayday = startPayday;
    }

    grantMut.mutate(payload, { onSuccess: onClose });
  }

  const selectedEmployee =
    initialEmployeeId
      ? (initialEmployeeName ?? '')
      : employees.find((e) => e.id === employeeId)?.fullName ?? '';

  return (
    <Modal open={open} onClose={onClose} title="Grant Cash Advance" size="sm">
      <div className="space-y-4">
        {/* Employee */}
        {!initialEmployeeId ? (
          <div>
            <label className={labelCls}>Employee *</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className={labelCls}>Employee</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
              {selectedEmployee}
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <label className={labelCls}>Amount *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">₱</span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputCls} pl-7`}
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Cash source */}
        <div>
          <label className={labelCls}>Cash came from *</label>
          <select
            value={cashAccountId}
            onChange={(e) => setCashAccountId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select account…</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* COA account for the advance (asset account) */}
        <div>
          <label className={labelCls}>Employee advance account *</label>
          <select
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select account…</option>
            {advanceAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            The balance sheet account tracking this advance — ideally a "Staff Advances" asset
            account. You can add one in Settings → Accounts.
          </p>
        </div>

        {/* Repayment type */}
        <div>
          <label className={labelCls}>Repayment</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRepaymentType('lump-sum')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                repaymentType === 'lump-sum'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Full repayment
            </button>
            <button
              type="button"
              onClick={() => setRepaymentType('installments')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                repaymentType === 'installments'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Split over periods
            </button>
          </div>
        </div>

        {/* Lump-sum: payday choice */}
        {repaymentType === 'lump-sum' && (
          <div>
            <label className={labelCls}>Deduct on</label>
            <PaydayToggle value={deductOn} onChange={setDeductOn} />
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              The full {parsedAmount > 0 ? formatCurrency(parsedAmount) : 'amount'} will be
              deducted on the <strong>{PAYDAY_LABELS[deductOn]}</strong> payroll run.
            </div>
          </div>
        )}

        {/* Installments: periods + start payday */}
        {repaymentType === 'installments' && (
          <>
            <div>
              <label className={labelCls}>Number of payroll periods</label>
              <input
                type="number"
                min="2"
                max="24"
                step="1"
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Start deductions from</label>
              <PaydayToggle value={startPayday} onChange={setStartPayday} />
            </div>

            {splitPreview.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <p className="mb-1 font-medium">Deduction schedule:</p>
                <ol className="space-y-0.5 list-decimal list-inside">
                  {splitPreview.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}

        {/* Note */}
        <div>
          <label className={labelCls}>Note (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Medical emergency"
            className={inputCls}
          />
        </div>

        {/* Error */}
        {grantMut.error && (
          <p className="text-sm text-red-600">{(grantMut.error as Error).message}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={grantMut.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!isValid || grantMut.isPending}
          >
            {grantMut.isPending ? 'Granting…' : 'Grant Advance'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
