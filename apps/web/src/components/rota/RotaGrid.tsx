import { Clock, Sun, Plane, Thermometer, MapPin, Moon } from 'lucide-react';
import type { RotaCell, RotaDayCover, RotaNinePmDay, RotaPerson, RotaWeek } from '../../api/rota.js';
import { dayNum, dayShort, manilaToday, to12h } from '../../api/rota.js';

const HATCH = 'bg-[repeating-linear-gradient(135deg,#f9fafb_0,#f9fafb_6px,#eef0f2_6px,#eef0f2_8px)]';

export function RotaChip({ cell, compact = false, highlight = false, ninePm = false }: { cell: RotaCell | undefined; compact?: boolean; highlight?: boolean; ninePm?: boolean }) {
  const base = `flex h-full w-full flex-col justify-center rounded-lg border px-2 ${compact ? 'min-h-[40px] py-1' : 'min-h-[52px] py-1.5'} text-left ${highlight ? 'ring-2 ring-teal-500 ring-offset-1' : ''}`;
  if (!cell?.kind) return <div className={`${base} border-dashed border-gray-200 text-xs text-gray-400`}>—</div>;

  const pending = !!cell.pendingPickId;
  switch (cell.kind) {
    case 'working':
      return (
        <div className={`${base} ${ninePm ? 'border-indigo-300' : 'border-teal-200'} bg-teal-50 text-teal-900`}>
          <span className="flex items-center justify-between gap-1 text-[13px] font-semibold tabular-nums leading-tight">
            {to12h(cell.startTime)} – {to12h(cell.endTime)}
            {cell.isCustomTime ? <Clock className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-label="Custom hours" /> : <Sun className="h-3.5 w-3.5 shrink-0 text-teal-500" aria-hidden />}
          </span>
          {ninePm ? (
            <span className="mt-0.5 flex w-fit items-center gap-1 rounded bg-indigo-600 px-1.5 py-px text-[10px] font-semibold text-white">
              <Moon className="h-3 w-3" aria-hidden />9pm returns
            </span>
          ) : !compact && <span className="truncate text-[11px] text-teal-700">{cell.note ?? (cell.isCustomTime ? 'Custom hours' : 'Store hours')}</span>}
        </div>
      );
    case 'day_off':
      return (
        <div className={`${base} ${pending ? 'border-dashed border-amber-400 bg-amber-50/60' : `border-gray-200 ${HATCH}`} items-center text-center`}>
          <span className={`text-[13px] font-medium ${pending ? 'text-amber-800' : 'text-gray-500'}`}>Day off</span>
          {!compact && pending && <span className="text-[11px] text-amber-700">Waiting for approval</span>}
          {!compact && !pending && cell.source === 'assigned' && <span className="text-[11px] text-gray-400">Assigned</span>}
        </div>
      );
    case 'holiday':
    case 'leave':
      return (
        <div className={`${base} border-amber-200 bg-amber-50 text-amber-900`}>
          <span className="flex items-center justify-between text-[13px] font-semibold">{cell.kind === 'leave' ? 'Leave' : 'Holiday'}<Plane className="h-3.5 w-3.5 text-amber-500" aria-hidden /></span>
          {!compact && <span className="text-[11px] text-amber-700">Approved leave</span>}
        </div>
      );
    case 'sick':
      return (
        <div className={`${base} border-red-200 bg-red-50 text-red-800`}>
          <span className="flex items-center justify-between text-[13px] font-semibold">Sick<Thermometer className="h-3.5 w-3.5 text-red-400" aria-hidden /></span>
        </div>
      );
    case 'unpaid_leave':
      return (
        <div className={`${base} border-slate-200 bg-slate-100 text-slate-700`}>
          <span className="flex items-center justify-between text-[13px] font-semibold">Unpaid leave<Moon className="h-3.5 w-3.5 text-slate-400" aria-hidden /></span>
        </div>
      );
    case 'out_of_office':
      return (
        <div className={`${base} border-dashed border-gray-300 bg-white text-gray-500`}>
          <span className="flex items-center justify-between text-[13px] font-medium">Out of office<MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden /></span>
        </div>
      );
  }
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

function PersonCell({ p, isMe }: { p: RotaPerson; isMe: boolean }) {
  const self = p.mode === 'self_managed';
  return (
    <div className="flex h-full items-center gap-2.5 pr-2">
      <span className={`h-9 w-1 shrink-0 rounded-full ${self ? 'bg-gray-300' : 'bg-teal-600'}`} aria-hidden />
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${self ? 'bg-gray-100 text-gray-600' : 'bg-teal-100 text-teal-800'}`}>{initials(p.name)}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-gray-900">{p.name.split(' ')[0]}</span>
          {isMe && <span className="rounded bg-teal-600 px-1 text-[10px] font-bold uppercase text-white">You</span>}
        </div>
        <div className="truncate text-[11px] text-gray-500">
          {self ? 'Self-managed · not counted' : `${p.workingDays} days · ${p.plannedHours}h`}
        </div>
      </div>
    </div>
  );
}

function NinePmBadge({ day, past, onClick }: { day: RotaNinePmDay; past: boolean; onClick?: () => void }) {
  const unassigned = !day.assigneeId && day.count > 0 && !past;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={day.bookings.length ? day.bookings.map((b) => `${b.ref}${b.customer ? ` · ${b.customer}` : ''}`).join('\n') : undefined}
      className={`mt-1 flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[10px] font-semibold ${
        unassigned ? 'bg-indigo-50 text-indigo-700 ring-1 ring-red-300' : 'bg-indigo-600 text-white'
      } ${onClick ? 'hover:brightness-110' : ''}`}
    >
      <Moon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">
        {day.count > 0 ? `${day.count} × 9pm` : '9pm'}
        {' · '}
        {day.assigneeName ? day.assigneeName.split(' ')[0] : <span className={unassigned ? 'text-red-600' : ''}>unassigned</span>}
      </span>
    </Tag>
  );
}

function CoverPill({ c, onClick }: { c: RotaDayCover; onClick?: () => void }) {
  const tone = c.status === 'ok' ? 'bg-green-50 text-green-800 border-green-200'
    : c.status === 'emergency' ? 'bg-amber-50 text-amber-800 border-amber-300'
    : 'bg-red-50 text-red-700 border-red-200';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full flex-col items-center rounded-lg border px-1 py-1 ${tone} ${onClick ? 'hover:brightness-95' : ''}`}
      title={c.status === 'emergency' ? 'Emergency cover approved' : undefined}
    >
      <span className="text-sm font-bold tabular-nums">{c.working}/{c.required}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide">{c.status === 'ok' ? 'covered' : c.status === 'emergency' ? 'emergency' : 'short'}</span>
    </Tag>
  );
}

export function RotaGrid({
  week,
  meId,
  compact = false,
  onCellClick,
  onCoverClick,
  onNinePmClick,
  highlightKeys,
}: {
  week: RotaWeek;
  meId?: string;
  compact?: boolean;
  onCellClick?: (person: RotaPerson, cell: RotaCell) => void;
  onCoverClick?: (date: string) => void;
  onNinePmClick?: (date: string) => void;
  highlightKeys?: ReadonlySet<string>;
}) {
  const today = manilaToday();
  const cells = new Map(week.cells.map((c) => [`${c.employeeId}|${c.date}`, c]));
  const holidays = new Map(week.holidays.map((h) => [h.date, h.name]));
  const cover = new Map(week.cover.map((c) => [c.date, c]));
  const ninePm = new Map(week.ninePm.map((n) => [n.date, n]));
  const cols = 'grid grid-cols-[150px_repeat(7,minmax(92px,1fr))] sm:grid-cols-[180px_repeat(7,minmax(104px,1fr))]';

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div className={`${cols} border-b border-gray-200 bg-slate-50`}>
          <div className="sticky left-0 z-10 bg-slate-50" />
          {week.dates.map((d) => (
            <div key={d} className={`border-l border-gray-200 px-2 py-2 ${d === today ? 'bg-teal-50' : ''}`}>
              <div className="flex items-baseline gap-1">
                <span className={`text-xs font-semibold uppercase tracking-wide ${d === today ? 'text-teal-700' : 'text-gray-600'}`}>{dayShort(d)}</span>
                <span className={`text-sm font-bold ${d === today ? 'text-teal-800' : 'text-gray-900'}`}>{dayNum(d)}</span>
              </div>
              {holidays.has(d) && <div className="mt-0.5 truncate rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800" title={holidays.get(d)}>{holidays.get(d)}</div>}
              {ninePm.get(d) && <NinePmBadge day={ninePm.get(d)!} past={d < today} onClick={onNinePmClick ? () => onNinePmClick(d) : undefined} />}
            </div>
          ))}
        </div>

        {week.people.map((p) => (
          <div key={p.employeeId} className={`${cols} border-b border-gray-100 ${p.employeeId === meId ? 'bg-teal-50/30' : ''}`}>
            <div className="sticky left-0 z-10 border-r border-gray-100 bg-white py-1.5 pl-2">
              <PersonCell p={p} isMe={p.employeeId === meId} />
            </div>
            {week.dates.map((d) => {
              const key = `${p.employeeId}|${d}`;
              const cell = cells.get(key);
              const clickable = !!onCellClick && !!cell && cell.source !== 'leave';
              return (
                <div key={d} className={`border-l border-gray-100 p-1 ${d === today ? 'bg-teal-50/40' : ''}`}>
                  {clickable ? (
                    <button type="button" onClick={() => onCellClick!(p, cell!)} className="block h-full w-full rounded-lg transition hover:-translate-y-px hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                      <RotaChip cell={cell} compact={compact} highlight={highlightKeys?.has(key)} ninePm={ninePm.get(d)?.assigneeId === p.employeeId} />
                    </button>
                  ) : (
                    <RotaChip cell={cell} compact={compact} highlight={highlightKeys?.has(key)} ninePm={ninePm.get(d)?.assigneeId === p.employeeId} />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {week.people.some((p) => p.mode === 'rostered') && (
          <div className={`${cols} bg-slate-50`}>
            <div className="sticky left-0 z-10 flex items-center bg-slate-50 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">On shift</div>
            {week.dates.map((d) => (
              <div key={d} className="border-l border-gray-200 p-1">
                {cover.get(d) && <CoverPill c={cover.get(d)!} onClick={onCoverClick ? () => onCoverClick(d) : undefined} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
