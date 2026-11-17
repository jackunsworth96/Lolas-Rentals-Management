import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import {
  useSetRotaCells,
  useSetCoverOverride,
  useSetNinePmDuty,
  dayLabel,
  type RotaCell,
  type RotaCellEdit,
  type RotaPerson,
  type RotaWeek,
} from '../../api/rota.js';

export const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';
export const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50';
export const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`;
export const btnGhost = `${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

type CellChoice = 'store' | 'custom' | 'day_off' | 'out_of_office' | 'reset';

export function CellEditor({ week, target, onClose }: { week: RotaWeek; target: { person: RotaPerson; cell: RotaCell } | null; onClose: () => void }) {
  const setCells = useSetRotaCells();
  const cell = target?.cell;
  const initial: CellChoice = !cell?.kind ? 'reset'
    : cell.kind === 'working' ? (cell.isCustomTime ? 'custom' : 'store')
    : cell.kind === 'day_off' ? 'day_off' : 'out_of_office';
  const [choice, setChoice] = useState<CellChoice>(initial);
  const [start, setStart] = useState(cell?.startTime ?? week.settings.defaultStart);
  const [end, setEnd] = useState(cell?.endTime ?? week.settings.defaultEnd);
  const [note, setNote] = useState(cell?.note ?? '');
  const [reason, setReason] = useState('');
  const published = week.status !== 'draft';

  if (!target) return null;
  const options: Array<{ id: CellChoice; label: string; hint: string }> = [
    { id: 'store', label: 'Working · store hours', hint: `${week.settings.defaultStart}–${week.settings.defaultEnd}` },
    { id: 'custom', label: 'Working · custom hours', hint: 'e.g. late returns' },
    { id: 'day_off', label: 'Day off', hint: 'Assigned by you' },
    { id: 'out_of_office', label: 'Out of office', hint: 'Working away from the shop' },
    ...(published ? [] : [{ id: 'reset' as const, label: 'Reset to default', hint: 'Store hours, or their approved pick' }]),
  ];

  function save() {
    const edit: RotaCellEdit = {
      employeeId: target!.person.employeeId,
      date: target!.cell.date,
      kind: choice === 'store' || choice === 'custom' ? 'working' : choice === 'reset' ? null : choice,
      ...(choice === 'custom' ? { startTime: start, endTime: end } : {}),
      note: note.trim() || undefined,
    };
    setCells.mutate({ weekStart: week.weekStart, cells: [edit], reason: published ? reason : undefined }, { onSuccess: onClose });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${target.person.name.split(' ')[0]} · ${dayLabel(target.cell.date)}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="button" onClick={save} disabled={setCells.isPending || (published && reason.trim().length < 3) || (choice === 'custom' && end <= start)} className={btnPrimary}>
            {setCells.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
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
        {published && (
          <label className="block text-xs font-medium text-gray-600">
            Reason for the change (sent to {target.person.name.split(' ')[0]})
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Busy returns day" className={inputCls} />
          </label>
        )}
        {setCells.error && <p className="text-sm text-red-600">{(setCells.error as Error).message}</p>}
      </div>
    </Modal>
  );
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
