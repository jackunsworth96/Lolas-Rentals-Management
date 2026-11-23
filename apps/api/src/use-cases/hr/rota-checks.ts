import {
  checkTimesheetAgainstRota,
  rotaWeekStart,
  type RotaFlag,
  type RotaKind,
  type RotaPlanCell,
} from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { addDaysToDateStr } from '../../utils/manila-date.js';
import { loadPeople, loadRotaSettings, type Person, type RotaSettings } from './rota.js';

type Row = Record<string, unknown>;
const sb = () => getSupabaseClient();
const hm = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 5));
const LEAVE_REQUEST_KINDS: Record<string, RotaKind> = { holiday: 'holiday', sick: 'sick', unpaid: 'unpaid_leave' };

export interface RotaPlanLookup {
  /** First rota week; days before it are never checked. Null when the rota has never been used. */
  goLive: string | null;
  cell(employeeId: string, date: string): RotaPlanCell | null;
}

interface StorePlan {
  settings: RotaSettings;
  people: Map<string, Person>;
  assignments: Map<string, Row>;
  picks: Set<string>;
  leave: Map<string, RotaKind>;
  weekStatus: Map<string, string>;
  ninePmDuty: Map<string, string>;
}

async function loadStorePlan(storeId: string, from: string, to: string): Promise<StorePlan> {
  const [settings, people] = await Promise.all([loadRotaSettings(storeId), loadPeople(storeId)]);
  const ids = people.map((p) => p.employeeId);
  const [assignRes, pickRes, weekRes, dutyRes, leaveRes] = await Promise.all([
    sb().from('rota_assignments').select('employee_id, date, kind, start_time, end_time, actual_nine_pm').eq('store_id', storeId).gte('date', from).lte('date', to),
    sb().from('rota_day_off_picks').select('employee_id, date').eq('store_id', storeId).in('status', ['pending', 'approved']).gte('date', from).lte('date', to),
    sb().from('rota_weeks').select('week_start, status').eq('store_id', storeId).gte('week_start', rotaWeekStart(from)).lte('week_start', to),
    sb().from('rota_duties').select('date, employee_id').eq('store_id', storeId).eq('duty', 'nine_pm_return').gte('date', from).lte('date', to),
    ids.length > 0
      ? sb().from('leave_requests').select('employee_id, leave_type, start_date, end_date').in('employee_id', ids).eq('status', 'approved').lte('start_date', to).gte('end_date', from)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [assignRes, pickRes, weekRes, dutyRes, leaveRes]) {
    if (r.error) throw new Error(`Failed to load the rota: ${r.error.message}`);
  }
  const leave = new Map<string, RotaKind>();
  for (const r of (leaveRes.data ?? []) as Row[]) {
    const kind = LEAVE_REQUEST_KINDS[String(r.leave_type)];
    if (!kind) continue;
    for (let d = String(r.start_date); d <= String(r.end_date); d = addDaysToDateStr(d, 1)) {
      if (d >= from && d <= to) leave.set(`${r.employee_id}|${d}`, kind);
    }
  }
  return {
    settings,
    people: new Map(people.map((p) => [p.employeeId, p])),
    assignments: new Map(((assignRes.data ?? []) as Row[]).map((a) => [`${a.employee_id}|${a.date}`, a])),
    picks: new Set(((pickRes.data ?? []) as Row[]).map((p) => `${p.employee_id}|${p.date}`)),
    leave,
    weekStatus: new Map(((weekRes.data ?? []) as Row[]).map((w) => [String(w.week_start), String(w.status)])),
    ninePmDuty: new Map(((dutyRes.data ?? []) as Row[]).map((d) => [String(d.date), String(d.employee_id)])),
  };
}

/** Derives each day's planned cell the same way the rota grid does. */
function planCell(plan: StorePlan, person: Person, date: string): RotaPlanCell {
  const key = `${person.employeeId}|${date}`;
  const weekPublished = ['published', 'locked'].includes(plan.weekStatus.get(rotaWeekStart(date)) ?? 'draft');
  const base = { ninePmAssignee: plan.ninePmDuty.get(date) === person.employeeId, actualNinePm: null, weekPublished, startTime: null, endTime: null };
  if (person.startDate && date < person.startDate) return { ...base, kind: 'not_started' };
  const leaveKind = plan.leave.get(key);
  if (leaveKind) return { ...base, kind: leaveKind };
  const a = plan.assignments.get(key);
  if (a) {
    return {
      ...base,
      kind: a.kind as RotaKind,
      startTime: hm(a.start_time),
      endTime: hm(a.end_time),
      actualNinePm: a.actual_nine_pm == null ? null : Number(a.actual_nine_pm),
    };
  }
  if (plan.picks.has(key)) return { ...base, kind: 'day_off' };
  if (person.mode === 'rostered') return { ...base, kind: 'working', startTime: plan.settings.defaultStart, endTime: plan.settings.defaultEnd };
  return { ...base, kind: 'out_of_office' };
}

export async function loadRotaPlan(from: string, to: string): Promise<RotaPlanLookup> {
  const { data: first, error } = await sb().from('rota_weeks').select('week_start').order('week_start').limit(1).maybeSingle();
  if (error) throw new Error(`Failed to load the rota: ${error.message}`);
  const goLive = first ? String(first.week_start) : null;
  if (!goLive || to < goLive) return { goLive, cell: () => null };

  const { data: stores, error: sErr } = await sb().from('rota_settings').select('store_id');
  if (sErr) throw new Error(`Failed to load rota settings: ${sErr.message}`);
  const start = from > goLive ? from : goLive;
  const plans = await Promise.all(((stores ?? []) as Row[]).map((s) => loadStorePlan(String(s.store_id), start, to)));

  return {
    goLive,
    cell(employeeId, date) {
      for (const plan of plans) {
        const person = plan.people.get(employeeId);
        if (person && person.mode !== 'excluded') return planCell(plan, person, date);
      }
      return null;
    },
  };
}

export interface RotaCheckRow {
  employeeId: string;
  date: string;
  name: string | null;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  ninePmReturnsCount: number;
}

const CHECK_COLUMNS = 'id, employee_id, date, name, day_type, time_in, time_out, nine_pm_returns_count, acknowledged_at';

function toCheckRow(r: Row): RotaCheckRow {
  return {
    employeeId: String(r.employee_id),
    date: String(r.date),
    name: r.name == null ? null : String(r.name),
    dayType: String(r.day_type),
    timeIn: hm(r.time_in),
    timeOut: hm(r.time_out),
    ninePmReturnsCount: Number(r.nine_pm_returns_count ?? 0),
  };
}

/** Of these timesheets, the ones with rota warnings that nobody has acknowledged. */
export async function unacknowledgedFlaggedIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sb().from('timesheets').select(CHECK_COLUMNS).in('id', ids).is('acknowledged_at', null);
  if (error) throw new Error(`Failed to check timesheets against the rota: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const flags = await rotaFlagsFor(rows.map(toCheckRow));
  return rows.filter((_, i) => flags[i].some((f) => f.level === 'warning')).map((r) => String(r.id));
}

export async function acknowledgeTimesheets(ids: string[], by: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await sb().from('timesheets').update({ acknowledged_by: by, acknowledged_at: new Date().toISOString() }).in('id', ids);
  if (error) throw new Error(`Failed to record the rota check: ${error.message}`);
}

/** Rota flags and acknowledgement for timesheet rows already loaded for a list. */
export async function rotaStatusFor(rows: Array<RotaCheckRow & { id: string }>): Promise<Map<string, { flags: RotaFlag[]; acknowledgedAt: string | null }>> {
  const out = new Map<string, { flags: RotaFlag[]; acknowledgedAt: string | null }>();
  if (rows.length === 0) return out;
  const flags = await rotaFlagsFor(rows);
  const acked = new Map<string, string>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb().from('timesheets').select('id, acknowledged_at').in('id', ids.slice(i, i + 200)).not('acknowledged_at', 'is', null);
    if (error) throw new Error(`Failed to load rota checks: ${error.message}`);
    for (const r of (data ?? []) as Row[]) acked.set(String(r.id), String(r.acknowledged_at));
  }
  rows.forEach((r, i) => out.set(r.id, { flags: flags[i], acknowledgedAt: acked.get(r.id) ?? null }));
  return out;
}

/** Rota flags for each row, in the same order. Days before the rota went live get none. */
export async function rotaFlagsFor(rows: RotaCheckRow[], names: ReadonlyMap<string, string> = new Map()): Promise<RotaFlag[][]> {
  if (rows.length === 0) return [];
  const dates = rows.map((r) => r.date).sort();
  const plan = await loadRotaPlan(dates[0], dates[dates.length - 1]);
  return rows.map((r) => {
    if (!plan.goLive || r.date < plan.goLive) return [];
    return checkTimesheetAgainstRota({
      date: r.date,
      name: r.name ?? names.get(r.employeeId) ?? '',
      dayType: r.dayType,
      timeIn: hm(r.timeIn),
      timeOut: hm(r.timeOut),
      ninePmReturnsCount: r.ninePmReturnsCount,
    }, plan.cell(r.employeeId, r.date));
  });
}
