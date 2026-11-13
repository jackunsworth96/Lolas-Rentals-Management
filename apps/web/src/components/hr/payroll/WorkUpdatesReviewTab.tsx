import { useMemo, useState } from 'react';
import { useWorkUpdates, useCommentWorkUpdate, type WorkUpdate } from '../../../api/me.js';
import { WorkUpdateBody, weekLabel } from '../../me/WorkUpdatesTab.js';

function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

function ReplyBox({ u }: { u: WorkUpdate }) {
  const comment = useCommentWorkUpdate();
  const [text, setText] = useState('');
  if (u.managerComment) return null;
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => { e.preventDefault(); comment.mutate({ id: u.id, comment: text }, { onSuccess: () => setText('') }); }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Reply or feedback (closes the week)"
        className="min-w-[14rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />
      <button type="submit" disabled={!text.trim() || comment.isPending} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
        Reply
      </button>
      {comment.error && <p className="w-full text-sm text-red-600">{(comment.error as Error).message}</p>}
    </form>
  );
}

export function WorkUpdatesReviewTab({ storeId, fixedStaff }: { storeId: string; fixedStaff: Array<{ id: string; fullName: string }> }) {
  const [employeeId, setEmployeeId] = useState('');
  const { data: updates = [], isLoading, error } = useWorkUpdates(storeId, employeeId || undefined);
  const lastWeek = useMemo(() => {
    const d = new Date(`${weekStartOf(manilaToday())}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const missingLastWeek = fixedStaff.filter((e) => !updates.some((u) => u.employeeId === e.id && u.weekStart === lastWeek));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Weekly updates from staff on a fixed salary, in place of shop timesheets.</p>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Everyone</option>
          {fixedStaff.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>
      </div>
      {!employeeId && missingLastWeek.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No update for last week ({weekLabel(lastWeek)}) from {missingLastWeek.map((e) => e.fullName).join(', ')}.
        </p>
      )}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
        {error && <p className="p-4 text-sm text-red-600">{(error as Error).message}</p>}
        {!isLoading && updates.length === 0 && <p className="p-4 text-sm text-gray-500">No updates yet.</p>}
        {updates.map((u) => (
          <div key={u.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">{u.employeeName} · week of {weekLabel(u.weekStart)}</div>
              <div className="text-xs text-gray-500">Sent {new Date(u.submittedAt).toLocaleDateString('en-PH')}</div>
            </div>
            <WorkUpdateBody u={u} />
            <ReplyBox u={u} />
          </div>
        ))}
      </div>
    </div>
  );
}
