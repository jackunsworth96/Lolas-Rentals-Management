import { useState, useMemo } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useEmployees } from '../../api/hr.js';
import { usePayrollRuns, useAllowanceBalances } from '../../api/payroll.js';
import { formatCurrency } from '../../utils/currency.js';
import { RunPayrollModal } from '../../components/hr/RunPayrollModal.js';
import { RunsTab, RunDetailModal } from '../../components/hr/payroll/RunsTab.js';
import { ThirteenthMonthTab } from '../../components/hr/payroll/ThirteenthMonthTab.js';
import { HolidaysTab } from '../../components/hr/payroll/HolidaysTab.js';
import { RemittancesTab } from '../../components/hr/payroll/RemittancesTab.js';
import { AllowanceTab } from '../../components/hr/payroll/AllowanceTab.js';
import { RequestsTab } from '../../components/hr/payroll/RequestsTab.js';
import { useStaffRequests } from '../../api/me.js';

type Tab = 'overview' | 'requests' | 'runs' | 'thirteenth' | 'allowance' | 'remittances' | 'holidays';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'requests', label: 'Staff requests' },
  { id: 'runs', label: 'Runs & payslips' },
  { id: 'thirteenth', label: '13th month' },
  { id: 'allowance', label: 'Vehicle allowance' },
  { id: 'remittances', label: 'Remittances' },
  { id: 'holidays', label: 'Holidays' },
];

function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** The next payday on or after today: the 15th or the last day of the month. */
function nextPayday(today: string): { date: string; label: string } {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const ym = today.slice(0, 7);
  if (d <= 15) return { date: `${ym}-15`, label: `1st – 15th` };
  return { date: `${ym}-${String(last).padStart(2, '0')}`, label: `16th – ${last}th` };
}

export default function PayrollPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('can_view_payroll');
  const canRun = hasPermission('can_run_payroll');
  const canPayAllowance = hasPermission('can_edit_expenses');
  const canApprove = hasPermission('can_approve_staff_requests');
  const { data: pendingRequests } = useStaffRequests('pending', storeId, canView && canApprove);
  const pendingCount = (pendingRequests?.leave.length ?? 0) + (pendingRequests?.advances.length ?? 0)
    + (pendingRequests?.disputes.filter((d) => !d.resolvedAt).length ?? 0);

  const [tab, setTab] = useState<Tab>('overview');
  const [showRunPayroll, setShowRunPayroll] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const { data: employees, isLoading } = useEmployees(storeId);
  const year = Number(manilaToday().slice(0, 4));
  const { data: runs = [] } = usePayrollRuns(storeId, year);
  const { data: allowances = [] } = useAllowanceBalances(canView ? storeId : '');

  const activeEmployees = useMemo(() => (employees ?? []).filter((e) => e.status === 'Active'), [employees]);
  const allowanceById = useMemo(() => new Map(allowances.map((a) => [a.employeeId, a.balance])), [allowances]);

  if (!canView) {
    return <div className="py-12 text-center text-gray-500">You don&apos;t have access to payroll.</div>;
  }

  const today = manilaToday();
  const payday = nextPayday(today);
  const lastRun = runs.find((r) => r.status === 'posted' && r.runType === 'regular');
  const ytdNet = runs.filter((r) => r.status === 'posted').reduce((s, r) => s + r.totalNet, 0);
  const paydayDone = runs.some((r) => r.status === 'posted' && r.runType === 'regular' && r.periodEnd === payday.date);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        {canRun && (
          <button
            onClick={() => setShowRunPayroll(true)}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Run payroll
          </button>
        )}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.filter((t) => t.id !== 'requests' || canApprove).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
            {t.id === 'requests' && pendingCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={`rounded-lg border px-4 py-3 ${paydayDone ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="text-xs uppercase tracking-wide text-gray-500">Next payday</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{payday.date}</div>
              <div className="text-sm text-gray-600">
                Covers the {payday.label}{paydayDone ? ' · already posted' : ''}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Last run</div>
              {lastRun ? (
                <button type="button" onClick={() => setOpenRunId(lastRun.id)} className="mt-1 text-left">
                  <div className="text-lg font-semibold text-gray-900">{formatCurrency(lastRun.totalNet)}</div>
                  <div className="text-sm text-teal-700 hover:underline">{lastRun.periodStart} → {lastRun.periodEnd}</div>
                </button>
              ) : (
                <div className="mt-1 text-sm text-gray-500">No runs yet this year</div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Net paid {year}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(ytdNet)}</div>
              <div className="text-sm text-gray-600">{runs.filter((r) => r.status === 'posted').length} runs</div>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-gray-500">Loading...</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                    <th className="px-3 py-2 text-right">Contributions / mo</th>
                    <th className="px-3 py-2 text-right">Cash advance</th>
                    <th className="px-3 py-2 text-right">Vehicle allowance</th>
                    <th className="px-3 py-2 text-right">13th month</th>
                    <th className="px-3 py-2 text-left">Paid by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeEmployees.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">No active employees</td></tr>
                  )}
                  {activeEmployees.map((e) => {
                    const monthly = (e.rateType ?? '').toLowerCase() === 'monthly';
                    const contrib = e.sssDeductionAmt + e.philhealthDeductionAmt + e.pagibigDeductionAmt;
                    return (
                      <tr key={e.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">{e.fullName}</td>
                        <td className="px-3 py-2 text-gray-600">{e.role ?? ''}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(e.basicRate ?? 0)}<span className="text-xs text-gray-400">/{monthly ? 'mo' : 'day'}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.commissionRate ? `${e.commissionRate}%` : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{contrib ? formatCurrency(contrib) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.currentCashAdvance ? formatCurrency(e.currentCashAdvance) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {allowanceById.has(e.id) ? formatCurrency(allowanceById.get(e.id)!) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.thirteenthMonthAccrued ? formatCurrency(e.thirteenthMonthAccrued) : '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{e.defaultPaymentMethod === 'bank_transfer' ? 'Bank transfer' : e.defaultPaymentMethod === 'gcash' ? 'GCash' : 'Cash'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'requests' && canApprove && <RequestsTab storeId={storeId} />}
      {tab === 'runs' && <RunsTab storeId={storeId} onOpenRun={setOpenRunId} />}
      {tab === 'thirteenth' && <ThirteenthMonthTab storeId={storeId} canRun={canRun} />}
      {tab === 'allowance' && <AllowanceTab storeId={storeId} canPayOut={canPayAllowance} canAdjust={canRun} />}
      {tab === 'remittances' && <RemittancesTab storeId={storeId} canRecord={canRun} />}
      {tab === 'holidays' && <HolidaysTab canEdit={canRun} />}

      <RunPayrollModal
        isOpen={showRunPayroll}
        onClose={() => setShowRunPayroll(false)}
        storeId={storeId}
        employees={activeEmployees}
        onViewRun={(id) => { setTab('runs'); setOpenRunId(id); }}
      />
      <RunDetailModal runId={openRunId} onClose={() => setOpenRunId(null)} canVoid={canRun} />
    </div>
  );
}
