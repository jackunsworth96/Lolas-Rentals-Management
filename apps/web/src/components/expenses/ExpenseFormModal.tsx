import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import {
  useCreateExpense,
  useUpdateExpense,
  useExpenseCheck,
  useStaffPayouts,
  type AdvanceTerms,
  type EnrichedExpense,
  type ExpenseCatalogItem,
} from '../../api/expenses.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { ExpenseTypePicker } from './ExpenseTypePicker.js';
import { StaffPayoutFields } from './StaffPayoutFields.js';
import { SAFE_METHOD_OPTION, confirmationsOf, errorReasons, inputCls, labelCls, rememberType } from './expense-ui.js';

export interface AccountOption {
  id: string;
  name: string;
  accountType: string;
  storeId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
  catalog: ExpenseCatalogItem[];
  accounts: AccountOption[];
  paymentMethods: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; label: string }>;
  isManager: boolean;
  /** Set only for managers; offers "Safe" as a way to pay. */
  safeAccountId: string | null;
  canGrantAdvances: boolean;
  defaultDate: string;
  editing: EnrichedExpense | null;
}

const NOTE_MIN = 15;
const isCard = (id: string) => ['card', 'creditcard', 'debitcard'].includes(id.toLowerCase().replace(/[\s_-]/g, ''));

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ExpenseFormModal(props: Props) {
  const { open, onClose, storeId, catalog, accounts, paymentMethods, vehicles, isManager, safeAccountId, canGrantAdvances, defaultDate, editing } = props;
  const createMut = useCreateExpense();
  const updateMut = useUpdateExpense();
  const routing = usePaymentRouting();

  const [category, setCategory] = useState<ExpenseCatalogItem | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [unpaid, setUnpaid] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [advance, setAdvance] = useState<AdvanceTerms>({ repaymentType: 'lump-sum', deductOn: 'end_of_month', periods: 2, startPayday: 'end_of_month' });
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAccountId, setOverrideAccountId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);

  const editingCategory = useMemo(
    () => (editing ? catalog.find((c) => c.id === editing.categoryId) ?? null : null),
    [editing, catalog],
  );
  const lockedToDescription = !!editing && (editing.kind === 'bike_allowance' || editing.kind === 'cash_advance' || !!editing.linkedTo);

  function reset(keep?: { date: string; paymentMethodId: string }) {
    setCategory(editing ? editingCategory : null);
    setDate(editing?.date ?? keep?.date ?? defaultDate);
    setAmount(editing ? String(editing.amount) : '');
    setDescription(editing?.description ?? '');
    setUnpaid(false);
    setPaymentMethodId(keep?.paymentMethodId ?? '');
    setVehicleId(editing?.vehicleId ?? '');
    setEmployeeId(editing?.employeeId ?? '');
    setAdvance({ repaymentType: 'lump-sum', deductOn: 'end_of_month', periods: 2, startPayday: 'end_of_month' });
    setOverrideOpen(false);
    setOverrideAccountId('');
    setOverrideReason('');
    setConfirmed(false);
    setTouched(false);
    createMut.reset();
    updateMut.reset();
  }

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const kind = category?.kind ?? editing?.kind ?? 'standard';
  const isPayout = kind === 'bike_allowance' || kind === 'cash_advance';
  const staffQuery = useStaffPayouts(storeId, open && isPayout && !editing);
  const amountNum = Number.parseFloat(amount) || 0;
  const today = manilaToday();

  const debouncedAmount = useDebounced(amountNum, 400);
  const check = useExpenseCheck({
    storeId,
    categoryId: category?.id ?? editing?.categoryId ?? null,
    date,
    amount: lockedToDescription ? 0 : debouncedAmount,
    employeeId: employeeId || undefined,
    vehicleId: vehicleId || undefined,
    excludeId: editing?.id,
  });

  const serverConfirmations = confirmationsOf(createMut.error ?? updateMut.error);
  const unchangedEdit =
    !!editing && amountNum === editing.amount && date === editing.date && (category?.id ?? editing.categoryId) === editing.categoryId;
  const warnings = useMemo(() => {
    const out: string[] = [];
    if (unchangedEdit) return out;
    if (check.data?.overLimit && check.data.softLimit != null && category) {
      out.push(`${formatCurrency(amountNum)} is more than usual for ${category.name} (normally up to ${formatCurrency(check.data.softLimit)}).`);
    }
    if ((check.data?.duplicates ?? 0) > 0) {
      out.push(`An identical ${category?.name ?? 'expense'} for ${formatCurrency(amountNum)} is already logged on this day.`);
    }
    if (out.length === 0) out.push(...serverConfirmations.map((c) => c.message));
    return out;
  }, [check.data, category, amountNum, serverConfirmations, unchangedEdit]);

  const storeAccounts = useMemo(
    () => accounts.filter((a) => a.storeId === storeId || a.storeId === 'company' || a.storeId == null),
    [accounts, storeId],
  );
  const accountName = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name ?? id ?? '—';
  const overrideOptions = storeAccounts.filter((a) => ['Expense', 'Equity', 'Liability'].includes(a.accountType));
  const booksTo = overrideOpen && overrideAccountId ? overrideAccountId : category?.accountId ?? editing?.accountId ?? null;

  const methodOptions = [...paymentMethods.filter((m) => !isCard(m.id)), ...(safeAccountId ? [SAFE_METHOD_OPTION] : [])];
  const paysFrom = !paymentMethodId
    ? null
    : paymentMethodId === SAFE_METHOD_OPTION.id
      ? safeAccountId
      : routing.resolveReceivedIntoForStore(storeId, paymentMethodId);

  const showVehicle = kind === 'standard' && (category?.requiresVehicle || category?.groupName === 'Vehicles' || !!editing?.vehicleId);
  const noteTooShort = !!category?.requiresNote && description.trim().length < NOTE_MIN;
  const staffRow = staffQuery.data?.find((s) => s.employeeId === employeeId);

  const problems: string[] = [];
  if (!lockedToDescription) {
    if (!(amountNum > 0)) problems.push('Enter the amount.');
    if (!date) problems.push('Pick the date.');
    else if (date > today) problems.push("The date can't be in the future.");
    if (!editing && !unpaid && !paymentMethodId) problems.push('Choose how it was paid.');
    if (paymentMethodId && !paysFrom) problems.push('That payment method has no account set up for this store.');
    if (category?.requiresVehicle && !vehicleId) problems.push('Choose the vehicle.');
    if (isPayout && !employeeId) problems.push('Choose the staff member.');
    if (kind === 'bike_allowance' && staffRow && amountNum > staffRow.allowanceBalance + 0.005) problems.push('The amount is more than their allowance balance.');
    if (overrideOpen && (!overrideAccountId || overrideReason.trim().length < 5)) problems.push('Pick the account and give a reason for changing it.');
  }
  if (description.trim().length < 3) problems.push('Say what it was for.');
  else if (noteTooShort) problems.push(`Add a bit more detail (at least ${NOTE_MIN} characters).`);
  if (warnings.length > 0 && !confirmed) problems.push('Confirm the warning above.');

  const pending = createMut.isPending || updateMut.isPending;
  const reasons = (createMut.error ?? updateMut.error) && serverConfirmations.length === 0
    ? errorReasons(createMut.error ?? updateMut.error)
    : [];

  function submit(addAnother: boolean) {
    setTouched(true);
    if (problems.length > 0) return;
    const confirmFlags = { confirmDuplicate: confirmed, confirmOverLimit: confirmed };
    const override = overrideOpen && overrideAccountId ? { accountId: overrideAccountId, reason: overrideReason.trim() } : undefined;

    if (editing) {
      const body = lockedToDescription
        ? { id: editing.id, description: description.trim() }
        : {
            id: editing.id,
            categoryId: category?.id !== editing.categoryId ? category?.id : undefined,
            date,
            amount: amountNum,
            description: description.trim(),
            paymentMethodId: paymentMethodId || undefined,
            vehicleId: vehicleId || null,
            accountOverride: override,
            ...confirmFlags,
          };
      updateMut.mutate(body, { onSuccess: onClose });
      return;
    }
    if (!category) return;
    createMut.mutate(
      {
        storeId,
        categoryId: category.id,
        date,
        amount: amountNum,
        description: description.trim(),
        status: unpaid && !isPayout ? 'unpaid' : 'paid',
        paymentMethodId: unpaid && !isPayout ? null : paymentMethodId || null,
        vehicleId: vehicleId || null,
        employeeId: employeeId || null,
        advance: kind === 'cash_advance' ? advance : undefined,
        accountOverride: override,
        ...confirmFlags,
      },
      {
        onSuccess: () => {
          rememberType(category.id);
          if (addAnother) reset({ date, paymentMethodId });
          else onClose();
        },
      },
    );
  }

  const step: 'pick' | 'form' = editing || category ? 'form' : 'pick';
  const title = editing
    ? `Edit ${editing.category}`
    : step === 'pick'
      ? 'What was the money spent on?'
      : category!.name;
  const saveLabel = editing
    ? 'Save changes'
    : kind === 'bike_allowance'
      ? 'Pay allowance'
      : kind === 'cash_advance'
        ? 'Give advance'
        : unpaid
          ? 'Save as unpaid'
          : 'Save expense';

  const footer = step === 'form' ? (
    <div className="flex flex-wrap items-center gap-2">
      {!editing && (
        <Button variant="ghost" onClick={() => setCategory(null)} disabled={pending}>
          ← Change type
        </Button>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        {!editing && !isPayout && (
          <Button variant="secondary" onClick={() => submit(true)} loading={pending}>
            Save &amp; add another
          </Button>
        )}
        <Button onClick={() => submit(false)} loading={pending}>{saveLabel}</Button>
      </div>
    </div>
  ) : undefined;

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl" fullScreenOnMobile footer={footer}>
      {step === 'pick' ? (
        <ExpenseTypePicker
          catalog={catalog}
          isManager={isManager}
          canGrantAdvances={canGrantAdvances}
          onPick={(c) => {
            setCategory(c);
            setConfirmed(false);
          }}
        />
      ) : (
        <form
          className="grid gap-5 lg:grid-cols-[1fr_16rem]"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="space-y-4">
            {lockedToDescription && (
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-pretty text-sm text-blue-800">
                {editing?.linkedTo === 'timesheet'
                  ? 'This came from a 9pm return on the timesheet. Only the description can be changed here.'
                  : editing?.linkedTo === 'maintenance'
                    ? 'This came from a maintenance job. Only the description can be changed here.'
                    : 'This is a staff payout linked to payroll. Only the description can be changed. To fix anything else, delete it and log it again.'}
              </p>
            )}
            {category?.helpText && !editing && <p className="text-pretty text-sm text-gray-600">{category.helpText}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="exp-amount" className={labelCls}>Amount</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">₱</span>
                  <input
                    id="exp-amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    autoFocus={!editing}
                    value={amount}
                    disabled={lockedToDescription}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setConfirmed(false);
                    }}
                    placeholder="0.00"
                    className={`${inputCls} pl-7 tabular-nums`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="exp-date" className={labelCls}>Date</label>
                <input
                  id="exp-date"
                  type="date"
                  max={today}
                  value={date}
                  disabled={lockedToDescription}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setConfirmed(false);
                  }}
                  className={inputCls}
                />
              </div>
            </div>

            {isPayout && !editing && (
              <StaffPayoutFields
                kind={kind}
                staff={staffQuery.data ?? []}
                loading={staffQuery.isLoading}
                employeeId={employeeId}
                onEmployee={setEmployeeId}
                amount={amountNum}
                advance={advance}
                onAdvance={setAdvance}
              />
            )}
            {isPayout && editing?.employeeName && (
              <p className="text-sm text-gray-700">Paid to <strong>{editing.employeeName}</strong></p>
            )}

            <div>
              <label htmlFor="exp-desc" className={labelCls}>
                What was it for?
                {category?.requiresNote && <span className="ml-1 font-normal text-gray-500">(include details)</span>}
              </label>
              <textarea
                id="exp-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  kind === 'bike_allowance'
                    ? 'e.g. Fuel for own bike'
                    : kind === 'cash_advance'
                      ? 'e.g. Medical emergency'
                      : 'e.g. Lunch for 3 staff, 2 x 5L water'
                }
                className={inputCls}
                aria-describedby={noteTooShort ? 'exp-desc-hint' : undefined}
              />
              {noteTooShort && (
                <p id="exp-desc-hint" className="mt-1 text-xs text-gray-500">
                  {category?.name} needs a clear description: who, what and why.
                </p>
              )}
            </div>

            {showVehicle && (
              <div>
                <label htmlFor="exp-vehicle" className={labelCls}>
                  Vehicle {category?.requiresVehicle ? '' : <span className="font-normal text-gray-500">(optional)</span>}
                </label>
                <select id="exp-vehicle" value={vehicleId} disabled={lockedToDescription} onChange={(e) => setVehicleId(e.target.value)} className={inputCls}>
                  <option value="">{category?.requiresVehicle ? 'Choose the vehicle' : 'Not for a specific vehicle'}</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
            )}

            {!lockedToDescription && (
              <fieldset className="space-y-3">
                <legend className={labelCls}>{editing ? 'How it was paid' : 'How was it paid?'}</legend>
                {!editing && kind === 'standard' && (
                  <div role="radiogroup" aria-label="Payment status" className="grid grid-cols-2 gap-2">
                    {[false, true].map((u) => (
                      <button
                        key={String(u)}
                        type="button"
                        role="radio"
                        aria-checked={unpaid === u}
                        onClick={() => setUnpaid(u)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          unpaid === u ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {u ? 'Not paid yet' : 'Paid now'}
                      </button>
                    ))}
                  </div>
                )}
                {editing && editing.status === 'unpaid' && (
                  <p className="text-sm text-gray-600">Not paid yet. Use <strong>Pay selected</strong> on the Unpaid tab when it is paid.</p>
                )}
                {(!unpaid || isPayout) && !(editing && editing.status === 'unpaid') && (
                  <div>
                    <select
                      aria-label="Payment method"
                      value={paymentMethodId}
                      onChange={(e) => setPaymentMethodId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">{editing ? `Keep: ${editing.paidFromName ?? 'unchanged'}` : 'Choose payment method'}</option>
                      {methodOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    {paymentMethodId && (
                      <p className={`mt-1 text-xs ${paysFrom ? 'text-gray-500' : 'text-red-600'}`}>
                        {paysFrom ? `Comes out of ${accountName(paysFrom)}` : 'No account is set up for this payment method. Ask a manager to fix payment routing in Settings.'}
                      </p>
                    )}
                  </div>
                )}
              </fieldset>
            )}

            {warnings.length > 0 && (
              <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                {warnings.map((w) => <p key={w} className="text-pretty text-sm text-amber-900">{w}</p>)}
                <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-4 rounded border-amber-400" />
                  I've checked it. This is correct.
                </label>
              </div>
            )}

            {touched && problems.length > 0 && (
              <ul role="alert" className="list-inside list-disc rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {reasons.length > 0 && (
              <ul role="alert" className="list-inside list-disc rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>

          <aside className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm lg:self-start">
            <div>
              <p className="text-xs font-medium text-gray-500">Type</p>
              <p className="font-medium text-gray-900">{category?.name ?? editing?.category}</p>
              {editing && !lockedToDescription && editing.kind === 'standard' && (
                <select
                  aria-label="Change expense type"
                  value={category?.id ?? ''}
                  onChange={(e) => {
                    const next = catalog.find((c) => c.id === Number(e.target.value));
                    if (next) setCategory(next);
                  }}
                  className={`${inputCls} mt-1`}
                >
                  {!category && <option value="">{editing.category} (old type)</option>}
                  {catalog
                    .filter((c) => c.kind === 'standard' && c.isActive && (isManager || !c.managersOnly))
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Books to</p>
              <p className="font-medium text-gray-900">{accountName(booksTo)}</p>
              {kind === 'bike_allowance' && <p className="mt-0.5 text-xs text-gray-500">Reduces their bike allowance balance.</p>}
              {kind === 'cash_advance' && <p className="mt-0.5 text-xs text-gray-500">Recovered from their pay.</p>}
            </div>
            {amountNum > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500">Amount</p>
                <p className="text-lg font-semibold tabular-nums text-gray-900">{formatCurrency(amountNum)}</p>
              </div>
            )}
            {isManager && kind === 'standard' && !lockedToDescription && (
              <div className="border-t border-gray-200 pt-3">
                {!overrideOpen ? (
                  <button type="button" onClick={() => setOverrideOpen(true)} className="text-xs font-medium text-teal-700 hover:underline">
                    Book to a different account
                  </button>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="exp-override" className="text-xs font-medium text-gray-700">Book to (managers only)</label>
                    <select id="exp-override" value={overrideAccountId} onChange={(e) => setOverrideAccountId(e.target.value)} className={inputCls}>
                      <option value="">Choose account</option>
                      {overrideOptions.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.accountType}</option>)}
                    </select>
                    <input
                      aria-label="Reason for changing the account"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Reason (kept with the entry)"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setOverrideOpen(false);
                        setOverrideAccountId('');
                        setOverrideReason('');
                      }}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Use the normal account
                    </button>
                  </div>
                )}
              </div>
            )}
            {editing && (
              <p className="border-t border-gray-200 pt-3 text-xs text-gray-500">
                Logged by {editing.createdByName ?? 'unknown'}
                {editing.updatedByName ? ` · last changed by ${editing.updatedByName}` : ''}
              </p>
            )}
          </aside>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}
