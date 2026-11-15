import type { AdvanceTerms, ExpenseKind, StaffPayoutRow } from '../../api/expenses.js';
import { formatCurrency } from '../../utils/currency.js';
import { inputCls, labelCls } from './expense-ui.js';

type Payday = 'mid_month' | 'end_of_month';

const PAYDAY_LABELS: Record<Payday, string> = {
  mid_month: '16th payday (pay for the 1st–15th)',
  end_of_month: '1st payday (pay for the 16th–end of month)',
};

function PaydayToggle({ value, onChange, label }: { value: Payday; onChange: (v: Payday) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {(['mid_month', 'end_of_month'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            value === v ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {v === 'mid_month' ? '16th payday' : '1st payday'}
        </button>
      ))}
    </div>
  );
}

interface Props {
  kind: Extract<ExpenseKind, 'bike_allowance' | 'cash_advance'>;
  staff: StaffPayoutRow[];
  loading: boolean;
  employeeId: string;
  onEmployee: (id: string) => void;
  amount: number;
  advance: AdvanceTerms;
  onAdvance: (terms: AdvanceTerms) => void;
  disabled?: boolean;
}

export function StaffPayoutFields({ kind, staff, loading, employeeId, onEmployee, amount, advance, onAdvance, disabled }: Props) {
  const person = staff.find((s) => s.employeeId === employeeId);
  const isAllowance = kind === 'bike_allowance';
  const eligible = isAllowance ? staff.filter((s) => s.monthlyAllowance > 0 || s.allowanceBalance > 0) : staff;
  const left = person ? person.allowanceBalance - amount : 0;
  const periods = advance.periods ?? 2;
  const perPeriod = amount > 0 ? Math.round((amount / periods) * 100) / 100 : 0;

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div>
        <label htmlFor="payout-employee" className={labelCls}>Staff member</label>
        <select
          id="payout-employee"
          value={employeeId}
          onChange={(e) => onEmployee(e.target.value)}
          className={inputCls}
          disabled={disabled || loading}
        >
          <option value="">{loading ? 'Loading staff…' : 'Choose who receives the money'}</option>
          {eligible.map((s) => (
            <option key={s.employeeId} value={s.employeeId}>
              {s.employeeName}
              {isAllowance ? ` · ${formatCurrency(s.allowanceBalance)} left` : s.advanceOutstanding > 0 ? ` · owes ${formatCurrency(s.advanceOutstanding)}` : ''}
            </option>
          ))}
        </select>
        {isAllowance && !loading && eligible.length === 0 && (
          <p className="mt-1 text-xs text-gray-500">No one at this store has a bike allowance set up.</p>
        )}
      </div>

      {isAllowance && person && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white px-2 py-2">
            <dt className="text-[11px] text-gray-500">Monthly allowance</dt>
            <dd className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(person.monthlyAllowance)}</dd>
          </div>
          <div className="rounded-lg bg-white px-2 py-2">
            <dt className="text-[11px] text-gray-500">Balance now</dt>
            <dd className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(person.allowanceBalance)}</dd>
          </div>
          <div className={`rounded-lg px-2 py-2 ${left < 0 ? 'bg-red-50' : 'bg-white'}`}>
            <dt className="text-[11px] text-gray-500">After this</dt>
            <dd className={`text-sm font-semibold tabular-nums ${left < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(left)}</dd>
          </div>
        </dl>
      )}
      {isAllowance && person && left < 0 && (
        <p role="alert" className="text-sm text-red-700">
          This is more than {person.employeeName}'s balance. Pay at most {formatCurrency(Math.max(0, person.allowanceBalance))}.
        </p>
      )}

      {!isAllowance && (
        <>
          {person && person.advanceOutstanding > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {person.employeeName} still owes {formatCurrency(person.advanceOutstanding)} from earlier advances.
            </p>
          )}
          <div>
            <span className={labelCls} id="repay-label">Repayment</span>
            <div role="radiogroup" aria-labelledby="repay-label" className="grid grid-cols-2 gap-2">
              {(['lump-sum', 'installments'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={advance.repaymentType === t}
                  disabled={disabled}
                  onClick={() => onAdvance({ ...advance, repaymentType: t })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    advance.repaymentType === t ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t === 'lump-sum' ? 'All at once' : 'Split over paydays'}
                </button>
              ))}
            </div>
          </div>
          {advance.repaymentType === 'lump-sum' ? (
            <div>
              <span className={labelCls}>Deduct on</span>
              <PaydayToggle label="Deduct on" value={advance.deductOn ?? 'end_of_month'} onChange={(v) => onAdvance({ ...advance, deductOn: v })} />
              <p className="mt-2 text-pretty text-xs text-gray-600">
                The full {amount > 0 ? formatCurrency(amount) : 'amount'} comes off the {PAYDAY_LABELS[advance.deductOn ?? 'end_of_month']}.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="advance-periods" className={labelCls}>Number of paydays</label>
                <input
                  id="advance-periods"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={24}
                  value={periods}
                  onChange={(e) => onAdvance({ ...advance, periods: Math.max(2, Math.min(24, Number(e.target.value) || 2)) })}
                  className={inputCls}
                />
              </div>
              <div>
                <span className={labelCls}>Starting from</span>
                <PaydayToggle label="Starting from" value={advance.startPayday ?? 'end_of_month'} onChange={(v) => onAdvance({ ...advance, startPayday: v })} />
              </div>
              {perPeriod > 0 && (
                <p className="text-pretty text-xs text-gray-600 sm:col-span-2">
                  About {formatCurrency(perPeriod)} comes off each of the next {periods} paydays.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
