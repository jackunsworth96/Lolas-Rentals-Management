import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Button } from '../common/Button.js';
import { formatCurrency } from '../../utils/currency.js';
import {
  useCreateEmployee,
  useSaveEmployee,
  useDeactivateEmployee,
  type EmployeeRow,
} from '../../api/hr.js';
import { useLeaveConfig } from '../../api/config.js';

function nextResetLabel(resetMonth: number, resetDay: number): string {
  const monthName = new Date(2000, Math.max(0, resetMonth - 1), 1).toLocaleString('en', { month: 'long' });
  return `${monthName} ${resetDay}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Calendar Y-M-D in Asia/Manila for "today". */
function manilaYmd(): { y: number; m: number; d: number } {
  const s = new Date().toLocaleString('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [yy, mm, dd] = s.split('-').map((x) => Number(x));
  return { y: yy, m: mm, d: dd };
}

function ymdOrd(y: number, month: number, day: number): number {
  return y * 10000 + month * 100 + day;
}

/** Next annual reset (calendar) aligned with leave job (Manila). Returns UTC noon for stable formatting. */
function nextResetInstantManila(resetMonth: number, resetDay: number): Date | null {
  if (resetMonth < 1 || resetMonth > 12 || resetDay < 1) return null;
  const { y, m, d } = manilaYmd();
  const todayO = ymdOrd(y, m, d);
  const dayThisYear = Math.min(resetDay, daysInMonth(y, resetMonth));
  const thisYearO = ymdOrd(y, resetMonth, dayThisYear);
  let targetY = y;
  let day = dayThisYear;
  if (thisYearO < todayO) {
    targetY = y + 1;
    day = Math.min(resetDay, daysInMonth(targetY, resetMonth));
  }
  return new Date(Date.UTC(targetY, resetMonth - 1, day, 12, 0, 0));
}

interface Props {
  employee?: EmployeeRow | null;
  stores: Array<{ id: string; name: string }>;
  onClose: () => void;
}

type Tab = 'personal' | 'role' | 'government' | 'leave' | 'financial';

const TABS: { key: Tab; label: string }[] = [
  { key: 'personal', label: 'Personal' },
  { key: 'role', label: 'Role & Pay' },
  { key: 'government', label: 'Government' },
  { key: 'leave', label: 'Leave' },
  { key: 'financial', label: 'Financial' },
];

function blankForm(): Record<string, unknown> {
  return {
    fullName: '',
    storeId: '',
    role: '',
    status: 'Active',
    birthday: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    startDate: '',
    probationEndDate: '',
    rateType: '',
    basicRate: 0,
    overtimeRate: 0,
    ninePmBonusRate: 0,
    commissionRate: 0,
    paidAs: '',
    monthlyBikeAllowance: 0,
    holidayAllowance: 0,
    sickAllowance: 0,
    sssNo: '',
    philhealthNo: '',
    pagibigNo: '',
    tin: '',
    sssDeductionAmt: 0,
    philhealthDeductionAmt: 0,
    pagibigDeductionAmt: 0,
  };
}

function employeeToForm(e: EmployeeRow): Record<string, unknown> {
  return {
    fullName: e.fullName,
    storeId: e.storeId ?? '',
    role: e.role ?? '',
    status: e.status,
    birthday: e.birthday ?? '',
    emergencyContactName: e.emergencyContactName ?? '',
    emergencyContactNumber: e.emergencyContactNumber ?? '',
    startDate: e.startDate ?? '',
    probationEndDate: e.probationEndDate ?? '',
    rateType: e.rateType ?? '',
    basicRate: e.basicRate ?? 0,
    overtimeRate: e.overtimeRate ?? 0,
    ninePmBonusRate: e.ninePmBonusRate ?? 0,
    commissionRate: e.commissionRate ?? 0,
    paidAs: e.paidAs ?? '',
    monthlyBikeAllowance: e.monthlyBikeAllowance ?? 0,
    holidayAllowance: e.holidayAllowance ?? 0,
    sickAllowance: e.sickAllowance ?? 0,
    sssNo: e.sssNo ?? '',
    philhealthNo: e.philhealthNo ?? '',
    pagibigNo: e.pagibigNo ?? '',
    tin: e.tin ?? '',
    sssDeductionAmt: e.sssDeductionAmt ?? 0,
    philhealthDeductionAmt: e.philhealthDeductionAmt ?? 0,
    pagibigDeductionAmt: e.pagibigDeductionAmt ?? 0,
  };
}

export function EmployeeModal({ employee, stores, onClose }: Props) {
  const isNew = !employee;
  const [tab, setTab] = useState<Tab>('personal');
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<Record<string, unknown>>(
    employee ? employeeToForm(employee) : blankForm(),
  );
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const createMut = useCreateEmployee();
  const saveMut = useSaveEmployee();
  const deactivateMut = useDeactivateEmployee();

  const leaveStoreId = String(form.storeId ?? employee?.storeId ?? '').trim();
  const { data: leaveConfig, isFetched: leaveCfgFetched } = useLeaveConfig(
    leaveStoreId || undefined,
  );

  /** Apply store defaults once per store selection so staff can override without being overwritten. */
  const leavePrefillStoreRef = useRef<string>('');

  useEffect(() => {
    if (employee) setForm(employeeToForm(employee));
  }, [employee]);

  useEffect(() => {
    if (isNew && !leaveStoreId) leavePrefillStoreRef.current = '';
  }, [isNew, leaveStoreId]);

  useEffect(() => {
    if (!isNew) {
      leavePrefillStoreRef.current = '';
      return;
    }
    if (!leaveStoreId || !leaveCfgFetched) return;
    if (leavePrefillStoreRef.current === leaveStoreId) return;
    leavePrefillStoreRef.current = leaveStoreId;
    if (leaveConfig == null) {
      setForm((p) => ({ ...p, holidayAllowance: 5, sickAllowance: 5 }));
      return;
    }
    const c = leaveConfig as Record<string, unknown>;
    setForm((p) => ({
      ...p,
      holidayAllowance: Number(c.defaultHolidayAllowance ?? 5),
      sickAllowance: Number(c.defaultSickAllowance ?? 5),
    }));
  }, [isNew, leaveStoreId, leaveCfgFetched, leaveConfig]);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    // Convert empty strings to null for optional fields
    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = null;
    }
    // Ensure required fields stay as strings
    if (!payload.fullName) return;
    if (!payload.storeId) return;

    if (isNew) {
      createMut.mutate(payload, { onSuccess: () => onClose() });
    } else {
      saveMut.mutate({ id: employee!.id, ...payload }, { onSuccess: () => onClose() });
    }
  }

  function handleDeactivate() {
    if (!employee) return;
    deactivateMut.mutate(employee.id, { onSuccess: () => onClose() });
  }

  const isPending = createMut.isPending || saveMut.isPending;

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500';
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700';
  const readOnlyCls = 'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[min(85vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              {isNew ? 'Add Employee' : employee!.fullName}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === 'personal' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Full Name *</label>
                  <input
                    type="text"
                    value={String(form.fullName ?? '')}
                    onChange={(e) => set('fullName', e.target.value)}
                    disabled={!editing}
                    required
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Store *</label>
                    <select
                      value={String(form.storeId ?? '')}
                      onChange={(e) => set('storeId', e.target.value)}
                      disabled={!editing}
                      required
                      className={inputCls}
                    >
                      <option value="">Select store...</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select
                      value={String(form.status ?? 'Active')}
                      onChange={(e) => set('status', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Birthday</label>
                    <input
                      type="date"
                      value={String(form.birthday ?? '')}
                      onChange={(e) => set('birthday', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Start Date</label>
                    <input
                      type="date"
                      value={String(form.startDate ?? '')}
                      onChange={(e) => set('startDate', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Probation End Date</label>
                  <input
                    type="date"
                    value={String(form.probationEndDate ?? '')}
                    onChange={(e) => set('probationEndDate', e.target.value)}
                    disabled={!editing}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Emergency Contact Name</label>
                    <input
                      type="text"
                      value={String(form.emergencyContactName ?? '')}
                      onChange={(e) => set('emergencyContactName', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Emergency Contact Number</label>
                    <input
                      type="text"
                      value={String(form.emergencyContactNumber ?? '')}
                      onChange={(e) => set('emergencyContactNumber', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            )}

            {tab === 'role' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Role</label>
                  <input
                    type="text"
                    value={String(form.role ?? '')}
                    onChange={(e) => set('role', e.target.value)}
                    disabled={!editing}
                    placeholder="e.g. Manager, Rental Staff"
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Rate Type</label>
                    <select
                      value={String(form.rateType ?? '')}
                      onChange={(e) => set('rateType', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    >
                      <option value="">Not set</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Paid As</label>
                    <select
                      value={String(form.paidAs ?? '')}
                      onChange={(e) => set('paidAs', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    >
                      <option value="">Not set</option>
                      <option value="Cash">Cash</option>
                      <option value="GCash">GCash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Basic Rate</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={Number(form.basicRate ?? 0)}
                      onChange={(e) => set('basicRate', parseFloat(e.target.value) || 0)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Overtime Rate</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={Number(form.overtimeRate ?? 0)}
                      onChange={(e) => set('overtimeRate', parseFloat(e.target.value) || 0)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>9PM Bonus Rate</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={Number(form.ninePmBonusRate ?? 0)}
                      onChange={(e) => set('ninePmBonusRate', parseFloat(e.target.value) || 0)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Commission Rate</label>
                    <input
                      type="number"
                      min={0}
                      step={0.0001}
                      value={Number(form.commissionRate ?? 0)}
                      onChange={(e) => set('commissionRate', parseFloat(e.target.value) || 0)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Monthly Bike Allowance</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={Number(form.monthlyBikeAllowance ?? 0)}
                    onChange={(e) => set('monthlyBikeAllowance', parseFloat(e.target.value) || 0)}
                    disabled={!editing}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {tab === 'government' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>SSS Number</label>
                    <input
                      type="text"
                      value={String(form.sssNo ?? '')}
                      onChange={(e) => set('sssNo', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>SSS Deduction</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={Number(form.sssDeductionAmt ?? 0)}
                      onChange={(e) => set('sssDeductionAmt', parseFloat(e.target.value) || 0)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>PhilHealth Number</label>
                    <input
                      type="text"
                      value={String(form.philhealthNo ?? '')}
                      onChange={(e) => set('philhealthNo', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>PhilHealth Deduction</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={Number(form.philhealthDeductionAmt ?? 0)}
                      onChange={(e) => set('philhealthDeductionAmt', parseFloat(e.target.value) || 0)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>PagIBIG Number</label>
                    <input
                      type="text"
                      value={String(form.pagibigNo ?? '')}
                      onChange={(e) => set('pagibigNo', e.target.value)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>PagIBIG Deduction</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={Number(form.pagibigDeductionAmt ?? 0)}
                      onChange={(e) => set('pagibigDeductionAmt', parseFloat(e.target.value) || 0)}
                      disabled={!editing}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>TIN</label>
                  <input
                    type="text"
                    value={String(form.tin ?? '')}
                    onChange={(e) => set('tin', e.target.value)}
                    disabled={!editing}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {tab === 'leave' && (() => {
              const holAllow = Number(form.holidayAllowance ?? 0);
              const sickAllow = Number(form.sickAllowance ?? 0);
              const holUsed = isNew ? 0 : Number(employee?.holidayUsed ?? 0);
              const sickUsed = isNew ? 0 : Number(employee?.sickUsed ?? 0);
              const holRem = Math.max(0, holAllow - holUsed);
              const sickRem = Math.max(0, sickAllow - sickUsed);
              const cfg = leaveConfig as Record<string, unknown> | null | undefined;
              const resetM = cfg != null ? Number(cfg.resetMonth) : NaN;
              const resetD = cfg != null ? Number(cfg.resetDay) : NaN;
              const hasReset =
                leaveStoreId &&
                cfg != null &&
                Number.isFinite(resetM) &&
                Number.isFinite(resetD) &&
                resetM >= 1 &&
                resetM <= 12;
              const nextReset = hasReset ? nextResetInstantManila(resetM, resetD) : null;

              return (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Allowances are pre-filled from Leave Configuration for the selected store when adding
                    someone new (you can change them here). Used days are updated from timesheets.
                  </p>

                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-left">
                          <th className="px-3 py-2 font-medium text-gray-700">Leave type</th>
                          <th className="px-3 py-2 font-medium text-gray-700">Allowance</th>
                          <th className="px-3 py-2 font-medium text-gray-700">Used</th>
                          <th className="px-3 py-2 font-medium text-gray-700">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="px-3 py-2 font-medium text-gray-800">Holiday</td>
                          <td className="px-3 py-2">
                            {editing ? (
                              <input
                                type="number"
                                min={0}
                                value={holAllow}
                                onChange={(e) => set('holidayAllowance', parseInt(e.target.value, 10) || 0)}
                                className={`${inputCls} max-w-[5.5rem]`}
                              />
                            ) : (
                              <span className="text-gray-800">{holAllow} days</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{holUsed} days</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{holRem} days</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 font-medium text-gray-800">Sick</td>
                          <td className="px-3 py-2">
                            {editing ? (
                              <input
                                type="number"
                                min={0}
                                value={sickAllow}
                                onChange={(e) => set('sickAllowance', parseInt(e.target.value, 10) || 0)}
                                className={`${inputCls} max-w-[5.5rem]`}
                              />
                            ) : (
                              <span className="text-gray-800">{sickAllow} days</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{sickUsed} days</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{sickRem} days</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm">
                    <h4 className="mb-1 font-semibold text-gray-800">Next reset date</h4>
                    {!leaveStoreId && (
                      <p className="text-gray-600">Select a store to show the annual reset schedule for that location.</p>
                    )}
                    {leaveStoreId && !leaveCfgFetched && (
                      <p className="text-gray-600">Loading leave settings…</p>
                    )}
                    {leaveStoreId && leaveCfgFetched && cfg == null && (
                      <p className="text-gray-600">
                        No leave configuration for this store yet. Set reset day and defaults under{' '}
                        <span className="font-medium">Settings → Leave Configuration</span>.
                      </p>
                    )}
                    {leaveStoreId && leaveCfgFetched && cfg != null && !hasReset && (
                      <p className="text-gray-600">
                        Leave configuration exists but reset month/day look invalid. Update them in Settings → Leave
                        Configuration.
                      </p>
                    )}
                    {leaveStoreId && leaveCfgFetched && cfg != null && hasReset && nextReset && (
                      <p className="text-gray-800">
                        <span className="font-medium">
                          {nextReset.toLocaleDateString('en-PH', {
                            timeZone: 'Asia/Manila',
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                        <span className="text-gray-600">
                          {' '}
                          (repeats each {nextResetLabel(resetM, resetD)})
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {tab === 'financial' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  These values are managed by payroll and are read-only here.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>13th Month Accrued</label>
                    <div className={readOnlyCls}>
                      {formatCurrency(employee?.thirteenthMonthAccrued ?? 0)}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Current Cash Advance</label>
                    <div className={readOnlyCls}>
                      {formatCurrency(employee?.currentCashAdvance ?? 0)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Bike Allowance Used</label>
                    <div className={readOnlyCls}>
                      {formatCurrency(employee?.bikeAllowanceUsed ?? 0)}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Bike Allowance Accrued</label>
                    <div className={readOnlyCls}>
                      {formatCurrency(employee?.bikeAllowanceAccrued ?? 0)}
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Available Balance</label>
                  <div className={readOnlyCls}>
                    {formatCurrency(employee?.availableBalance ?? 0)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-gray-200 px-6 py-4">
            {(createMut.error || saveMut.error) && (
              <p className="mb-3 text-sm text-red-600">
                {(createMut.error ?? saveMut.error)?.message}
              </p>
            )}
            <div className="flex items-center gap-3">
              {!isNew && !editing && employee?.status === 'Active' && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeactivateConfirm(true)}
                >
                  Deactivate
                </Button>
              )}
              <div className="flex-1" />
              {!isNew && !editing && (
                <Button type="button" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {editing && (
                <>
                  {!isNew && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(false);
                        if (employee) setForm(employeeToForm(employee));
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" size="sm" loading={isPending}>
                    {isNew ? 'Create Employee' : 'Save Changes'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </form>

        {/* Deactivation confirm overlay */}
        {showDeactivateConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/30">
            <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
              <h3 className="mb-2 text-lg font-bold text-gray-900">
                Deactivate Employee?
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                This will set {employee?.fullName} to Inactive. They will no longer appear in
                active employee lists. This does not delete any records.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowDeactivateConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={handleDeactivate}
                  loading={deactivateMut.isPending}
                >
                  Deactivate
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
