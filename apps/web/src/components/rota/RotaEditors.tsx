import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import {
  useSetRotaCells,
  useSetCoverOverride,
  useSetNinePmDuty,
  useSetRotaActuals,
  useSendToTimesheets,
  useTimesheetPreview,
  dayLabel,
  manilaToday,
  weekLabel,
  type RotaCell,
  type RotaCellEdit,
  type RotaPerson,
  type RotaWeek,
  type TimesheetPreviewLine,
} from '../../api/rota.js';

export const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';
export const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50';
export const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`;
export const btnGhost = `${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

type CellChoice = 'store' | 'custom' | 'day_off' | 'out_of_office' | 'reset';

function hoursLabel(start: string, end: string): string {
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  const a = h1 * 60 + m1;
  const b = h2 * 60 + m2;
  const mins = b > a ? b - a : b + 1440 - a;
  return `${Math.round((mins / 60) * 10) / 10}h${b <= a ? ' (past midnight)' : ''}`;
}

export function CellEditor({ week, target, onClose }: { week: RotaWeek; target: { person: RotaPerson; cell: RotaCell } | null; onClose: () => void }) {
  const setCells = useSetRotaCells();
  const setActuals = useSetRotaActuals();
  const cell = target?.cell;
  const initial: CellChoice = !cell?.kind ? 'reset'
    : cell.kind === 'working' ? (cell.isCustomTime ? 'custom' : 'store')
    : cell.kind === 'day_off' ? 'day_off' : 'out_of_office';
  const initialStart = cell?.startTime ?? week.settings.defaultStart;
  const initialEnd = cell?.endTime ?? week.settings.defaultEnd;
  const [choice, setChoice] = useState<CellChoice>(initial);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [note, setNote] = useState(cell?.note ?? '');
  const [reason, setReason] = useState('');
  const published = week.status !== 'draft';

  const timesheet = week.timesheets.find((t) => t.employeeId === cell?.employeeId && t.date === cell?.date);
  const ninePmDay = week.ninePm.find((n) => n.date === cell?.date);
  const isAssignee = !!ninePmDay && ninePmDay.assigneeId === cell?.employeeId;
  const canRecord = !!cell && cell.date <= manilaToday();
  const recordLocked = !!timesheet && timesheet.payrollStatus !== 'Pending';
  const plannedWorking = cell?.kind === 'working';
  const actualInit = {
    worked: !!cell?.actual?.startTime || (!cell?.actual && plannedWorking),
    start: cell?.actual?.startTime ?? timesheet?.timeIn ?? cell?.startTime ?? week.settings.defaultStart,
    end: cell?.actual?.endTime ?? timesheet?.timeOut ?? cell?.endTime ?? week.settings.defaultEnd,
    ninePm: cell?.actual?.ninePmReturns ?? timesheet?.ninePmReturnsCount ?? (isAssignee ? ninePmDay!.count : 0),
    note: cell?.actual?.note ?? '',
  };
  const [worked, setWorked] = useState(actualInit.worked);
  const [actStart, setActStart] = useState(actualInit.start);
  const [actEnd, setActEnd] = useState(actualInit.end);
  const [ninePm, setNinePm] = useState(actualInit.ninePm);
  const [actNote, setActNote] = useState(actualInit.note);

  if (!target) return null;

  const planChanged = choice !== initial
    || (choice === 'custom' && (start !== initialStart || end !== initialEnd))
    || ((choice === 'store' || choice === 'custom') && note.trim() !== (cell?.note ?? ''));
  const actualChanged = canRecord && !recordLocked && (
    worked !== actualInit.worked || ninePm !== actualInit.ninePm || actNote.trim() !== actualInit.note
    || (worked && (actStart !== actualInit.start || actEnd !== actualInit.end))
  );
  const busy = setCells.isPending || setActuals.isPending;
  const error = setCells.error ?? setActuals.error;
  const options: Array<{ id: CellChoice; label: string; hint: string }> = [
    { id: 'store', label: 'Working · store hours', hint: `${week.settings.defaultStart}–${week.settings.defaultEnd}` },
    { id: 'custom', label: 'Working · custom hours', hint: 'e.g. late returns' },
    { id: 'day_off', label: 'Day off', hint: 'Assigned by you' },
    { id: 'out_of_office', label: 'Out of office', hint: 'Working away from the shop' },
    ...(published ? [] : [{ id: 'reset' as const, label: 'Reset to default', hint: 'Store hours, or their approved pick' }]),
  ];

  async function save() {
    try {
      if (planChanged) {
        const edit: RotaCellEdit = {
          employeeId: target!.person.employeeId,
          date: target!.cell.date,
          kind: choice === 'store' || choice === 'custom' ? 'working' : choice === 'reset' ? null : choice,
          ...(choice === 'custom' ? { startTime: start, endTime: end } : {}),
          note: note.trim() || undefined,
        };
        await setCells.mutateAsync({ weekStart: week.weekStart, cells: [edit], reason: published ? reason : undefined });
      }
      if (actualChanged) {
        await setActuals.mutateAsync({
          weekStart: week.weekStart,
          employeeId: target!.person.employeeId,
          date: target!.cell.date,
          startTime: worked ? actStart : null,
          endTime: worked ? actEnd : null,
          ninePmReturns: ninePm,
          note: actNote.trim() || undefined,
        });
      }
      onClose();
    } catch {
      // The error is shown from the mutation state.
    }
  }

  function clearActuals() {
    setActuals.mutate({
      weekStart: week.weekStart, employeeId: target!.person.employeeId, date: target!.cell.date, startTime: null, endTime: null, ninePmReturns: 0,
    }, { onSuccess: onClose });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${target.person.name.split(' ')[0]} · ${dayLabel(target.cell.date)}`}
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          {cell?.actual && !recordLocked ? (
            <button type="button" disabled={busy} onClick={clearActuals} className="text-sm font-medium text-red-600 hover:underline">Clear hours</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={busy || (!planChanged && !actualChanged) || (planChanged && published && reason.trim().length < 3) || (choice === 'custom' && end <= start) || (worked && actStart === actEnd)}
              className={btnPrimary}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {canRecord && <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</p>}
        <div className="space-y-1.5">
          {options.map((o) => (
            <label key={o.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 ${choice === o.id ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="cell-choice" checked={choice === o.id} onChange={() => setChoice(o.id)} className="accent-teal-600" />
                <span className="text-sm font-medium text-gray-900">{o.label}</span>
              </span>
              <span className="text-xs text-gray-500">{o.hint}</span>
            </label>
          ))}
        </div>
        {choice === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-600">Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></label>
            <label className="text-xs font-medium text-gray-600">End<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></label>
          </div>
        )}
        {(choice === 'store' || choice === 'custom') && (
          <label className="block text-xs font-medium text-gray-600">Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Deliveries" className={inputCls} /></label>
        )}
        {published && planChanged && (
          <label className="block text-xs font-medium text-gray-600">
            Reason for the change (sent to {target.person.name.split(' ')[0]})
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Busy returns day" className={inputCls} />
          </label>
        )}

        {canRecord && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hours worked</p>
              {timesheet && <TimesheetStatusPill status={timesheet.payrollStatus} />}
            </div>
            {recordLocked ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {timesheet!.timeIn ? `${timesheet!.timeIn}–${timesheet!.timeOut}` : timesheet!.dayType}
                {timesheet!.ninePmReturnsCount > 0 && ` · ${timesheet!.ninePmReturnsCount} × 9pm`}
                <span className="mt-1 block text-xs text-gray-500">This timesheet is {timesheet!.payrollStatus.toLowerCase()}. Change it on the Timesheets page.</span>
              </p>
            ) : (
              <>
                {!plannedWorking && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={worked} onChange={(e) => setWorked(e.target.checked)} className="accent-teal-600" />
                    {cell?.kind === 'day_off' ? 'Worked on their day off (paid as Rest Day)' : 'Worked at the shop this day'}
                  </label>
                )}
                {worked && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-gray-600">Time in<input type="time" step={900} value={actStart} onChange={(e) => setActStart(e.target.value)} className={inputCls} /></label>
                    <label className="text-xs font-medium text-gray-600">Time out<input type="time" step={900} value={actEnd} onChange={(e) => setActEnd(e.target.value)} className={inputCls} /></label>
                  </div>
                )}
                {worked && actStart !== actEnd && <p className="text-xs text-gray-500">{hoursLabel(actStart, actEnd)}</p>}
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <label className="text-xs font-medium text-gray-600">9pm returns<input type="number" min={0} max={50} value={ninePm} onChange={(e) => setNinePm(Math.max(0, Number(e.target.value) || 0))} className={inputCls} /></label>
                  <label className="text-xs font-medium text-gray-600">Timesheet note<input value={actNote} onChange={(e) => setActNote(e.target.value)} maxLength={200} placeholder="e.g. Stayed late for a return" className={inputCls} /></label>
                </div>
                {isAssignee && ninePmDay!.count > 0 && <p className="text-xs text-indigo-700">On 9pm returns: {ninePmDay!.count} booked that day.</p>}
                <p className="text-xs text-gray-500">Saved on the rota. Use “Send to timesheets” under the grid to submit it for approval.</p>
              </>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      </div>
    </Modal>
  );
}

const ACTION_STYLE: Record<TimesheetPreviewLine['action'], [string, string]> = {
  create: ['bg-teal-100 text-teal-800', 'New'],
  update: ['bg-blue-100 text-blue-800', 'Update'],
  skip: ['bg-gray-100 text-gray-600', 'Skip'],
};

export function SendToTimesheetsModal({ week, onClose }: { week: RotaWeek; onClose: () => void }) {
  const { data: lines = [], isLoading, error } = useTimesheetPreview(week.weekStart, true);
  const send = useSendToTimesheets();
  const [showSkipped, setShowSkipped] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const toWrite = lines.filter((l) => l.action !== 'skip');
  const visible = showSkipped ? lines : toWrite;
  const dates = [...new Set(visible.map((l) => l.date))];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Send ${weekLabel(week.weekStart)} to timesheets`}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showSkipped} onChange={(e) => setShowSkipped(e.target.checked)} className="accent-teal-600" />
            Show skipped ({lines.length - toWrite.length})
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>{result ? 'Done' : 'Cancel'}</button>
            {!result && (
              <button
                type="button"
                disabled={toWrite.length === 0 || send.isPending}
                onClick={() => send.mutate({ weekStart: week.weekStart }, { onSuccess: (r) => setResult({ created: r.created, updated: r.updated }) })}
                className={btnPrimary}
              >
                {send.isPending ? 'Sending…' : `Send ${toWrite.length} row${toWrite.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {result ? (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            {result.created} new and {result.updated} updated timesheet{result.created + result.updated === 1 ? '' : 's'} sent for approval. Approve them on the Timesheets page.
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Days up to today. Hours entered on a card are used; otherwise the planned hours. Rows that are already approved or paid are never changed.
          </p>
        )}
        {isLoading && <p className="py-6 text-center text-sm text-gray-500">Checking the week…</p>}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
        {!isLoading && !result && visible.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Nothing new to send. Everything is already on timesheets.</p>}
        {!result && dates.map((d) => (
          <div key={d}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{dayLabel(d)}</p>
            <table className="w-full text-sm">
              <tbody>
                {visible.filter((l) => l.date === d).map((l) => {
                  const [cls, label] = ACTION_STYLE[l.action];
                  return (
                    <tr key={`${l.employeeId}|${l.date}`} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 font-medium text-gray-900">{l.name.split(' ')[0]}</td>
                      <td className="py-1.5 pr-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span></td>
                      <td className="py-1.5 pr-2 text-gray-700">{l.row ? `${l.row.dayType}${l.row.timeIn ? ` · ${l.row.timeIn}–${l.row.timeOut}` : ''}` : ''}</td>
                      <td className="py-1.5 pr-2 text-gray-700">{l.row && l.row.ninePmReturnsCount > 0 ? `${l.row.ninePmReturnsCount} × 9pm` : ''}</td>
                      <td className="py-1.5 text-xs text-gray-500">{l.reason ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {send.error && <p className="text-sm text-red-600">{(send.error as Error).message}</p>}
      </div>
    </Modal>
  );
}

export function TimesheetStatusPill({ status }: { status: 'Pending' | 'Approved' | 'Paid' }) {
  const cls = status === 'Pending' ? 'bg-amber-100 text-amber-800' : status === 'Approved' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{status === 'Pending' ? 'Sent · pending' : status}</span>;
}

export function CoverOverrideModal({ week, date, onClose }: { week: RotaWeek; date: string | null; onClose: () => void }) {
  const setOverride = useSetCoverOverride();
  const existing = week.coverOverrides.find((o) => o.date === date);
  const cover = week.cover.find((c) => c.date === date);
  const [reason, setReason] = useState(existing?.reason ?? '');
  if (!date || !cover) return null;
  return (
    <Modal open onClose={onClose} title={`Cover on ${dayLabel(date)}`} size="sm">
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          <b>{cover.working}</b> working, minimum is <b>{cover.required}</b>.
          {cover.working >= cover.required && ' This day is fully covered.'}
        </p>
        {existing ? (
          <>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Emergency cover approved by {existing.approvedByName}: “{existing.reason}”</p>
            <button type="button" disabled={setOverride.isPending} onClick={() => setOverride.mutate({ date, reason: null }, { onSuccess: onClose })} className={btnGhost}>Remove emergency cover</button>
          </>
        ) : cover.working < cover.required ? (
          <>
            <p className="text-sm text-gray-600">
              Only allow this in a genuine emergency. The shop can run on {week.settings.emergencyMinStaff} with an approved reason, and it&apos;s recorded in the history.
            </p>
            <label className="block text-xs font-medium text-gray-600">Emergency reason<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputCls} placeholder="e.g. Ronnie in hospital" /></label>
            <button type="button" disabled={reason.trim().length < 3 || setOverride.isPending} onClick={() => setOverride.mutate({ date, reason }, { onSuccess: onClose })} className={`${btn} bg-amber-500 text-white hover:bg-amber-600`}>
              Approve emergency cover
            </button>
          </>
        ) : null}
        {setOverride.error && <p className="text-sm text-red-600">{(setOverride.error as Error).message}</p>}
      </div>
    </Modal>
  );
}

export function NinePmModal({ week, date, onClose }: { week: RotaWeek; date: string; onClose: () => void }) {
  const setDuty = useSetNinePmDuty();
  const day = week.ninePm.find((n) => n.date === date);
  const cells = new Map(week.cells.map((c) => [`${c.employeeId}|${c.date}`, c]));
  const working = week.people.filter((p) => cells.get(`${p.employeeId}|${date}`)?.kind === 'working');
  const notWorking = week.people.filter((p) => cells.get(`${p.employeeId}|${date}`)?.kind !== 'working');
  const [choice, setChoice] = useState(day?.assigneeId ?? working[0]?.employeeId ?? '');

  return (
    <Modal
      open
      onClose={onClose}
      title={`9pm returns · ${dayLabel(date)}`}
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          {day?.assigneeId ? (
            <button type="button" disabled={setDuty.isPending} onClick={() => setDuty.mutate({ date, employeeId: null }, { onSuccess: onClose })} className="text-sm font-medium text-red-600 hover:underline">Remove</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="button" disabled={!choice || setDuty.isPending || choice === day?.assigneeId} onClick={() => setDuty.mutate({ date, employeeId: choice }, { onSuccess: onClose })} className={btnPrimary}>
              {setDuty.isPending ? 'Saving…' : 'Assign'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {day && day.bookings.length > 0 ? (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {day.bookings.map((b) => (
              <li key={b.ref} className="px-3 py-2 text-sm">
                <span className="font-semibold text-gray-900">{b.ref}</span>
                {b.customer && <span className="text-gray-600"> · {b.customer}</span>}
                {b.vehicle && <div className="text-xs text-gray-500">{b.vehicle}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No 9pm returns booked for this day yet.</p>
        )}
        <div>
          <p className="mb-1.5 text-xs font-medium text-gray-600">Who handles them? They get a Telegram message.</p>
          <div className="space-y-1.5">
            {working.map((p) => (
              <label key={p.employeeId} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${choice === p.employeeId ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="nine-pm" checked={choice === p.employeeId} onChange={() => setChoice(p.employeeId)} className="accent-indigo-600" />
                <span className="text-sm font-medium text-gray-900">{p.name}</span>
                {p.mode === 'self_managed' && <span className="text-xs text-gray-500">self-managed</span>}
              </label>
            ))}
            {working.length === 0 && <p className="text-sm text-red-600">Nobody is working that day.</p>}
          </div>
          {notWorking.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">Not working: {notWorking.map((p) => p.name.split(' ')[0]).join(', ')}. Change their day to working first if they&apos;re coming in for it.</p>
          )}
        </div>
        {setDuty.error && <p className="text-sm text-red-600">{(setDuty.error as Error).message}</p>}
      </div>
    </Modal>
  );
}
