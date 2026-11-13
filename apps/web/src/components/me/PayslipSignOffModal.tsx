import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { SignaturePad } from './SignaturePad.js';
import { useAcknowledgePayslip, type MyPayslip } from '../../api/me.js';
import { formatCurrency } from '../../utils/currency.js';
import { downloadPayslipPdf, unpaidLeaveDays } from '../../utils/payslipPdf.js';

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${muted ? 'text-gray-500' : 'text-gray-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

export function PayslipBreakdown({ p }: { p: MyPayslip }) {
  const unpaid = unpaidLeaveDays(p);
  const thirteenth = p.runType === 'thirteenth_month';
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Earnings</div>
        {thirteenth ? (
          <Row label="13th month pay" value={p.grossPay} />
        ) : (
          <>
            <Row label={`Basic pay (${p.daysWorked} day${p.daysWorked === 1 ? '' : 's'})`} value={p.basicPay} />
            {p.leavePay > 0 && <Row label={`Paid leave (${p.leaveDays} day${p.leaveDays === 1 ? '' : 's'})`} value={p.leavePay} />}
            {unpaid > 0 && <Row label={`Unpaid leave (${unpaid} day${unpaid === 1 ? '' : 's'})`} value={0} muted />}
            {p.overtimePay > 0 && <Row label={`Overtime (${p.overtimeHours} h)`} value={p.overtimePay} />}
            {p.holidayPremium > 0 && <Row label={`Holiday premium (${p.holidayDays} day${p.holidayDays === 1 ? '' : 's'})`} value={p.holidayPremium} />}
            {p.ninePmEarnings > 0 && <Row label={`9pm returns (${p.ninePmCount})`} value={p.ninePmEarnings} />}
            {p.commission > 0 && <Row label={`Commission (${p.commissionRate}% of Peace of Mind sales)`} value={p.commission} />}
            {p.tips > 0 && <Row label={`Tips (pool shared by ${p.tipsHeadcount})`} value={p.tips} />}
            {p.bonuses > 0 && <Row label="Bonus" value={p.bonuses} />}
          </>
        )}
        <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 text-sm font-semibold text-gray-900">
          <span>Gross pay</span><span className="tabular-nums">{formatCurrency(p.grossPay)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</div>
        {p.sss > 0 && <Row label="SSS" value={p.sss} />}
        {p.philhealth > 0 && <Row label="PhilHealth" value={p.philhealth} />}
        {p.pagibig > 0 && <Row label="Pag-IBIG" value={p.pagibig} />}
        {p.ninePmPrepaid > 0 && <Row label="9pm returns already paid from the till" value={p.ninePmPrepaid} />}
        {p.cashAdvanceDeduction > 0 && <Row label="Cash advance repayment" value={p.cashAdvanceDeduction} />}
        {p.totalDeductions === 0 && <p className="py-1 text-sm text-gray-500">None</p>}
        <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 text-sm font-semibold text-gray-900">
          <span>Total deductions</span><span className="tabular-nums">{formatCurrency(p.totalDeductions)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-teal-50 px-4 py-3">
        <span className="text-sm font-semibold text-teal-900">Net pay</span>
        <span className="text-xl font-bold tabular-nums text-teal-900">{formatCurrency(p.netPay)}</span>
      </div>

      {p.payments.length > 0 && (
        <div className="text-sm text-gray-600">
          Paid via {p.payments.map((x) => `${x.accountName ?? x.method} ${formatCurrency(x.amount)}`).join(', ')}
        </div>
      )}
    </div>
  );
}

export function PayslipSignOffModal({ payslip, defaultName, onClose }: { payslip: MyPayslip | null; defaultName: string; onClose: () => void }) {
  const ack = useAcknowledgePayslip();
  const [mode, setMode] = useState<'confirm' | 'dispute'>('confirm');
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState(defaultName);
  const [signature, setSignature] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!payslip) return;
    setMode('confirm');
    setAgreed(false);
    setName(defaultName);
    setSignature(null);
    setComment('');
    ack.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payslip?.id]);

  if (!payslip) return null;
  const existing = payslip.acknowledgement;
  const locked = existing?.status === 'confirmed';
  const canSubmit = mode === 'confirm'
    ? agreed && name.trim().length >= 2 && !!signature
    : name.trim().length >= 2 && comment.trim().length > 0;

  function submit() {
    if (!payslip) return;
    ack.mutate(
      {
        payslipId: payslip.id,
        status: mode === 'confirm' ? 'confirmed' : 'disputed',
        signedName: name.trim(),
        signaturePng: mode === 'confirm' ? signature ?? undefined : undefined,
        comment: mode === 'dispute' ? comment.trim() : undefined,
      },
      { onSuccess: onClose },
    );
  }

  const period = payslip.runType === 'thirteenth_month'
    ? `13th month ${payslip.periodEnd.slice(0, 4)}`
    : `${payslip.periodStart} to ${payslip.periodEnd}`;

  return (
    <Modal open onClose={onClose} title={`Payslip ${period}`} size="lg">
      <div className="space-y-4">
        <PayslipBreakdown p={payslip} />

        {locked && existing && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            You signed this payslip on {new Date(existing.signedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}.
            {existing.signaturePng && <img src={existing.signaturePng} alt="Your signature" className="mt-2 h-14 rounded bg-white" />}
          </div>
        )}

        {existing?.status === 'disputed' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">You queried this payslip: {existing.comment}</p>
            {existing.resolvedAt
              ? <p className="mt-1">Reply from {existing.resolvedByName ?? 'your manager'}: {existing.resolutionNote}. If you're happy now, sign below.</p>
              : <p className="mt-1">A manager will look into it. You can still sign once it's sorted.</p>}
          </div>
        )}

        {!locked && (
          <div className="space-y-3 border-t border-gray-200 pt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('confirm')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === 'confirm' ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-gray-300 text-gray-600'}`}
              >
                Everything is correct
              </button>
              <button
                type="button"
                onClick={() => setMode('dispute')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === 'dispute' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-300 text-gray-600'}`}
              >
                Something is wrong
              </button>
            </div>

            {mode === 'confirm' ? (
              <>
                <label className="flex items-start gap-2 text-sm text-gray-800">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                  <span>
                    I confirm I have received <span className="font-semibold">{formatCurrency(payslip.netPay)}</span> and that the details on this payslip are correct.
                  </span>
                </label>
                <SignaturePad onChange={setSignature} />
              </>
            ) : (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="What looks wrong? For example: missing a day on the 12th, or I didn't receive the GCash transfer."
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {ack.error && <p className="text-sm text-red-600">{(ack.error as Error).message}</p>}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => downloadPayslipPdf(payslip, existing)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Download PDF
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">Close</button>
            {!locked && (
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit || ack.isPending}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${mode === 'confirm' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {ack.isPending ? 'Saving...' : mode === 'confirm' ? 'Sign payslip' : 'Send query'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
