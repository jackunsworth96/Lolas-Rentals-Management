import { useState } from 'react';
import { Modal } from '../../common/Modal.js';
import {
  usePayrollRuns,
  usePayrollRun,
  useVoidPayrollRun,
  type PayrollRunSummary,
  type PayslipRecord,
} from '../../../api/payroll.js';
import { usePayslipAcknowledgements, type PayslipAcknowledgement } from '../../../api/me.js';
import { formatCurrency } from '../../../utils/currency.js';
import { downloadPayslipPdf, downloadPayslipsPdf } from '../../../utils/payslipPdf.js';

function runLabel(r: Pick<PayrollRunSummary, 'runType' | 'periodStart' | 'periodEnd'>): string {
  if (r.runType === 'thirteenth_month') return `13th month ${r.periodEnd.slice(0, 4)}`;
  return `${r.periodStart} → ${r.periodEnd}`;
}

function StatusBadge({ status }: { status: string }) {
  return status === 'voided' ? (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Voided</span>
  ) : (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Posted</span>
  );
}

const SIGN_OFF_FROM = '2026-11-01';

function SignOffBadge({ p, ack }: { p: PayslipRecord; ack: PayslipAcknowledgement | undefined }) {
  if (p.runStatus === 'voided' || p.periodEnd < SIGN_OFF_FROM) return null;
  if (!ack) return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Not signed</span>;
  const when = new Date(ack.signedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  if (ack.status === 'confirmed') {
    return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800" title={`Signed by ${ack.signedName}, ${when}`}>Signed</span>;
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={`${ack.comment ?? ''}${ack.resolvedAt ? `\nReply: ${ack.resolutionNote ?? ''}` : ''}`}>
      {ack.resolvedAt ? 'Query answered' : 'Queried'}
    </span>
  );
}

export function useAckMap(payslips: PayslipRecord[]): Map<string, PayslipAcknowledgement> {
  const { data = [] } = usePayslipAcknowledgements(payslips.filter((p) => p.periodEnd >= SIGN_OFF_FROM).map((p) => p.id));
  return new Map(data.map((a) => [a.payslipId, a]));
}

export function PayslipTable({ payslips, showPeriod }: { payslips: PayslipRecord[]; showPeriod?: boolean }) {
  const acks = useAckMap(payslips);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">{showPeriod ? 'Period' : 'Employee'}</th>
            <th className="px-3 py-2 text-right">Days</th>
            <th className="px-3 py-2 text-right">Gross</th>
            <th className="px-3 py-2 text-right">Deductions</th>
            <th className="px-3 py-2 text-right">Net</th>
            <th className="px-3 py-2 text-left">Paid via</th>
            <th className="px-3 py-2 text-left">Employee sign-off</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payslips.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No payslips.</td></tr>
          )}
          {payslips.map((p) => (
            <tr key={p.id} className={p.runStatus === 'voided' ? 'text-gray-400 line-through' : ''}>
              <td className="px-3 py-2">
                {showPeriod
                  ? (p.runType === 'thirteenth_month' ? `13th month ${p.periodEnd.slice(0, 4)}` : `${p.periodStart} → ${p.periodEnd}`)
                  : p.employeeName}
                {p.warnings.length > 0 && <span className="ml-1 text-amber-600" title={p.warnings.join('\n')}>⚠</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{p.daysWorked}{p.leaveDays > 0 ? ` +${p.leaveDays}` : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.grossPay)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.totalDeductions)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(p.netPay)}</td>
              <td className="px-3 py-2 text-xs text-gray-600">
                {p.payments.map((x) => `${x.accountName ?? x.method} ${formatCurrency(x.amount)}${x.fee ? ` (+${formatCurrency(x.fee)} fee)` : ''}`).join(', ') || '—'}
              </td>
              <td className="px-3 py-2"><SignOffBadge p={p} ack={acks.get(p.id)} /></td>
              <td className="px-3 py-2 text-right">
                <button type="button" onClick={() => downloadPayslipPdf(p, acks.get(p.id))} className="text-xs font-medium text-teal-700 no-underline hover:underline">
                  PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunDetailModal({ runId, onClose, canVoid }: { runId: string | null; onClose: () => void; canVoid: boolean }) {
  const { data, isLoading } = usePayrollRun(runId);
  const voidRun = useVoidPayrollRun();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  function close() {
    setVoiding(false);
    setReason('');
    voidRun.reset();
    onClose();
  }

  const run = data?.run;
  const slips = data?.payslips ?? [];
  const acks = useAckMap(slips);
  const sum = (f: (p: PayslipRecord) => number) => slips.reduce((s, p) => s + f(p), 0);

  return (
    <Modal open={!!runId} onClose={close} title={run ? `Payroll ${runLabel(run)}` : 'Payroll run'} size="2xl">
      {isLoading || !run ? (
        <p className="py-8 text-center text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <StatusBadge status={run.status} />
            <span>Pay date <span className="font-medium text-gray-900">{run.payDate ?? run.periodEnd}</span></span>
            {run.runByName && <span>Run by {run.runByName}</span>}
            {run.status === 'voided' && (
              <span className="text-red-700">Voided{run.voidedByName ? ` by ${run.voidedByName}` : ''}: {run.voidReason}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['Gross', run.totalGross],
              ['Net paid', run.totalNet],
              ['Employee contributions', sum((p) => p.sss + p.philhealth + p.pagibig)],
              ['Employer contributions', run.totalEmployerContrib],
              ['Transfer fees', run.totalTransferFees],
            ].map(([label, v]) => (
              <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(Number(v))}</div>
              </div>
            ))}
          </div>

          <PayslipTable payslips={slips} />

          {voiding && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">
                Voiding reverses every journal in this run on today&apos;s date, puts timesheets back to Approved, restores cash advance
                balances and the vehicle allowance, and frees the period to be run again.
              </p>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (required)"
                className="mt-2 block w-full rounded-lg border border-red-300 px-3 py-2 text-sm"
              />
              {voidRun.error && <p className="mt-2 text-sm text-red-700">{(voidRun.error as Error).message}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setVoiding(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">Keep run</button>
                <button
                  type="button"
                  disabled={reason.trim().length < 3 || voidRun.isPending}
                  onClick={() => voidRun.mutate({ runId: run.id, reason: reason.trim() }, { onSuccess: () => setVoiding(false) })}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {voidRun.isPending ? 'Voiding...' : 'Void run'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2 border-t border-gray-200 pt-4">
            <div>
              {canVoid && run.status === 'posted' && !voiding && (
                <button type="button" onClick={() => setVoiding(true)} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                  Void run
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadPayslipsPdf(slips, runLabel(run), acks)}
                disabled={slips.length === 0}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Download all payslips
              </button>
              <button type="button" onClick={close} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function RunsTab({ storeId, onOpenRun }: { storeId: string; onOpenRun: (id: string) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: runs = [], isLoading } = usePayrollRuns(storeId, year);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-left">Pay date</th>
              <th className="px-3 py-2 text-right">Staff</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Run by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && runs.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No payroll runs in {year}.</td></tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} onClick={() => onOpenRun(r.id)} className={`cursor-pointer hover:bg-gray-50 ${r.status === 'voided' ? 'text-gray-400' : ''}`}>
                <td className="px-3 py-2 font-medium">{runLabel(r)}</td>
                <td className="px-3 py-2 tabular-nums">{r.payDate ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.employeeCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.totalGross)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(r.totalNet)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-gray-600">{r.runByName ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
