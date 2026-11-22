import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Users } from 'lucide-react';
import {
  useMyRota,
  useRotaWeek,
  useSaveMyPicks,
  addDays,
  dayLabel,
  dayNum,
  dayShort,
  isOffCell,
  manilaToday,
  to12h,
  weekLabel,
  weekStartOf,
  type RotaCell,
  type RotaPerson,
  type RotaWeek,
} from '../../api/rota.js';
import { RotaChip, RotaGrid } from './RotaGrid.js';
import { CellEditor, CoverOverrideModal, NinePmModal } from './RotaEditors.js';

function StatusPill({ week }: { week: RotaWeek }) {
  if (week.status === 'published' || week.status === 'locked') {
    return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Published</span>;
  }
  if (week.picking.open) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Picking open</span>;
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Draft – may change</span>;
}

function DayOffPicker({ week, meId }: { week: RotaWeek; meId: string }) {
  const save = useSaveMyPicks();
  const me = week.people.find((p) => p.employeeId === meId)!;
  const maxPicks = Math.max(1, 7 - me.targetDaysPerWeek);
  const myLive = useMemo(
    () => week.picks.filter((p) => p.employeeId === meId && (p.status === 'pending' || p.status === 'approved')),
    [week.picks, meId],
  );
  const serverPicks = myLive.map((p) => p.date).sort().join(',');
  const [selected, setSelected] = useState<string[]>(() => myLive.map((p) => p.date));
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setSelected(serverPicks ? serverPicks.split(',') : []); }, [serverPicks]);
  const isApprover = week.settings.approverIds.includes(meId);

  const cells = new Map(week.cells.map((c) => [`${c.employeeId}|${c.date}`, c]));
  const takenBy = (date: string) => week.people
    .filter((p) => p.employeeId !== meId && p.mode === 'rostered' && isOffCell(cells.get(`${p.employeeId}|${date}`)))
    .map((p) => p.name.split(' ')[0]);
  const myLeave = (date: string) => cells.get(`${meId}|${date}`)?.source === 'leave';
  const notStarted = (date: string) => cells.get(`${meId}|${date}`)?.kind === 'not_started';
  const clash = selected.some((d) => !myLive.some((p) => p.date === d) && takenBy(d).length >= week.settings.maxOffPerDay);
  const declined = week.picks.filter((p) => p.employeeId === meId && p.status === 'declined');
  const dirty = [...selected].sort().join(',') !== serverPicks;

  function toggle(date: string) {
    setSaved(false);
    setSelected((prev) => {
      if (prev.includes(date)) return prev.filter((d) => d !== date);
      return maxPicks === 1 ? [date] : prev.length < maxPicks ? [...prev, date] : prev;
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <b>Pick your day off</b> for {weekLabel(week.weekStart)}.{' '}
        {week.picking.isLate
          ? 'Picking day has passed, so your manager will see this as a late pick.'
          : `Please pick by ${dayLabel(week.picking.pickDay)}. First come, first served.`}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {week.dates.map((d) => {
          const others = takenBy(d);
          const mine = selected.includes(d);
          const status = myLive.find((p) => p.date === d)?.status;
          const leave = myLeave(d);
          const before = notStarted(d);
          const full = others.length >= week.settings.maxOffPerDay;
          return (
            <button
              key={d}
              type="button"
              disabled={leave || before}
              onClick={() => toggle(d)}
              className={`flex min-h-[84px] flex-col items-center justify-between rounded-xl border px-1 py-2 text-center transition ${
                mine ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                : leave || before ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                : full ? 'border-gray-200 bg-gray-50 text-gray-500 hover:border-amber-300'
                : 'border-gray-200 bg-white text-gray-800 hover:border-teal-400'
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{dayShort(d)}</span>
              <span className="text-lg font-bold leading-none">{dayNum(d)}</span>
              <span className="text-[10px] leading-tight">
                {before ? 'Not started'
                  : leave ? 'On leave'
                  : mine ? (status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending' : 'Selected')
                  : others.length ? `Taken · ${others.join(', ')}` : 'Free'}
              </span>
            </button>
          );
        })}
      </div>

      {declined.length > 0 && (
        <div className="space-y-1">
          {declined.map((p) => (
            <p key={p.id} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {dayLabel(p.date)} wasn&apos;t approved{p.decisionNote ? `: ${p.decisionNote}` : ''}. Please pick another day.
            </p>
          ))}
        </div>
      )}

      {(clash || dirty) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {clash && (
            <label className="flex-1 text-xs font-medium text-gray-600">
              Someone already has that day. Why do you need it?
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. family event" />
            </label>
          )}
          <button
            type="button"
            disabled={!dirty || save.isPending || (clash && note.trim().length < 3)}
            onClick={() => save.mutate(
              { weekStart: week.weekStart, dates: selected, note: note.trim() || undefined },
              { onSuccess: () => { setSaved(true); setNote(''); } },
            )}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {save.isPending ? 'Sending…' : selected.length === 0 ? 'Clear my pick' : 'Send my pick'}
          </button>
        </div>
      )}
      {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
      {saved && !dirty && (
        <p className="text-sm text-green-700">
          {isApprover ? 'Saved and approved.' : 'Sent. Your manager will review it and you’ll get a Telegram message.'}
        </p>
      )}
    </div>
  );
}

export function MyRotaCard({ meId }: { meId: string }) {
  const thisWeek = weekStartOf(manilaToday());
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [team, setTeam] = useState(false);
  const { data: week, isLoading, error } = useMyRota(weekStart);
  const nextWeekStart = addDays(thisWeek, 7);
  const { data: nextWeek } = useMyRota(nextWeekStart);
  const today = manilaToday();
  const pickDue = !!nextWeek && weekStart !== nextWeekStart && nextWeek.picking.open
    && nextWeek.people.some((p) => p.employeeId === meId && p.mode === 'rostered')
    && !nextWeek.picks.some((p) => p.employeeId === meId && (p.status === 'pending' || p.status === 'approved'));

  const me = week?.people.find((p) => p.employeeId === meId);
  const myCells = week ? week.dates.map((d) => week.cells.find((c) => c.employeeId === meId && c.date === d)) : [];
  const next = myCells.find((c) => c?.kind === 'working' && c.date >= today);
  const myNinePm = (week?.ninePm ?? []).filter((n) => n.assigneeId === meId).map((n) => n.date);
  const approver = !!week?.canApprove;
  const { data: managerWeek, error: managerError } = useRotaWeek(weekStart, approver);
  const editWeek = approver && managerWeek?.weekStart === weekStart && managerWeek.status !== 'locked' ? managerWeek : undefined;
  const [editing, setEditing] = useState<{ person: RotaPerson; cell: RotaCell } | null>(null);
  const [coverDate, setCoverDate] = useState<string | null>(null);
  const [ninePmDate, setNinePmDate] = useState<string | null>(null);
  const showPicker = !!week && !!me && me.mode === 'rostered' && week.picking.open && !team;
  const showTeam = team || (!!week && !me);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-teal-600" aria-hidden />
          <h2 className="text-base font-semibold text-gray-900">My rota</h2>
          {week && <StatusPill week={week} />}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
            {[{ w: thisWeek, label: 'This week' }, { w: nextWeekStart, label: 'Next week' }].map((o) => (
              <button key={o.w} type="button" onClick={() => setWeekStart(o.w)} className={`rounded-md px-2.5 py-1 ${weekStart === o.w ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}>{o.label}</button>
            ))}
          </div>
          <button type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {pickDue && (
          <button type="button" onClick={() => setWeekStart(nextWeekStart)} className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left">
            <span className="text-sm font-medium text-amber-900">Pick your day off for next week ({weekLabel(nextWeekStart)})</span>
            <span className="text-sm font-semibold text-amber-700">Pick now</span>
          </button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-700">{weekLabel(weekStart)}</p>
          <div className="flex items-center gap-2">
            {approver && (
              <Link to="/hr/rota" className="text-xs font-medium text-teal-700 hover:underline">Full rota page</Link>
            )}
            {week && week.people.length > 0 && me && (
              <button type="button" onClick={() => setTeam((v) => !v)} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${team ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {approver ? <><Pencil className="h-3.5 w-3.5" /> Edit team rota</> : <><Users className="h-3.5 w-3.5" /> Team</>}
              </button>
            )}
          </div>
        </div>

        {isLoading && <p className="py-6 text-center text-sm text-gray-500">Loading rota…</p>}
        {error && <p className="py-6 text-center text-sm text-red-600">{(error as Error).message}</p>}

        {week && showPicker && <DayOffPicker key={week.weekStart} week={week} meId={meId} />}

        {week && me && !showPicker && !showTeam && (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="grid min-w-[560px] grid-cols-7 gap-1.5">
                {week.dates.map((d, i) => (
                  <div key={d} className={`rounded-xl p-1 ${d === today ? 'bg-teal-50 ring-1 ring-teal-300' : ''}`}>
                    <div className="mb-1 flex items-baseline justify-center gap-1">
                      <span className="text-[11px] font-semibold uppercase text-gray-500">{dayShort(d)}</span>
                      <span className="text-sm font-bold text-gray-900">{dayNum(d)}</span>
                    </div>
                    <RotaChip cell={myCells[i]} ninePm={myNinePm.includes(d)} />
                  </div>
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-600">
              {me.mode === 'self_managed'
                ? 'You manage your own days, so you aren’t counted in shop cover.'
                : <>
                    <b className="text-gray-900">{me.workingDays} days</b> · {me.plannedHours}h planned
                    {next && <> · next shift <b className="text-gray-900">{next.date === today ? 'today' : dayLabel(next.date)} {to12h(next.startTime)}</b></>}
                  </>}
            </p>
            {myNinePm.filter((d) => d >= today).length > 0 && (
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                🌙 You&apos;re on 9pm returns: <b>{myNinePm.filter((d) => d >= today).map((d) => (d === today ? 'tonight' : dayLabel(d))).join(', ')}</b>. Please be at the shop from 8:15pm.
              </p>
            )}
            {week.status === 'draft' && me.mode === 'rostered' && (
              <p className="text-xs text-gray-500">This week isn&apos;t published yet, so it may still change.</p>
            )}
          </>
        )}

        {week && showTeam && (
          <>
            {editWeek && (
              <p className="text-xs text-gray-600">
                Click anyone&apos;s day to set working, day off or custom hours. Click a 🌙 9pm badge to choose who handles the returns.
              </p>
            )}
            {approver && managerError && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Editing isn&apos;t available yet: {(managerError as Error).message}. Log out and back in once, then try again.
              </p>
            )}
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <RotaGrid
                week={editWeek ?? week}
                meId={meId}
                compact
                onCellClick={editWeek ? (person, cell) => setEditing({ person, cell }) : undefined}
                onCoverClick={editWeek ? setCoverDate : undefined}
                onNinePmClick={editWeek ? setNinePmDate : undefined}
              />
            </div>
          </>
        )}
        {editWeek && editing && <CellEditor key={`${editing.person.employeeId}|${editing.cell.date}`} week={editWeek} target={editing} onClose={() => setEditing(null)} />}
        {editWeek && coverDate && <CoverOverrideModal key={coverDate} week={editWeek} date={coverDate} onClose={() => setCoverDate(null)} />}
        {editWeek && ninePmDate && <NinePmModal key={ninePmDate} week={editWeek} date={ninePmDate} onClose={() => setNinePmDate(null)} />}
        {week && !me && <p className="text-xs text-gray-500">You&apos;re not on the rota, but you can see the team&apos;s week.</p>}
      </div>
    </section>
  );
}
