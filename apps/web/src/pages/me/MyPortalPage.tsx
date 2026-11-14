import { useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/auth-store.js';
import {
  usePortalSummary,
  useMyPayslips,
  useMyTimesheets,
  useMyLeaveRequests,
  useMyAdvanceRequests,
  useCreateLeaveRequest,
  useCreateAdvanceRequest,
  useCancelMyRequest,
  LEAVE_TYPE_LABEL,
  PAYDAY_LABEL,
  type LeaveType,
  type PaydayType,
  type RequestStatus,
  type MyPayslip,
} from '../../api/me.js';
import { formatCurrency } from '../../utils/currency.js';
import { PayslipSignOffModal } from '../../components/me/PayslipSignOffModal.js';
import { WorkUpdatesTab } from '../../components/me/WorkUpdatesTab.js';

type Tab = 'overview' | 'updates' | 'leave' | 'payslips' | 'timesheets' | 'advances';

function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function addDays(d: string, n: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

/** Mirrors the server: every calendar day in the range counts (the shop is open 7 days a week). */
function countLeaveDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  let n = 0;
  for (let d = start; d <= end && n < 100; d = addDays(d, 1)) {
    n += 1;
  }
  return n;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function StatusPill({ status }: { status: RequestStatus }) {
  const cls: Record<RequestStatus, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls[status]}`}>{status}</span>;
}

function Card({ label, value, hint, tone = 'default', onClick }: {
  label: string; value: string; hint?: string; tone?: 'default' | 'warn'; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'} ${onClick ? 'hover:border-teal-400' : ''}`}
    >
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
    </Tag>
  );
}

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

// ── Leave ───────────────────────────────────────────────────────────────────

function LeaveTab() {
  const { data: summary } = usePortalSummary();
  const { data: requests = [], isLoading } = useMyLeaveRequests();
  const create = useCreateLeaveRequest();
  const cancel = useCancelMyRequest();
  const today = manilaToday();
  const [leaveType, setLeaveType] = useState<LeaveType>('holiday');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const days = countLeaveDays(start, end);
  const bal = leaveType === 'unpaid' ? null : summary?.leave[leaveType];
  const available = bal ? bal.remaining - bal.pending : null;
  const short = available != null && days > available;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(null);
    create.mutate(
      { leaveType, startDate: start, endDate: end, reason: reason.trim() || undefined },
      { onSuccess: (r) => { setDone(`Request sent for ${r.days} day${r.days === 1 ? '' : 's'}. Your manager will review it.`); setReason(''); } },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
        <h2 className="text-base font-semibold text-gray-900">Apply for leave</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600">Type</label>
          <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} className={inputCls}>
            {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">From</label>
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">To</label>
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className={`rounded-lg px-3 py-2 text-sm ${short ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
          {days} day{days === 1 ? '' : 's'}
          {available != null && <> · {Math.max(0, available)} available</>}
          {leaveType === 'unpaid' && <> · not paid</>}
          {short && <div className="mt-1 text-xs">Not enough balance. You can apply for unpaid leave instead.</div>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Reason (optional)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={inputCls} />
        </div>
        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
        {done && <p className="text-sm text-green-700">{done}</p>}
        <button
          type="submit"
          disabled={days === 0 || short || create.isPending}
          className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {create.isPending ? 'Sending...' : 'Send request'}
        </button>
      </form>

      <div className="lg:col-span-3">
        <h2 className="mb-2 text-base font-semibold text-gray-900">My requests</h2>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
          {!isLoading && requests.length === 0 && <p className="p-4 text-sm text-gray-500">No leave requests yet.</p>}
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {LEAVE_TYPE_LABEL[r.leaveType]} · {r.days} day{r.days === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-gray-500">
                  {r.startDate === r.endDate ? fmtDate(r.startDate) : `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}`}
                  {r.reason ? ` · ${r.reason}` : ''}
                </div>
                {r.reviewNote && <div className="mt-1 text-xs text-gray-600">{r.reviewedByName ?? 'Manager'}: {r.reviewNote}</div>}
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} />
                {r.status === 'pending' && (
                  <button
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate({ kind: 'leave', id: r.id })}
                    className="text-xs font-medium text-gray-500 hover:text-red-600"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Payslips ────────────────────────────────────────────────────────────────

function PayslipsTab({ fullName }: { fullName: string }) {
  const { data: slips = [], isLoading } = useMyPayslips();
  const [open, setOpen] = useState<MyPayslip | null>(null);
  const current = open ? slips.find((s) => s.id === open.id) ?? open : null;

  return (
    <div>
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
        {!isLoading && slips.length === 0 && <p className="p-4 text-sm text-gray-500">No payslips yet.</p>}
        {slips.map((p) => {
          const voided = p.runStatus === 'voided';
          const ack = p.acknowledgement;
          const needsSign = p.requiresSignOff && ack?.status !== 'confirmed';
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpen(p)}
              className={`flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-gray-50 ${voided ? 'opacity-50' : ''}`}
            >
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {p.runType === 'thirteenth_month' ? `13th month ${p.periodEnd.slice(0, 4)}` : `${fmtDate(p.periodStart)} to ${fmtDate(p.periodEnd)}`}
                </div>
                <div className="text-xs text-gray-500">Paid {p.payDate ? fmtDate(p.payDate) : '—'}{voided ? ' · voided' : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(p.netPay)}</span>
                {ack?.status === 'confirmed' && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Signed</span>}
                {ack?.status === 'disputed' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{ack.resolvedAt ? 'Answered' : 'Queried'}</span>}
                {needsSign && !ack && <span className="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white">Sign now</span>}
              </div>
            </button>
          );
        })}
      </div>
      <PayslipSignOffModal payslip={current} defaultName={fullName} onClose={() => setOpen(null)} />
    </div>
  );
}

// ── Timesheets ──────────────────────────────────────────────────────────────

function TimesheetsTab() {
  const today = manilaToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const { data: rows = [], isLoading } = useMyTimesheets(from, to);
  const totals = useMemo(() => ({
    worked: rows.filter((r) => !['Holiday', 'Sick', 'Unpaid Leave'].includes(r.dayType)).length,
    leave: rows.filter((r) => ['Holiday', 'Sick'].includes(r.dayType)).length,
    unpaid: rows.filter((r) => r.dayType === 'Unpaid Leave').length,
    overtime: rows.reduce((s, r) => s + r.overtimeHours, 0),
    ninePm: rows.reduce((s, r) => s + r.ninePmReturnsCount, 0),
  }), [rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <div className="text-sm text-gray-600">
          {totals.worked} worked · {totals.leave} paid leave{totals.unpaid ? ` · ${totals.unpaid} unpaid` : ''} · {totals.overtime} h overtime · {totals.ninePm} 9pm returns
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Day</th>
              <th className="px-3 py-2 text-left">In / out</th>
              <th className="px-3 py-2 text-right">OT h</th>
              <th className="px-3 py-2 text-right">9pm</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No timesheets this month.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-3 py-2">{r.dayType}</td>
                <td className="px-3 py-2 text-gray-600">{r.timeIn || r.timeOut ? `${r.timeIn ?? '—'} – ${r.timeOut ?? '—'}` : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.overtimeHours || ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.ninePmReturnsCount || ''}</td>
                <td className="px-3 py-2 text-gray-600">{r.payrollStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Advances ────────────────────────────────────────────────────────────────

function AdvancesTab() {
  const { data: summary } = usePortalSummary();
  const { data: requests = [], isLoading } = useMyAdvanceRequests();
  const create = useCreateAdvanceRequest();
  const cancel = useCancelMyRequest();
  const [amount, setAmount] = useState('');
  const [payday, setPayday] = useState<PaydayType>(Number(manilaToday().slice(8, 10)) <= 15 ? 'mid_month' : 'end_of_month');
  const [reason, setReason] = useState('');
  const pending = summary?.advances.pendingRequest;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      { amount: Number(amount), paydayType: payday, reason: reason.trim() || undefined },
      { onSuccess: () => { setAmount(''); setReason(''); } },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
        <h2 className="text-base font-semibold text-gray-900">Request a cash advance</h2>
        {summary && summary.advances.outstanding > 0 && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">You currently owe {formatCurrency(summary.advances.outstanding)}.</p>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600">Amount</label>
          <input type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Pay it back on</label>
          <select value={payday} onChange={(e) => setPayday(e.target.value as PaydayType)} className={inputCls}>
            {(Object.keys(PAYDAY_LABEL) as PaydayType[]).map((p) => <option key={p} value={p}>{PAYDAY_LABEL[p]} payslip</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Reason (optional)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={inputCls} />
        </div>
        {pending && <p className="text-sm text-amber-700">You already have a request for {formatCurrency(pending.amount)} waiting for approval.</p>}
        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
        <button
          type="submit"
          disabled={!(Number(amount) > 0) || !!pending || create.isPending}
          className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {create.isPending ? 'Sending...' : 'Send request'}
        </button>
      </form>

      <div className="space-y-4 lg:col-span-3">
        {summary && summary.advances.schedules.length > 0 && (
          <div>
            <h2 className="mb-2 text-base font-semibold text-gray-900">Being repaid</h2>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {summary.advances.schedules.map((s) => (
                <div key={s.id} className="flex justify-between p-3 text-sm">
                  <span className="text-gray-700">Granted {s.grantedDate ? fmtDate(s.grantedDate) : ''} · deducted on the {PAYDAY_LABEL[s.paydayType as PaydayType] ?? s.paydayType} payslip</span>
                  <span className="font-medium tabular-nums">{formatCurrency(s.remaining)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">My requests</h2>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
            {!isLoading && requests.length === 0 && <p className="p-4 text-sm text-gray-500">No advance requests yet.</p>}
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">{formatCurrency(r.amount)} · repay on the {PAYDAY_LABEL[r.paydayType]} payslip</div>
                  <div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-PH')}{r.reason ? ` · ${r.reason}` : ''}</div>
                  {r.reviewNote && <div className="mt-1 text-xs text-gray-600">{r.reviewedByName ?? 'Manager'}: {r.reviewNote}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={r.status} />
                  {r.status === 'pending' && (
                    <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate({ kind: 'advance', id: r.id })} className="text-xs font-medium text-gray-500 hover:text-red-600">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function MyPortalPage() {
  const user = useAuthStore((s) => s.user);
  const { data: summary, isLoading, error } = usePortalSummary();
  const [tab, setTab] = useState<Tab>('overview');

  if (!user?.employeeId) {
    return <div className="py-12 text-center text-gray-500">Your login isn&apos;t linked to an employee profile.</div>;
  }

  const updatesExpected = !!summary?.workUpdates.expected;
  const updateDue = updatesExpected && !summary?.workUpdates.thisWeekSent;
  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'overview', label: 'Overview' },
    ...(updatesExpected ? [{ id: 'updates' as Tab, label: 'Weekly updates', badge: updateDue ? 1 : 0 }] : []),
    { id: 'leave', label: 'Leave' },
    { id: 'payslips', label: 'Payslips', badge: summary?.payslipsToSign },
    // Fixed-salary staff don't keep shop timesheets.
    ...(updatesExpected ? [] : [{ id: 'timesheets' as Tab, label: 'Timesheets' }]),
    { id: 'advances', label: 'Cash advances' },
  ];

  const fullName = summary?.employee.fullName ?? '';
  const leaveHint = (b: { entitlement: number; used: number; pending: number }) =>
    `${b.used} used of ${b.entitlement}${b.pending ? ` · ${b.pending} pending` : ''}`;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">My portal</h1>
        {fullName && <p className="text-sm text-gray-500">{fullName}{summary?.employee.role ? ` · ${summary.employee.role}` : ''}</p>}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
            {!!t.badge && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        isLoading ? <div className="py-12 text-center text-gray-500">Loading...</div>
        : error ? <div className="py-12 text-center text-red-600">{(error as Error).message}</div>
        : summary && (
          <div className="space-y-4">
            {summary.payslipsToSign > 0 && (
              <button
                type="button"
                onClick={() => setTab('payslips')}
                className="flex w-full items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-teal-900">
                  {summary.payslipsToSign} payslip{summary.payslipsToSign === 1 ? '' : 's'} waiting for your signature
                </span>
                <span className="text-sm font-semibold text-teal-700">Review and sign</span>
              </button>
            )}
            {updateDue && (
              <button
                type="button"
                onClick={() => setTab('updates')}
                className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-amber-900">This week&apos;s update hasn&apos;t been sent yet</span>
                <span className="text-sm font-semibold text-amber-700">Write update</span>
              </button>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                label="Holiday leave left"
                value={`${Math.max(0, summary.leave.holiday.remaining)} days`}
                hint={leaveHint(summary.leave.holiday)}
                onClick={() => setTab('leave')}
              />
              <Card
                label="Sick leave left"
                value={`${Math.max(0, summary.leave.sick.remaining)} days`}
                hint={leaveHint(summary.leave.sick)}
                onClick={() => setTab('leave')}
              />
              <Card
                label="Cash advance owed"
                value={formatCurrency(summary.advances.outstanding)}
                hint={summary.advances.pendingRequest ? `${formatCurrency(summary.advances.pendingRequest.amount)} request pending` : undefined}
                onClick={() => setTab('advances')}
              />
              <Card
                label="Vehicle allowance"
                value={formatCurrency(summary.vehicleAllowance.balance)}
                hint={summary.vehicleAllowance.monthly ? `${formatCurrency(summary.vehicleAllowance.monthly)} added at the end of each month` : undefined}
                tone={summary.vehicleAllowance.balance < 0 ? 'warn' : 'default'}
              />
            </div>
            {summary.leave.onProbation && (
              <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                You&apos;re on probation{summary.employee.probationEndDate ? ` until ${fmtDate(summary.employee.probationEndDate)}` : ''}, so your leave builds up each month. The full allowance applies after that.
              </p>
            )}
            {summary.leave.unpaidTakenThisYear > 0 && (
              <p className="text-sm text-gray-500">Unpaid leave taken this year: {summary.leave.unpaidTakenThisYear} day{summary.leave.unpaidTakenThisYear === 1 ? '' : 's'}.</p>
            )}
          </div>
        )
      )}
      {tab === 'updates' && summary && <WorkUpdatesTab thisWeekStart={summary.workUpdates.thisWeekStart} />}
      {tab === 'leave' && <LeaveTab />}
      {tab === 'payslips' && <PayslipsTab fullName={fullName} />}
      {tab === 'timesheets' && <TimesheetsTab />}
      {tab === 'advances' && <AdvancesTab />}
    </div>
  );
}
