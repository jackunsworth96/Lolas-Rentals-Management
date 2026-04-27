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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500';
const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

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
  const [periods, setPeriods] = useState('2');
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
      setPeriods('2');
      setExpenseAccountId('');
      setCashAccountId('');
      setDescription('');
      grantMut.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // All asset accounts across all stores — so you can pick the Lola's or BASS cash drawer regardless of which store the employee belongs to
  const cashAccounts = useMemo(
    () =>
      (accounts as Array<{ id: string; name: string; account_type?: string; accountType?: string }>).filter(
        (a) => (a.account_type ?? a.accountType ?? '').toLowerCase() === 'asset',
      ),
    [accounts],
  );

  // Asset accounts only — a cash advance is a receivable, not an operating expense
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
    if (repaymentType === 'installments') {
      payload.periods = parsedPeriods;
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
              Full at end of month
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

        {/* Periods (installments only) */}
        {repaymentType === 'installments' && (
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
            {perPeriodAmount !== null && (
              <p className="mt-1 text-xs text-gray-600">
                ≈ {formatCurrency(perPeriodAmount)} deducted each period
              </p>
            )}
          </div>
        )}

        {/* Repayment summary box */}
        {repaymentType === 'lump-sum' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            The full amount will be deducted from the employee's next end-of-month payroll run.
          </div>
        )}
        {repaymentType === 'installments' && parsedPeriods >= 2 && parsedAmount > 0 && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            {formatCurrency(parsedAmount / parsedPeriods)} will be deducted each payroll period
            until the full {formatCurrency(parsedAmount)} is recovered.
          </div>
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
