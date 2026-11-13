import { useState } from 'react';
import { Modal } from '../../common/Modal.js';
import {
  useStaffRequests,
  useReviewLeave,
  useReviewAdvance,
  useResolveDispute,
  LEAVE_TYPE_LABEL,
  PAYDAY_LABEL,
  type LeaveRequest,
  type AdvanceRequest,
  type PayslipAcknowledgement,
  type PaydayType,
  type RequestStatus,
} from '../../../api/me.js';
import { usePaymentAccounts } from '../../../api/payroll.js';
import { formatCurrency } from '../../../utils/currency.js';

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const STATUS_CLS: Record<RequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

type Review =
  | { kind: 'leave'; item: LeaveRequest; action: 'approve' | 'reject' }
  | { kind: 'advance'; item: AdvanceRequest; action: 'approve' | 'reject' }
  | { kind: 'dispute'; item: PayslipAcknowledgement };

function ReviewModal({ review, storeId, onClose }: { review: Review | null; storeId: string; onClose: () => void }) {
  const leave = useReviewLeave();
  const advance = useReviewAdvance();
  const resolve = useResolveDispute();
  const { data: accounts = [] } = usePaymentAccounts(review?.kind === 'advance' ? review.item.storeId || storeId : '');
  const [note, setNote] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [deductOn, setDeductOn] = useState<PaydayType | ''>('');

  function close() {
    setNote('');
    setCashAccountId('');
    setDeductOn('');
    leave.reset();
    advance.reset();
    resolve.reset();
    onClose();
  }

  if (!review) return null;
  const pending = leave.isPending || advance.isPending || resolve.isPending;
  const error = (leave.error ?? advance.error ?? resolve.error) as Error | null;
  const approving = review.kind !== 'dispute' && review.action === 'approve';
  const cashAccount = cashAccountId || accounts.find((a) => a.method === 'cash')?.id || accounts[0]?.id || '';

  function submit() {
    if (!review) return;
    if (review.kind === 'leave') {
      leave.mutate({ id: review.item.id, action: review.action, note: note.trim() || undefined }, { onSuccess: close });
    } else if (review.kind === 'advance') {
      advance.mutate(
        {
          id: review.item.id,
          action: review.action,
          note: note.trim() || undefined,
          cashAccountId: review.action === 'approve' ? cashAccount : undefined,
          deductOn: review.action === 'approve' && deductOn ? deductOn : undefined,
        },
        { onSuccess: close },
      );
    } else {
      resolve.mutate({ id: review.item.id, note: note.trim() }, { onSuccess: close });
    }
  }

  const title = review.kind === 'dispute'
    ? `Payslip query from ${review.item.employeeName}`
    : `${review.action === 'approve' ? 'Approve' : 'Reject'} ${review.kind === 'leave' ? 'leave' : 'cash advance'} for ${review.item.employeeName}`;

  return (
    <Modal open onClose={close} title={title} size="md">
      <div className="space-y-3 text-sm">
        {review.kind === 'leave' && (
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="font-medium text-gray-900">{LEAVE_TYPE_LABEL[review.item.leaveType]} · {review.item.days} day{review.item.days === 1 ? '' : 's'}</div>
            <div className="text-gray-600">{review.item.dates.map(fmtDate).join(', ')}</div>
            {review.item.reason && <div className="mt-1 text-gray-600">&ldquo;{review.item.reason}&rdquo;</div>}
            {review.action === 'approve' && (
              <p className="mt-2 text-xs text-gray-500">
                Approving adds an approved {review.item.leaveType === 'unpaid' ? 'unpaid (no pay)' : 'paid'} leave timesheet for each day and updates their balance.
              </p>
            )}
          </div>
        )}
        {review.kind === 'advance' && (
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="font-medium text-gray-900">{formatCurrency(review.item.amount)}</div>
            <div className="text-gray-600">Asked to repay on the {PAYDAY_LABEL[review.item.paydayType]} payslip</div>
            {review.item.reason && <div className="mt-1 text-gray-600">&ldquo;{review.item.reason}&rdquo;</div>}
          </div>
        )}
        {review.kind === 'advance' && approving && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">Paid out from</label>
              <select value={cashAccount} onChange={(e) => setCashAccountId(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Deduct on</label>
              <select value={deductOn || review.item.paydayType} onChange={(e) => setDeductOn(e.target.value as PaydayType)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">
                {(Object.keys(PAYDAY_LABEL) as PaydayType[]).map((p) => <option key={p} value={p}>{PAYDAY_LABEL[p]} payslip</option>)}
              </select>
            </div>
            <p className="col-span-2 text-xs text-gray-500">This records the cash leaving the account now and schedules the repayment.</p>
          </div>
        )}
        {review.kind === 'dispute' && (
          <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
            <div className="font-medium">Net pay on payslip: {formatCurrency(review.item.netPay)}</div>
            <div className="mt-1">&ldquo;{review.item.comment}&rdquo;</div>
            <p className="mt-2 text-xs">If pay was wrong, void and re-run the payroll (or pay the difference), then reply here. The employee can sign once they&apos;re happy.</p>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600">
            {review.kind === 'dispute' ? 'Reply to the employee (required)' : 'Note to the employee (optional)'}
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" />
        </div>
        {error && <p className="text-red-600">{error.message}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
          <button type="button" onClick={close} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || (review.kind === 'dispute' && !note.trim()) || (review.kind === 'advance' && approving && !cashAccount)}
            className={`rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${
              review.kind !== 'dispute' && review.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {pending ? 'Saving...' : review.kind === 'dispute' ? 'Send reply' : review.action === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function RequestsTab({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState<RequestStatus | 'all'>('pending');
  const { data, isLoading, error } = useStaffRequests(status, storeId);
  const [review, setReview] = useState<Review | null>(null);
  const leave = data?.leave ?? [];
  const advances = data?.advances ?? [];
  const disputes = data?.disputes ?? [];

  const actionBtns = (onApprove: () => void, onReject: () => void) => (
    <div className="flex gap-2">
      <button type="button" onClick={onReject} className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Reject</button>
      <button type="button" onClick={onApprove} className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700">Approve</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <select value={status} onChange={(e) => setStatus(e.target.value as RequestStatus | 'all')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="pending">Waiting for a decision</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

      {disputes.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Payslip queries</h3>
          <div className="divide-y divide-gray-100 rounded-lg border border-amber-200 bg-white">
            {disputes.map((d) => (
              <div key={d.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="text-sm">
                  <div className="font-medium text-gray-900">{d.employeeName} · {formatCurrency(d.netPay)}</div>
                  <div className="text-gray-600">&ldquo;{d.comment}&rdquo;</div>
                  {d.resolvedAt && <div className="mt-1 text-xs text-gray-500">Replied by {d.resolvedByName}: {d.resolutionNote}</div>}
                </div>
                {!d.resolvedAt && (
                  <button type="button" onClick={() => setReview({ kind: 'dispute', item: d })} className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700">
                    Reply
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Leave</h3>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
          {!isLoading && leave.length === 0 && <p className="p-4 text-sm text-gray-500">No leave requests.</p>}
          {leave.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
              <div className="text-sm">
                <div className="font-medium text-gray-900">
                  {r.employeeName} · {LEAVE_TYPE_LABEL[r.leaveType]} · {r.days} day{r.days === 1 ? '' : 's'}
                </div>
                <div className="text-gray-600">
                  {r.startDate === r.endDate ? fmtDate(r.startDate) : `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}`}
                  {r.reason ? ` · ${r.reason}` : ''}
                </div>
                {r.reviewedByName && <div className="mt-1 text-xs text-gray-500">{r.status} by {r.reviewedByName}{r.reviewNote ? `: ${r.reviewNote}` : ''}</div>}
              </div>
              {r.status === 'pending'
                ? actionBtns(() => setReview({ kind: 'leave', item: r, action: 'approve' }), () => setReview({ kind: 'leave', item: r, action: 'reject' }))
                : <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CLS[r.status]}`}>{r.status}</span>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Cash advances</h3>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
          {!isLoading && advances.length === 0 && <p className="p-4 text-sm text-gray-500">No advance requests.</p>}
          {advances.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
              <div className="text-sm">
                <div className="font-medium text-gray-900">{r.employeeName} · {formatCurrency(r.amount)}</div>
                <div className="text-gray-600">
                  Repay on the {PAYDAY_LABEL[r.paydayType]} payslip · asked {new Date(r.createdAt).toLocaleDateString('en-PH')}
                  {r.reason ? ` · ${r.reason}` : ''}
                </div>
                {r.reviewedByName && <div className="mt-1 text-xs text-gray-500">{r.status} by {r.reviewedByName}{r.reviewNote ? `: ${r.reviewNote}` : ''}</div>}
              </div>
              {r.status === 'pending'
                ? actionBtns(() => setReview({ kind: 'advance', item: r, action: 'approve' }), () => setReview({ kind: 'advance', item: r, action: 'reject' }))
                : <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CLS[r.status]}`}>{r.status}</span>}
            </div>
          ))}
        </div>
      </section>

      <ReviewModal review={review} storeId={storeId} onClose={() => setReview(null)} />
    </div>
  );
}
