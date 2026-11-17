import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, History, Send, Settings2, ShieldAlert, X } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store.js';
import { Modal } from '../../components/common/Modal.js';
import { RotaGrid } from '../../components/rota/RotaGrid.js';
import { CellEditor, CoverOverrideModal, NinePmModal, btn, btnGhost, btnPrimary, inputCls } from '../../components/rota/RotaEditors.js';
import {
  useRotaWeek,
  useSetRotaCells,
  useDecidePick,
  usePublishRota,
  useRotaPeople,
  useUpdateWorkPattern,
  useUpdateRotaSettings,
  addDays,
  dayLabel,
  manilaToday,
  weekLabel,
  weekStartOf,
  type RotaCell,
  type RotaCellEdit,
  type RotaMode,
  type RotaPerson,
  type RotaPick,
  type RotaWeek,
} from '../../api/rota.js';

const ACTION_LABEL: Record<string, string> = {
  picks_saved: 'updated their day-off pick',
  pick_approve: 'approved a day off',
  pick_decline: 'declined a day off',
  pick_move: 'moved a day off',
  cell_changed: 'changed a day',
  emergency_set: 'approved emergency cover',
  emergency_removed: 'removed emergency cover',
  published: 'published the week',
  settings_changed: 'changed rota settings',
  pattern_changed: 'changed a work pattern',
  duty_set: 'assigned 9pm returns',
  duty_removed: 'removed 9pm returns',
};

function StatusBadge({ week }: { week: RotaWeek }) {
  const map = {
    draft: ['bg-gray-100 text-gray-700', week.picking.open ? 'Draft · picking open' : 'Draft'],
    published: ['bg-green-100 text-green-800', 'Published'],
    locked: ['bg-slate-200 text-slate-700', 'Locked (payroll run)'],
  } as const;
  const [cls, label] = map[week.status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function Panel({ title, icon, count, children }: { title: string; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        {icon}
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {!!count && <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{count}</span>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

// ── Approvals ───────────────────────────────────────────────────────────────

function PickRow({ week, pick }: { week: RotaWeek; pick: RotaPick }) {
  const decide = useDecidePick();
  const [mode, setMode] = useState<'idle' | 'decline' | 'move'>('idle');
  const [note, setNote] = useState('');
  const [toDate, setToDate] = useState('');
  const cells = new Map(week.cells.map((c) => [`${c.employeeId}|${c.date}`, c]));
  const moveOptions = week.dates.filter((d) => d !== pick.date && cells.get(`${pick.employeeId}|${d}`)?.kind === 'working');
  const othersOff = week.people.filter((p) => p.employeeId !== pick.employeeId && p.mode === 'rostered'
    && cells.get(`${p.employeeId}|${pick.date}`)?.kind !== 'working').map((p) => p.name.split(' ')[0]);

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-gray-900">{pick.employeeName.split(' ')[0]}</span>
        <span className="text-sm text-gray-600">· {dayLabel(pick.date)}</span>
        {pick.isLate && <span className="rounded bg-gray-100 px-1.5 text-[10px] font-semibold uppercase text-gray-600">Late</span>}
        {othersOff.length > 0 && <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold uppercase text-red-700">Clash · {othersOff.join(', ')} off</span>}
      </div>
      {pick.note && <p className="mt-1 text-xs text-gray-600">“{pick.note}”</p>}
      {mode === 'idle' && (
        <div className="mt-2 flex gap-1.5">
          <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: pick.id, action: 'approve' })} className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve</button>
          <button type="button" onClick={() => { setMode('move'); setToDate(moveOptions[0] ?? ''); }} disabled={moveOptions.length === 0} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Move</button>
          <button type="button" onClick={() => setMode('decline')} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Decline</button>
        </div>
      )}
      {mode !== 'idle' && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = mode === 'move' ? { action: 'move' as const, toDate, note } : { action: 'decline' as const, note };
            decide.mutate({ id: pick.id, ...body }, { onSuccess: () => setMode('idle') });
          }}
        >
          {mode === 'move' && (
            <select value={toDate} onChange={(e) => setToDate(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {moveOptions.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
            </select>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'move' ? 'Why? e.g. busy returns Friday' : 'Why? They’ll be asked to pick again'} className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          <div className="flex gap-1.5">
            <button type="submit" disabled={note.trim().length === 0 || decide.isPending} className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{mode === 'move' ? 'Move day off' : 'Decline'}</button>
            <button type="button" onClick={() => setMode('idle')} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600">Cancel</button>
          </div>
        </form>
      )}
      {decide.error && <p className="mt-1 text-xs text-red-600">{(decide.error as Error).message}</p>}
    </div>
  );
}

function NeedsDayOffRow({ week, person }: { week: RotaWeek; person: RotaPerson }) {
  const setCells = useSetRotaCells();
  const cells = new Map(week.cells.map((c) => [`${c.employeeId}|${c.date}`, c]));
  const offCount = (d: string) => week.people.filter((p) => p.mode === 'rostered' && cells.get(`${p.employeeId}|${d}`)?.kind !== 'working').length;
  const options = week.dates.filter((d) => cells.get(`${person.employeeId}|${d}`)?.kind === 'working');
  const suggested = options.find((d) => offCount(d) < week.settings.maxOffPerDay) ?? options[0] ?? '';
  const [date, setDate] = useState(suggested);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <p className="text-sm font-semibold text-gray-900">{person.name.split(' ')[0]} <span className="font-normal text-gray-600">hasn&apos;t picked a day off</span></p>
      <div className="mt-2 flex gap-1.5">
        <select value={date} onChange={(e) => setDate(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
          {options.map((d) => <option key={d} value={d}>{dayLabel(d)}{offCount(d) >= week.settings.maxOffPerDay ? ' · someone off' : ''}</option>)}
        </select>
        <button
          type="button"
          disabled={!date || setCells.isPending}
          onClick={() => setCells.mutate({
            weekStart: week.weekStart,
            cells: [{ employeeId: person.employeeId, date, kind: 'day_off' }],
            reason: week.status === 'published' ? 'Day off assigned by manager' : undefined,
          })}
          className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Assign
        </button>
      </div>
      {setCells.error && <p className="mt-1 text-xs text-red-600">{(setCells.error as Error).message}</p>}
    </div>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<RotaMode, string> = { rostered: 'On the rota', self_managed: 'Self-managed', excluded: 'Not on rota' };

function PersonPatternRow({ p }: { p: { employeeId: string; name: string; role: string | null; mode: RotaMode; targetDaysPerWeek: number; countsTowardCover: boolean; hasTelegram: boolean } }) {
  const update = useUpdateWorkPattern();
  const save = (patch: Partial<{ scheduleMode: RotaMode; targetDaysPerWeek: number; countsTowardCover: boolean }>) => update.mutate({
    employeeId: p.employeeId,
    scheduleMode: patch.scheduleMode ?? p.mode,
    targetDaysPerWeek: patch.targetDaysPerWeek ?? p.targetDaysPerWeek,
    countsTowardCover: patch.countsTowardCover ?? (patch.scheduleMode ? patch.scheduleMode === 'rostered' : p.countsTowardCover),
  });
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-2">
        <div className="text-sm font-medium text-gray-900">{p.name}</div>
        <div className="text-xs text-gray-500">{p.role}{p.hasTelegram ? '' : ' · no Telegram'}</div>
      </td>
      <td className="py-2 pr-2">
        <select value={p.mode} disabled={update.isPending} onChange={(e) => save({ scheduleMode: e.target.value as RotaMode })} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
          {(Object.keys(MODE_LABEL) as RotaMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
        </select>
      </td>
      <td className="py-2 pr-2">
        <input type="number" min={1} max={7} value={p.targetDaysPerWeek} disabled={update.isPending || p.mode !== 'rostered'} onChange={(e) => e.target.value && save({ targetDaysPerWeek: Number(e.target.value) })} className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
      </td>
      <td className="py-2 text-center">
        <input type="checkbox" checked={p.countsTowardCover} disabled={update.isPending || p.mode !== 'rostered'} onChange={(e) => save({ countsTowardCover: e.target.checked })} className="accent-teal-600" />
      </td>
    </tr>
  );
}

function SettingsModal({ week, open, onClose }: { week: RotaWeek; open: boolean; onClose: () => void }) {
  const { data: people = [] } = useRotaPeople(open);
  const update = useUpdateRotaSettings();
  const [form, setForm] = useState(() => ({ ...week.settings }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: 'minStaff' | 'emergencyMinStaff' | 'maxOffPerDay' | 'changeNoticeHours') => (
    <input type="number" min={0} value={form[k]} onChange={(e) => set(k, Number(e.target.value))} className={inputCls} />
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rota settings"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-red-600">{update.error ? (update.error as Error).message : ''}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>Close</button>
            <button type="button" disabled={update.isPending} onClick={() => { const { storeId: _s, ...body } = form; update.mutate(body, { onSuccess: onClose }); }} className={btnPrimary}>
              {update.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-gray-600">Opening time<input type="time" value={form.defaultStart} onChange={(e) => set('defaultStart', e.target.value)} className={inputCls} /></label>
          <label className="text-xs font-medium text-gray-600">Closing time<input type="time" value={form.defaultEnd} onChange={(e) => set('defaultEnd', e.target.value)} className={inputCls} /></label>
          <label className="text-xs font-medium text-gray-600">Minimum staff per day{num('minStaff')}</label>
          <label className="text-xs font-medium text-gray-600">Emergency minimum{num('emergencyMinStaff')}</label>
          <label className="text-xs font-medium text-gray-600">Max people off per day{num('maxOffPerDay')}</label>
          <label className="text-xs font-medium text-gray-600">Change notice (hours){num('changeNoticeHours')}</label>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Approvers</h3>
          <p className="mb-2 text-xs text-gray-500">Only these people can approve picks, edit and publish the rota.</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = form.approverIds.includes(p.employeeId);
              return (
                <button key={p.employeeId} type="button" onClick={() => set('approverIds', on ? form.approverIds.filter((x) => x !== p.employeeId) : [...form.approverIds, p.employeeId])}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}>
                  {p.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold text-gray-900">People</h3>
          <p className="mb-2 text-xs text-gray-500">Changes here save straight away.</p>
          <table className="w-full text-left">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="pb-1">Name</th><th className="pb-1">Schedule</th><th className="pb-1">Days/week</th><th className="pb-1 text-center">Counts to cover</th></tr>
            </thead>
            <tbody>{people.filter((p) => p.isStaff !== false).map((p) => <PersonPatternRow key={p.employeeId} p={p} />)}</tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function RotaPage() {
  const meId = useAuthStore((s) => s.user?.employeeId) ?? undefined;
  const [weekStart, setWeekStart] = useState(() => addDays(weekStartOf(manilaToday()), 7));
  const { data: week, isLoading, error } = useRotaWeek(weekStart);
  const publish = usePublishRota();
  const [editing, setEditing] = useState<{ person: RotaPerson; cell: RotaCell } | null>(null);
  const [coverDate, setCoverDate] = useState<string | null>(null);
  const [ninePmDate, setNinePmDate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const pending = useMemo(() => (week?.picks ?? []).filter((p) => p.status === 'pending'), [week]);
  const needsDayOff = useMemo(() => (week?.people ?? []).filter((p) => p.mode === 'rostered' && p.workingDays >= 7), [week]);
  const blockers = (week?.issues ?? []).filter((i) => i.level === 'blocker');
  const warnings = (week?.issues ?? []).filter((i) => i.level === 'warning');
  const issueKeys = useMemo(() => new Set(
    (week?.issues ?? []).filter((i) => i.employeeId && i.date).map((i) => `${i.employeeId}|${i.date}`),
  ), [week]);
  const editable = !!week?.canApprove && week.status !== 'locked';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><CalendarDays className="h-6 w-6 text-teal-600" />Staff rota</h1>
          <p className="text-sm text-gray-500">Staff pick their day off in My Portal on Monday. Approve, adjust, then publish.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {week?.canApprove && <button type="button" onClick={() => setSettingsOpen(true)} className={`${btnGhost} flex items-center gap-1.5`}><Settings2 className="h-4 w-4" />Settings</button>}
          {week?.canApprove && week.status === 'draft' && (
            <button type="button" disabled={blockers.length > 0 || publish.isPending} onClick={() => setConfirmPublish(true)} title={blockers.length ? 'Fix the blockers first' : undefined} className={`${btnPrimary} flex items-center gap-1.5`}>
              <Send className="h-4 w-4" />Publish week
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
        <button type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
        <span className="min-w-[180px] text-center text-sm font-semibold text-gray-900">{weekLabel(weekStart)}</span>
        <button type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => setWeekStart(weekStartOf(manilaToday()))} className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">This week</button>
        <button type="button" onClick={() => setWeekStart(addDays(weekStartOf(manilaToday()), 7))} className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">Next week</button>
        <div className="ml-auto flex items-center gap-2">
          {week && <StatusBadge week={week} />}
          {week?.publishedAt && <span className="text-xs text-gray-500">by {week.publishedByName} · {new Date(week.publishedAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}</span>}
        </div>
      </div>

      {isLoading && <p className="py-12 text-center text-gray-500">Loading rota…</p>}
      {error && <p className="py-12 text-center text-red-600">{(error as Error).message}</p>}

      {week && (
        <>
          {!week.canApprove && (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">You can view the rota. Only the rota approvers can change it.</p>
          )}
          {week.status === 'published' && week.canApprove && (
            <p className="rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-800">This week is published. Any change you make is sent to that person on Telegram with your reason.</p>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <RotaGrid
                week={week}
                meId={meId}
                onCellClick={editable ? (person, cell) => setEditing({ person, cell }) : undefined}
                onCoverClick={editable ? setCoverDate : undefined}
                onNinePmClick={editable ? setNinePmDate : undefined}
                highlightKeys={issueKeys}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-teal-200" />Working</span>
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-gray-200" />Day off</span>
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-amber-400" />Pick waiting</span>
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" />Holiday</span>
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-200" />Sick</span>
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />Unpaid</span>
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-indigo-600" />9pm returns</span>
                {editable && <span className="ml-auto">Click a day to change it · click a 9pm badge to assign · click the cover count for emergencies</span>}
              </div>
            </div>

            <div className="space-y-4">
              {week.canApprove && (pending.length > 0 || needsDayOff.length > 0) && (
                <Panel title="Needs your decision" icon={<Check className="h-4 w-4 text-teal-600" />} count={pending.length + needsDayOff.length}>
                  <div className="space-y-2">
                    {pending.map((p) => <PickRow key={p.id} week={week} pick={p} />)}
                    {needsDayOff.filter((p) => !pending.some((x) => x.employeeId === p.employeeId)).map((p) => <NeedsDayOffRow key={p.employeeId} week={week} person={p} />)}
                  </div>
                </Panel>
              )}

              <Panel title="Checks" icon={<ShieldAlert className="h-4 w-4 text-gray-500" />} count={blockers.length + warnings.length}>
                {blockers.length + warnings.length === 0 ? (
                  <p className="text-sm text-green-700">All good: everyone has a day off and every day is covered.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {blockers.map((i, n) => <li key={`b${n}`} className="flex gap-2 text-sm text-red-700"><X className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</li>)}
                    {warnings.map((i, n) => <li key={`w${n}`} className="flex gap-2 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</li>)}
                  </ul>
                )}
              </Panel>

              {week.canApprove && week.log.length > 0 && (
                <Panel title="History" icon={<History className="h-4 w-4 text-gray-500" />}>
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {week.log.map((l) => (
                      <li key={l.id} className="text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">{l.actorName.split(' ')[0]}</span> {ACTION_LABEL[l.action] ?? l.action}
                        {l.employeeName && l.employeeName !== l.actorName && <> for {l.employeeName.split(' ')[0]}</>}
                        {l.date && <> · {dayLabel(l.date)}</>}
                        {typeof l.detail.after === 'string' && <> → {l.detail.after}</>}
                        {typeof l.detail.reason === 'string' && l.detail.reason && <> (“{l.detail.reason}”)</>}
                        <div className="text-[10px] text-gray-400">{new Date(l.createdAt).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          </div>

          {editing && <CellEditor key={`${editing.person.employeeId}|${editing.cell.date}`} week={week} target={editing} onClose={() => setEditing(null)} />}
          {coverDate && <CoverOverrideModal key={coverDate} week={week} date={coverDate} onClose={() => setCoverDate(null)} />}
          {ninePmDate && <NinePmModal key={ninePmDate} week={week} date={ninePmDate} onClose={() => setNinePmDate(null)} />}
          {settingsOpen && <SettingsModal week={week} open onClose={() => setSettingsOpen(false)} />}
          <Modal
            open={confirmPublish}
            onClose={() => setConfirmPublish(false)}
            title={`Publish ${weekLabel(week.weekStart)}?`}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmPublish(false)} className={btnGhost}>Cancel</button>
                <button type="button" disabled={publish.isPending} onClick={() => publish.mutate({ weekStart: week.weekStart }, { onSuccess: () => setConfirmPublish(false) })} className={btnPrimary}>
                  {publish.isPending ? 'Publishing…' : 'Publish and notify'}
                </button>
              </div>
            }
          >
            <p className="text-sm text-gray-700">Everyone on the rota gets their week on Telegram and in My Portal. After this, each change is sent to the person affected.</p>
            {warnings.length > 0 && <p className="mt-2 text-sm text-amber-800">{warnings.length} warning{warnings.length === 1 ? '' : 's'} still showing. You can publish anyway.</p>}
            {publish.error && <p className="mt-2 text-sm text-red-600">{(publish.error as Error).message}</p>}
          </Modal>
        </>
      )}
    </div>
  );
}
