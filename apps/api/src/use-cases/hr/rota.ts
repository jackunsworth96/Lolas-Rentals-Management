import {
  DomainError,
  evaluateRotaWeek,
  rotaWeekDates,
  rotaWeekStart,
  type RotaDayCover,
  type RotaIssue,
  type RotaActualHours,
  type RotaKind,
  type RotaMode,
} from '@lolas/domain';
import type {
  DecideDayOffPickRequest,
  SaveDayOffPicksRequest,
  SetCoverOverrideRequest,
  SetRotaActualsRequest,
  SetRotaCellsRequest,
  SetRotaDutyRequest,
  UpdateRotaSettingsRequest,
  UpdateWorkPatternRequest,
} from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { sendTelegramMessage } from '../../lib/telegram.js';
import { escapeHtml } from '../../services/email.js';
import { addDaysToDateStr, formatManilaDate } from '../../utils/manila-date.js';

type Row = Record<string, unknown>;
const sb = () => getSupabaseClient();
const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const hm = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 5));

/** Kinds the grid can set directly; leave comes from leave requests and timesheets. */
const EDITABLE_KINDS: ReadonlySet<RotaKind> = new Set(['working', 'day_off', 'out_of_office']);
const LEAVE_DAY_TYPES: Record<string, RotaKind> = { Holiday: 'holiday', Sick: 'sick', 'Unpaid Leave': 'unpaid_leave' };
const LEAVE_REQUEST_KINDS: Record<string, RotaKind> = { holiday: 'holiday', sick: 'sick', unpaid: 'unpaid_leave' };
const MAX_WEEKS_AHEAD = 4;

export type RotaCellSource = 'default' | 'pick' | 'assigned' | 'manual' | 'leave';
/** Other people's leave type is hidden in the staff team view; not_started covers days before a start date. */
export type RotaViewKind = RotaKind | 'leave' | 'not_started';

export interface RotaSettings {
  storeId: string;
  defaultStart: string;
  defaultEnd: string;
  minStaff: number;
  emergencyMinStaff: number;
  maxOffPerDay: number;
  changeNoticeHours: number;
  approverIds: string[];
}

export interface RotaPersonView {
  employeeId: string;
  name: string;
  role: string | null;
  mode: RotaMode;
  countsTowardCover: boolean;
  targetDaysPerWeek: number;
  workingDays: number;
  plannedHours: number;
}

export interface RotaCellView {
  employeeId: string;
  date: string;
  kind: RotaViewKind | null;
  startTime: string | null;
  endTime: string | null;
  isCustomTime: boolean;
  note: string | null;
  source: RotaCellSource;
  pendingPickId: string | null;
  /** Hours actually worked, entered on the rota before sending to timesheets. */
  actual: RotaActualHours | null;
}

/** The timesheet row for a rota cell, if one exists. Manager view only. */
export interface RotaTimesheetView {
  id: string;
  employeeId: string;
  date: string;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  ninePmReturnsCount: number;
  dailyNotes: string | null;
  payrollStatus: 'Pending' | 'Approved' | 'Paid';
}

export interface RotaPickView {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  note: string | null;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  isLate: boolean;
  isClash: boolean;
  movedFrom: string | null;
  submittedAt: string;
  decidedByName: string | null;
  decisionNote: string | null;
}

export interface RotaLogEntry {
  id: string;
  actorName: string;
  action: string;
  employeeName: string | null;
  date: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface NinePmBooking {
  ref: string;
  customer: string | null;
  vehicle: string | null;
}

export interface RotaNinePmDay {
  date: string;
  count: number;
  /** Empty in the staff view. */
  bookings: NinePmBooking[];
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface RotaWeekView {
  storeId: string;
  weekStart: string;
  dates: string[];
  status: 'draft' | 'published' | 'locked';
  publishedAt: string | null;
  publishedByName: string | null;
  settings: RotaSettings;
  canApprove: boolean;
  picking: { open: boolean; pickDay: string; isLate: boolean };
  people: RotaPersonView[];
  cells: RotaCellView[];
  picks: RotaPickView[];
  holidays: Array<{ date: string; name: string }>;
  coverOverrides: Array<{ date: string; reason: string; approvedByName: string }>;
  ninePm: RotaNinePmDay[];
  cover: RotaDayCover[];
  issues: RotaIssue[];
  log: RotaLogEntry[];
  timesheets: RotaTimesheetView[];
}

export interface RotaViewer {
  employeeId: string;
  hasManagePermission: boolean;
}

// ── Lookups ─────────────────────────────────────────────────────────────────

function minutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function weekLabel(weekStart: string): string {
  return `${dayLabel(weekStart)} – ${dayLabel(addDaysToDateStr(weekStart, 6))}`;
}

function assertWeekStart(weekStart: string): void {
  if (rotaWeekStart(weekStart) !== weekStart) throw new DomainError('The week must start on a Monday');
}

async function namesFor(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await sb().from('employees').select('id, full_name').in('id', unique);
  if (error) throw new Error(`Failed to load names: ${error.message}`);
  for (const e of (data ?? []) as Row[]) out.set(String(e.id), String(e.full_name ?? ''));
  return out;
}

export async function storeForEmployee(employeeId: string): Promise<string> {
  const { data, error } = await sb().from('employees').select('store_id').eq('id', employeeId).maybeSingle();
  if (error) throw new Error(`Failed to load employee: ${error.message}`);
  if (!data?.store_id) throw new DomainError('Your profile has no store; ask a manager to set one');
  return String(data.store_id);
}

export async function loadRotaSettings(storeId: string): Promise<RotaSettings> {
  const { data, error } = await sb().from('rota_settings').select('*').eq('store_id', storeId).maybeSingle();
  if (error) throw new Error(`Failed to load rota settings: ${error.message}`);
  const r = (data ?? {}) as Row;
  return {
    storeId,
    defaultStart: hm(r.default_start) ?? '09:00',
    defaultEnd: hm(r.default_end) ?? '17:00',
    minStaff: Number(r.min_staff ?? 2),
    emergencyMinStaff: Number(r.emergency_min_staff ?? 1),
    maxOffPerDay: Number(r.max_off_per_day ?? 1),
    changeNoticeHours: Number(r.change_notice_hours ?? 48),
    approverIds: Array.isArray(r.approver_ids) ? (r.approver_ids as unknown[]).map(String) : [],
  };
}

/** Named approvers when set; otherwise anyone who can open the rota page. */
function canApprove(settings: RotaSettings, viewer: RotaViewer): boolean {
  return settings.approverIds.length > 0 ? settings.approverIds.includes(viewer.employeeId) : viewer.hasManagePermission;
}

export function assertApprover(settings: RotaSettings, viewer: RotaViewer): void {
  if (!canApprove(settings, viewer)) throw new DomainError('Only the rota approvers can change the rota');
}

export interface Person {
  employeeId: string;
  name: string;
  role: string | null;
  mode: RotaMode;
  countsTowardCover: boolean;
  targetDaysPerWeek: number;
  telegramId: string | null;
  isStaff: boolean;
  /** Blank for long-serving staff whose start date isn't known; treated as always employed. */
  startDate: string | null;
}

/** Owners and developers are left out unless asked for: they can approve the rota but are never on it. */
export async function loadPeople(storeId: string, { includeNonStaff = false } = {}): Promise<Person[]> {
  const [{ data: home, error: hErr }, { data: links, error: lErr }] = await Promise.all([
    sb().from('employees').select('id').eq('store_id', storeId).eq('status', 'Active'),
    sb().from('employee_stores').select('employee_id').eq('store_id', storeId),
  ]);
  if (hErr) throw new Error(`Failed to load employees: ${hErr.message}`);
  if (lErr) throw new Error(`Failed to load employee stores: ${lErr.message}`);
  const ids = [...new Set([...(home ?? []).map((r) => String(r.id)), ...(links ?? []).map((r) => String(r.employee_id))])];
  if (ids.length === 0) return [];

  let empQuery = sb().from('employees').select('id, full_name, role, status, rate_type, telegram_user_id, person_type, start_date').in('id', ids).eq('status', 'Active');
  if (!includeNonStaff) empQuery = empQuery.eq('person_type', 'staff');
  const [{ data: emps, error: eErr }, { data: patterns, error: pErr }] = await Promise.all([
    empQuery,
    sb().from('employee_work_patterns').select('*').in('employee_id', ids),
  ]);
  if (eErr) throw new Error(`Failed to load employees: ${eErr.message}`);
  if (pErr) throw new Error(`Failed to load work patterns: ${pErr.message}`);
  const byId = new Map(((patterns ?? []) as Row[]).map((p) => [String(p.employee_id), p]));

  const people = ((emps ?? []) as Row[]).map((e): Person => {
    const p = byId.get(String(e.id));
    // Fixed-salary staff report weekly instead of keeping shop hours.
    const fallbackMode: RotaMode = e.rate_type === 'fixed' ? 'self_managed' : 'rostered';
    const mode = (p?.schedule_mode as RotaMode | undefined) ?? fallbackMode;
    return {
      employeeId: String(e.id),
      name: String(e.full_name ?? ''),
      role: s(e.role),
      mode,
      countsTowardCover: p ? Boolean(p.counts_toward_cover) : mode === 'rostered',
      targetDaysPerWeek: Number(p?.target_days_per_week ?? 6),
      telegramId: s(e.telegram_user_id),
      isStaff: (e.person_type ?? 'staff') === 'staff',
      startDate: s(e.start_date)?.slice(0, 10) ?? null,
    };
  });
  const order: Record<RotaMode, number> = { rostered: 0, self_managed: 1, excluded: 2 };
  return people.sort((a, b) => order[a.mode] - order[b.mode] || a.name.localeCompare(b.name));
}

async function loadWeekRow(storeId: string, weekStart: string): Promise<Row | null> {
  const { data, error } = await sb().from('rota_weeks').select('*').eq('store_id', storeId).eq('week_start', weekStart).maybeSingle();
  if (error) throw new Error(`Failed to load rota week: ${error.message}`);
  return (data as Row | null) ?? null;
}

async function loadLeave(employeeIds: string[], from: string, to: string): Promise<Map<string, RotaKind>> {
  const out = new Map<string, RotaKind>();
  if (employeeIds.length === 0) return out;
  const [{ data: ts, error: tErr }, { data: lr, error: lErr }] = await Promise.all([
    sb().from('timesheets').select('employee_id, date, day_type').in('employee_id', employeeIds).gte('date', from).lte('date', to)
      .in('day_type', Object.keys(LEAVE_DAY_TYPES)),
    sb().from('leave_requests').select('employee_id, leave_type, start_date, end_date').in('employee_id', employeeIds)
      .eq('status', 'approved').lte('start_date', to).gte('end_date', from),
  ]);
  if (tErr) throw new Error(`Failed to load leave timesheets: ${tErr.message}`);
  if (lErr) throw new Error(`Failed to load leave requests: ${lErr.message}`);
  for (const r of (lr ?? []) as Row[]) {
    const kind = LEAVE_REQUEST_KINDS[String(r.leave_type)];
    if (!kind) continue;
    for (let d = String(r.start_date); d <= String(r.end_date); d = addDaysToDateStr(d, 1)) {
      if (d >= from && d <= to) out.set(`${r.employee_id}|${d}`, kind);
    }
  }
  for (const r of (ts ?? []) as Row[]) out.set(`${r.employee_id}|${r.date}`, LEAVE_DAY_TYPES[String(r.day_type)]);
  return out;
}

const NINE_PM_ADDON_ID = 9;
/** Same rule as the 9pm reminder job: the add-on extends the 4:45pm return slot. */
const NINE_PM_FROM = '16:45';

function manilaParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
    time: d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false }).slice(0, 5),
  };
}

/** 9pm returns per date: staff-created and processed orders, plus unprocessed web bookings. */
async function loadNinePmReturns(storeId: string, from: string, to: string): Promise<Map<string, NinePmBooking[]>> {
  const start = `${from}T00:00:00+08:00`;
  const end = `${to}T23:59:59.999+08:00`;
  const [itemRes, rawRes] = await Promise.all([
    sb().from('order_items')
      .select('order_id, vehicle_name, dropoff_datetime, orders!inner(booking_token, status, store_id, customers(name))')
      .gte('dropoff_datetime', start).lte('dropoff_datetime', end)
      .in('orders.status', ['active', 'completed'])
      .eq('orders.store_id', storeId),
    sb().from('orders_raw')
      .select('order_reference, customer_name, dropoff_datetime, store_id')
      .eq('status', 'unprocessed')
      .gte('dropoff_datetime', start).lte('dropoff_datetime', end)
      .contains('addon_ids', [NINE_PM_ADDON_ID]),
  ]);
  if (itemRes.error) throw new Error(`Failed to load returns: ${itemRes.error.message}`);
  if (rawRes.error) throw new Error(`Failed to load web bookings: ${rawRes.error.message}`);

  const items = (itemRes.data ?? []) as Row[];
  const orderIds = [...new Set(items.map((r) => String(r.order_id)))];
  const withAddon = new Set<string>();
  if (orderIds.length > 0) {
    const { data, error } = await sb().from('order_addons').select('order_id').in('order_id', orderIds)
      .or('addon_name.ilike.%9pm%,addon_name.ilike.%9 pm%,addon_name.ilike.%21:00%,addon_name.ilike.%ninepm%');
    if (error) throw new Error(`Failed to load add-ons: ${error.message}`);
    for (const a of (data ?? []) as Row[]) withAddon.add(String(a.order_id));
  }

  const out = new Map<string, Map<string, NinePmBooking>>();
  const add = (date: string, b: NinePmBooking) => {
    if (!out.has(date)) out.set(date, new Map());
    if (!out.get(date)!.has(b.ref)) out.get(date)!.set(b.ref, b);
  };
  for (const r of items) {
    if (!withAddon.has(String(r.order_id)) || !r.dropoff_datetime) continue;
    const { date, time } = manilaParts(String(r.dropoff_datetime));
    if (time < NINE_PM_FROM) continue;
    const order = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as Row;
    const customer = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as Row | null;
    add(date, { ref: s(order.booking_token) ?? String(r.order_id), customer: s(customer?.name), vehicle: s(r.vehicle_name) });
  }
  for (const r of (rawRes.data ?? []) as Row[]) {
    if (r.store_id && r.store_id !== storeId) continue;
    const { date, time } = manilaParts(String(r.dropoff_datetime));
    if (time < NINE_PM_FROM) continue;
    add(date, { ref: s(r.order_reference) ?? '—', customer: s(r.customer_name), vehicle: null });
  }
  return new Map([...out].map(([d, m]) => [d, [...m.values()]]));
}

/** Who is on 9pm returns today, for the morning briefing. */
export async function ninePmDutyFor(storeId: string, date: string): Promise<string | null> {
  const { data, error } = await sb().from('rota_duties').select('employee_id')
    .eq('store_id', storeId).eq('date', date).eq('duty', 'nine_pm_return').maybeSingle();
  if (error || !data) return null;
  return (await namesFor([String(data.employee_id)])).get(String(data.employee_id)) ?? null;
}

// ── Week view ───────────────────────────────────────────────────────────────

export interface WeekState {
  storeId: string;
  weekStart: string;
  dates: string[];
  settings: RotaSettings;
  people: Person[];
  week: Row | null;
  status: 'draft' | 'published' | 'locked';
  cells: Map<string, RotaCellView>;
  picks: Row[];
  overrides: Row[];
  holidays: Row[];
  ninePm: Map<string, NinePmBooking[]>;
  /** date → employee on 9pm returns */
  ninePmDuty: Map<string, string>;
  /** employeeId|date → timesheet row */
  timesheets: Map<string, RotaTimesheetView>;
}

export async function loadWeekState(storeId: string, weekStart: string): Promise<WeekState> {
  assertWeekStart(weekStart);
  const dates = rotaWeekDates(weekStart);
  const end = dates[6];
  const [settings, allPeople, week] = await Promise.all([loadRotaSettings(storeId), loadPeople(storeId), loadWeekRow(storeId, weekStart)]);
  const people = allPeople.filter((p) => p.mode !== 'excluded' && (!p.startDate || p.startDate <= end));
  const ids = people.map((p) => p.employeeId);

  const [assignRes, pickRes, overrideRes, holidayRes, dutyRes, tsRes, leave, ninePm] = await Promise.all([
    sb().from('rota_assignments').select('*').eq('store_id', storeId).eq('week_start', weekStart),
    sb().from('rota_day_off_picks').select('*').eq('store_id', storeId).eq('week_start', weekStart).order('submitted_at'),
    sb().from('rota_cover_overrides').select('*').eq('store_id', storeId).gte('date', weekStart).lte('date', end),
    sb().from('public_holidays').select('holiday_date, name, store_id').gte('holiday_date', weekStart).lte('holiday_date', end),
    sb().from('rota_duties').select('date, employee_id').eq('store_id', storeId).eq('duty', 'nine_pm_return').gte('date', weekStart).lte('date', end),
    ids.length > 0
      ? sb().from('timesheets').select('id, employee_id, date, day_type, time_in, time_out, nine_pm_returns_count, daily_notes, payroll_status')
        .in('employee_id', ids).gte('date', weekStart).lte('date', end)
      : Promise.resolve({ data: [], error: null }),
    loadLeave(ids, weekStart, end),
    loadNinePmReturns(storeId, weekStart, end),
  ]);
  for (const r of [assignRes, pickRes, overrideRes, holidayRes, dutyRes, tsRes]) {
    if (r.error) throw new Error(`Failed to load rota: ${r.error.message}`);
  }
  const assignments = new Map(((assignRes.data ?? []) as Row[]).map((a) => [`${a.employee_id}|${a.date}`, a]));
  const picks = (pickRes.data ?? []) as Row[];
  const livePicks = new Map(picks.filter((p) => p.status === 'pending' || p.status === 'approved').map((p) => [`${p.employee_id}|${p.date}`, p]));
  const status = (week?.status as WeekState['status'] | undefined) ?? 'draft';

  const cells = new Map<string, RotaCellView>();
  for (const p of people) {
    for (const date of dates) {
      const key = `${p.employeeId}|${date}`;
      const base = { employeeId: p.employeeId, date, startTime: null, endTime: null, isCustomTime: false, note: null, pendingPickId: null, actual: null };
      const leaveKind = leave.get(key);
      const a = assignments.get(key);
      const pick = livePicks.get(key);
      let cell: RotaCellView;
      if (p.startDate && date < p.startDate) {
        cell = { ...base, kind: 'not_started', source: 'default' };
      } else if (leaveKind) {
        cell = { ...base, kind: leaveKind, source: 'leave' };
      } else if (a) {
        const kind = a.kind as RotaKind;
        const start = hm(a.start_time);
        const endT = hm(a.end_time);
        cell = {
          ...base,
          kind,
          startTime: start,
          endTime: endT,
          isCustomTime: kind === 'working' && (start !== settings.defaultStart || endT !== settings.defaultEnd),
          note: s(a.note),
          source: a.source as RotaCellSource,
          actual: actualFrom(a),
        };
      } else if (pick) {
        cell = { ...base, kind: 'day_off', source: 'pick', note: s(pick.note), pendingPickId: pick.status === 'pending' ? String(pick.id) : null };
      } else if (p.mode === 'rostered') {
        cell = { ...base, kind: 'working', startTime: settings.defaultStart, endTime: settings.defaultEnd, source: 'default' };
      } else {
        cell = { ...base, kind: 'out_of_office', source: 'default' };
      }
      cells.set(key, cell);
    }
  }

  return {
    storeId,
    weekStart,
    dates,
    settings,
    people,
    week,
    status,
    cells,
    picks,
    overrides: (overrideRes.data ?? []) as Row[],
    holidays: ((holidayRes.data ?? []) as Row[]).filter((h) => h.store_id == null || h.store_id === storeId),
    ninePm,
    ninePmDuty: new Map(((dutyRes.data ?? []) as Row[]).map((d) => [String(d.date), String(d.employee_id)])),
    timesheets: new Map(((tsRes.data ?? []) as Row[]).map((t) => [`${t.employee_id}|${t.date}`, timesheetView(t)])),
  };
}

function actualFrom(a: Row): RotaActualHours | null {
  if (a.actual_start == null && a.actual_end == null && a.actual_nine_pm == null && a.actual_note == null) return null;
  return { startTime: hm(a.actual_start), endTime: hm(a.actual_end), ninePmReturns: Number(a.actual_nine_pm ?? 0), note: s(a.actual_note) };
}

function timesheetView(t: Row): RotaTimesheetView {
  return {
    id: String(t.id),
    employeeId: String(t.employee_id),
    date: String(t.date),
    dayType: String(t.day_type),
    timeIn: hm(t.time_in),
    timeOut: hm(t.time_out),
    ninePmReturnsCount: Number(t.nine_pm_returns_count ?? 0),
    dailyNotes: s(t.daily_notes),
    payrollStatus: t.payroll_status as RotaTimesheetView['payrollStatus'],
  };
}

function evaluate(state: WeekState): { cover: RotaDayCover[]; issues: RotaIssue[] } {
  const result = evaluateRotaWeek({
    dates: state.dates,
    people: state.people,
    cellKind: (id, date) => {
      const k = state.cells.get(`${id}|${date}`)?.kind ?? null;
      return k === 'leave' ? 'holiday' : k === 'not_started' ? null : k;
    },
    minStaff: state.settings.minStaff,
    emergencyMinStaff: state.settings.emergencyMinStaff,
    maxOffPerDay: state.settings.maxOffPerDay,
    emergencyDates: new Set(state.overrides.map((o) => String(o.date))),
  });
  const today = formatManilaDate();
  for (const date of state.dates.filter((d) => d >= today && (state.ninePm.get(d)?.length ?? 0) > 0)) {
    const count = state.ninePm.get(date)!.length;
    const assignee = state.ninePmDuty.get(date);
    const label = `${dayLabel(date)}: ${count} × 9pm return${count === 1 ? '' : 's'}`;
    if (!assignee) {
      result.issues.push({ level: 'warning', code: 'nine_pm_unassigned', date, message: `${label}, nobody assigned` });
    } else if (state.cells.get(`${assignee}|${date}`)?.kind !== 'working') {
      const name = state.people.find((p) => p.employeeId === assignee)?.name.split(' ')[0] ?? 'The assignee';
      result.issues.push({ level: 'warning', code: 'nine_pm_not_working', date, employeeId: assignee, message: `${label}, but ${name} isn’t working that day` });
    }
  }
  const pending = state.picks.filter((p) => p.status === 'pending').length;
  if (pending > 0 && state.status === 'draft') {
    result.issues.unshift({ level: 'blocker', code: 'pending_picks', message: `${pending} day-off pick${pending === 1 ? ' is' : 's are'} still waiting for a decision` });
  }
  return result;
}

function pickingInfo(weekStart: string, status: WeekState['status']): RotaWeekView['picking'] {
  const today = formatManilaDate();
  const pickDay = addDaysToDateStr(weekStart, -7);
  const open = status === 'draft' && weekStart > today && weekStart <= addDaysToDateStr(rotaWeekStart(today), 7 * MAX_WEEKS_AHEAD);
  return { open, pickDay, isLate: today > pickDay };
}

async function toView(state: WeekState, viewer: RotaViewer, audience: 'manager' | 'staff'): Promise<RotaWeekView> {
  const { cover, issues } = evaluate(state);
  const approver = canApprove(state.settings, viewer);
  const showLog = audience === 'manager' && approver;
  const logRes = showLog
    ? await sb().from('rota_audit_log').select('*').eq('store_id', state.storeId).eq('week_start', state.weekStart)
      .order('created_at', { ascending: false }).limit(50)
    : { data: [], error: null };
  if (logRes.error) throw new Error(`Failed to load rota history: ${logRes.error.message}`);
  const logRows = (logRes.data ?? []) as Row[];
  const names = await namesFor([
    s(state.week?.published_by),
    ...state.picks.map((p) => s(p.decided_by)),
    ...state.overrides.map((o) => s(o.approved_by)),
    ...logRows.flatMap((l) => [s(l.actor_id), s(l.employee_id)]),
  ]);
  const personName = new Map(state.people.map((p) => [p.employeeId, p.name]));

  const cells = [...state.cells.values()].map((c) => {
    if (audience === 'staff' && c.employeeId !== viewer.employeeId) {
      const hidden = c.kind === 'holiday' || c.kind === 'sick' || c.kind === 'unpaid_leave';
      return { ...c, kind: hidden ? 'leave' as const : c.kind, note: c.source === 'pick' ? null : c.note, actual: null };
    }
    return c;
  });

  const people = state.people.map((p): RotaPersonView => {
    const mine = state.dates.map((d) => state.cells.get(`${p.employeeId}|${d}`)!);
    const working = mine.filter((c) => c.kind === 'working');
    return {
      employeeId: p.employeeId,
      name: p.name,
      role: p.role,
      mode: p.mode,
      countsTowardCover: p.countsTowardCover,
      targetDaysPerWeek: p.targetDaysPerWeek,
      workingDays: working.length,
      plannedHours: Math.round(working.reduce((sum, c) => sum + (minutes(c.endTime!) - minutes(c.startTime!)) / 60, 0) * 10) / 10,
    };
  });

  const picks = state.picks
    .filter((p) => audience === 'manager' || p.employee_id === viewer.employeeId || p.status === 'pending' || p.status === 'approved')
    .map((p): RotaPickView => {
      const own = audience === 'manager' || p.employee_id === viewer.employeeId;
      return {
        id: String(p.id),
        employeeId: String(p.employee_id),
        employeeName: personName.get(String(p.employee_id)) ?? '',
        date: String(p.date),
        note: own ? s(p.note) : null,
        status: p.status as RotaPickView['status'],
        isLate: Boolean(p.is_late),
        isClash: Boolean(p.is_clash),
        movedFrom: s(p.moved_from),
        submittedAt: String(p.submitted_at),
        decidedByName: p.decided_by ? names.get(String(p.decided_by)) ?? null : null,
        decisionNote: own ? s(p.decision_note) : null,
      };
    });

  return {
    storeId: state.storeId,
    weekStart: state.weekStart,
    dates: state.dates,
    status: state.status,
    publishedAt: s(state.week?.published_at),
    publishedByName: state.week?.published_by ? names.get(String(state.week.published_by)) ?? null : null,
    settings: state.settings,
    canApprove: approver,
    picking: pickingInfo(state.weekStart, state.status),
    people,
    cells,
    picks,
    holidays: state.holidays.map((h) => ({ date: String(h.holiday_date), name: String(h.name ?? 'Public holiday') })),
    coverOverrides: state.overrides.map((o) => ({ date: String(o.date), reason: String(o.reason), approvedByName: names.get(String(o.approved_by)) ?? '' })),
    ninePm: state.dates
      .filter((d) => (state.ninePm.get(d)?.length ?? 0) > 0 || state.ninePmDuty.has(d))
      .map((d) => {
        const assigneeId = state.ninePmDuty.get(d) ?? null;
        return {
          date: d,
          count: state.ninePm.get(d)?.length ?? 0,
          bookings: audience === 'manager' ? state.ninePm.get(d) ?? [] : [],
          assigneeId,
          assigneeName: assigneeId ? personName.get(assigneeId) ?? null : null,
        };
      }),
    cover,
    issues: audience === 'manager' ? issues : [],
    log: logRows.map((l) => ({
      id: String(l.id),
      actorName: l.actor_id ? names.get(String(l.actor_id)) ?? 'System' : 'System',
      action: String(l.action),
      employeeName: l.employee_id ? names.get(String(l.employee_id)) ?? null : null,
      date: s(l.date),
      detail: (l.detail ?? {}) as Record<string, unknown>,
      createdAt: String(l.created_at),
    })),
    timesheets: audience === 'manager' ? [...state.timesheets.values()] : [],
  };
}

export async function getRotaWeek(storeId: string, weekStart: string, viewer: RotaViewer, audience: 'manager' | 'staff'): Promise<RotaWeekView> {
  return toView(await loadWeekState(storeId, weekStart), viewer, audience);
}

// ── Side effects ────────────────────────────────────────────────────────────

export async function audit(storeId: string, weekStart: string, actorId: string | null, action: string, extra: { employeeId?: string; date?: string; detail?: Record<string, unknown> } = {}): Promise<void> {
  const { error } = await sb().from('rota_audit_log').insert({
    store_id: storeId,
    week_start: weekStart,
    actor_id: actorId,
    action,
    employee_id: extra.employeeId ?? null,
    date: extra.date ?? null,
    detail: extra.detail ?? {},
  });
  if (error) throw new Error(`Failed to record rota history: ${error.message}`);
}

async function dm(employeeIds: string[], text: string): Promise<void> {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) return;
  const { data } = await sb().from('employees').select('telegram_user_id').in('id', ids);
  await Promise.all(((data ?? []) as Row[])
    .map((r) => s(r.telegram_user_id))
    .filter((t): t is string => !!t)
    .map((chatId) => sendTelegramMessage(text, chatId)));
}

function describeCell(c: RotaCellView | undefined): string {
  if (!c?.kind) return 'nothing planned';
  if (c.kind === 'working') return `working ${c.startTime}–${c.endTime}`;
  return { day_off: 'day off', holiday: 'holiday', sick: 'sick', unpaid_leave: 'unpaid leave', out_of_office: 'out of office', leave: 'leave', not_started: 'not started yet' }[c.kind];
}

/** Someone who hasn't started yet isn't taking the day off. */
function isOff(c: RotaCellView | undefined): boolean {
  return c?.kind !== 'working' && c?.kind !== 'not_started';
}

// ── Staff: day-off picks ────────────────────────────────────────────────────

export async function saveMyDayOffPicks(employeeId: string, input: SaveDayOffPicksRequest): Promise<RotaWeekView> {
  const storeId = await storeForEmployee(employeeId);
  const state = await loadWeekState(storeId, input.weekStart);
  const me = state.people.find((p) => p.employeeId === employeeId);
  if (!me) throw new DomainError('You’re not on the rota');
  if (me.mode !== 'rostered') throw new DomainError('You manage your own days, so there’s nothing to pick');
  const picking = pickingInfo(state.weekStart, state.status);
  if (state.status !== 'draft') throw new DomainError('This week has already been published. Ask your manager to change it.');
  if (!picking.open) throw new DomainError('Picking isn’t open for this week');

  const wanted = [...new Set(input.dates)].sort();
  const maxPicks = Math.max(1, 7 - me.targetDaysPerWeek);
  if (wanted.length > maxPicks) throw new DomainError(`You can pick ${maxPicks} day${maxPicks === 1 ? '' : 's'} off this week`);
  for (const d of wanted) {
    if (!state.dates.includes(d)) throw new DomainError('Pick days inside the selected week');
    const cell = state.cells.get(`${employeeId}|${d}`);
    if (cell?.kind === 'not_started') throw new DomainError(`You haven’t started yet on ${dayLabel(d)}`);
    if (cell?.source === 'leave') throw new DomainError(`You’re already on leave on ${dayLabel(d)}`);
  }

  const mine = state.picks.filter((p) => p.employee_id === employeeId && (p.status === 'pending' || p.status === 'approved'));
  const toCancel = mine.filter((p) => !wanted.includes(String(p.date)));
  const toAdd = wanted.filter((d) => !mine.some((p) => p.date === d));
  const isApprover = state.settings.approverIds.includes(employeeId);
  const note = input.note?.trim() || null;

  const rows = toAdd.map((date) => {
    const othersOff = state.people.filter((p) => p.employeeId !== employeeId && p.mode === 'rostered'
      && isOff(state.cells.get(`${p.employeeId}|${date}`))).length;
    const isClash = othersOff >= state.settings.maxOffPerDay;
    if (isClash && !note && !isApprover) {
      const who = state.people.filter((p) => p.employeeId !== employeeId && p.mode === 'rostered'
        && isOff(state.cells.get(`${p.employeeId}|${date}`))).map((p) => p.name.split(' ')[0]).join(', ');
      throw new DomainError(`${dayLabel(date)} is already taken by ${who}. Add a reason if you still want to ask for it.`);
    }
    return {
      store_id: storeId,
      employee_id: employeeId,
      week_start: state.weekStart,
      date,
      note,
      is_late: picking.isLate,
      is_clash: isClash,
      status: isApprover ? 'approved' : 'pending',
      decided_by: isApprover ? employeeId : null,
      decided_at: isApprover ? new Date().toISOString() : null,
    };
  });

  if (toCancel.length > 0) {
    const { error } = await sb().from('rota_day_off_picks').update({ status: 'cancelled' }).in('id', toCancel.map((p) => String(p.id)));
    if (error) throw new Error(`Failed to update picks: ${error.message}`);
  }
  if (rows.length > 0) {
    const { error } = await sb().from('rota_day_off_picks').insert(rows);
    if (error) {
      if (error.code === '23505') throw new DomainError('You already picked that day');
      throw new Error(`Failed to save picks: ${error.message}`);
    }
  }
  if (toCancel.length === 0 && rows.length === 0) return toView(state, { employeeId, hasManagePermission: false }, 'staff');

  await audit(storeId, state.weekStart, employeeId, 'picks_saved', {
    employeeId,
    detail: { added: toAdd, removed: toCancel.map((p) => String(p.date)), autoApproved: isApprover },
  });

  if (toAdd.length > 0) {
    const days = toAdd.map(dayLabel).join(', ');
    const others = state.settings.approverIds.filter((id) => id !== employeeId);
    const clash = rows.some((r) => r.is_clash) ? ' ⚠️ Someone else is already off that day.' : '';
    void dm(others, isApprover
      ? `🗓 <b>${escapeHtml(me.name)}</b> set their own day off for ${escapeHtml(weekLabel(state.weekStart))}: ${escapeHtml(days)}.${clash}`
      : `🗓 <b>${escapeHtml(me.name)}</b> picked ${escapeHtml(days)} off for ${escapeHtml(weekLabel(state.weekStart))}.${clash}${note ? `\nReason: ${escapeHtml(note)}` : ''}\nApprove it on the Rota page.`);
  }

  return getRotaWeek(storeId, state.weekStart, { employeeId, hasManagePermission: false }, 'staff');
}

// ── Approver actions ────────────────────────────────────────────────────────

async function clearAssignments(employeeId: string, dates: string[]): Promise<void> {
  const { error } = await sb().from('rota_assignments').delete().eq('employee_id', employeeId).in('date', dates);
  if (error) throw new Error(`Failed to update rota: ${error.message}`);
}

export async function decideDayOffPick(storeId: string, pickId: string, viewer: RotaViewer, input: DecideDayOffPickRequest): Promise<RotaWeekView> {
  const { data: pick, error } = await sb().from('rota_day_off_picks').select('*').eq('id', pickId).eq('store_id', storeId).maybeSingle();
  if (error) throw new Error(`Failed to load pick: ${error.message}`);
  if (!pick) throw new DomainError('Pick not found');
  const weekStart = String(pick.week_start);
  const state = await loadWeekState(storeId, weekStart);
  assertApprover(state.settings, viewer);
  if (state.status !== 'draft') throw new DomainError('This week is already published; change the cells on the rota instead');

  const employeeId = String(pick.employee_id);
  const date = String(pick.date);
  const name = state.people.find((p) => p.employeeId === employeeId)?.name ?? '';
  const now = new Date().toISOString();
  const decided = { decided_by: viewer.employeeId, decided_at: now, decision_note: input.note?.trim() || null };
  let message: string;

  if (input.action === 'move') {
    if (pick.status !== 'pending' && pick.status !== 'approved') throw new DomainError(`This pick was already ${pick.status}`);
    if (!state.dates.includes(input.toDate)) throw new DomainError('Move the day off within the same week');
    if (input.toDate === date) throw new DomainError('Pick a different day');
    if (state.cells.get(`${employeeId}|${input.toDate}`)?.kind !== 'working') throw new DomainError(`${name} isn’t working on ${dayLabel(input.toDate)}`);
    const { error: uErr } = await sb().from('rota_day_off_picks')
      .update({ ...decided, date: input.toDate, moved_from: date, status: 'approved' }).eq('id', pickId);
    if (uErr) throw new Error(`Failed to move pick: ${uErr.message}`);
    await clearAssignments(employeeId, [date, input.toDate]);
    message = `🗓 Your day off for ${weekLabel(weekStart)} was moved from ${dayLabel(date)} to <b>${dayLabel(input.toDate)}</b>.`;
  } else {
    if (pick.status !== 'pending') throw new DomainError(`This pick was already ${pick.status}`);
    const status = input.action === 'approve' ? 'approved' : 'declined';
    const { error: uErr } = await sb().from('rota_day_off_picks').update({ ...decided, status }).eq('id', pickId);
    if (uErr) throw new Error(`Failed to update pick: ${uErr.message}`);
    if (status === 'approved') await clearAssignments(employeeId, [date]);
    message = status === 'approved'
      ? `✅ Your day off on <b>${dayLabel(date)}</b> is approved.`
      : `❌ Your day off on <b>${dayLabel(date)}</b> wasn’t approved. Please pick another day in My Portal.`;
  }

  await audit(storeId, weekStart, viewer.employeeId, `pick_${input.action}`, {
    employeeId, date, detail: { toDate: input.action === 'move' ? input.toDate : undefined, note: input.note ?? null },
  });
  if (employeeId !== viewer.employeeId) {
    void dm([employeeId], `${message}${input.note ? `\nNote: ${escapeHtml(input.note)}` : ''}`);
  }
  return getRotaWeek(storeId, weekStart, viewer, 'manager');
}

export async function setRotaCells(storeId: string, viewer: RotaViewer, input: SetRotaCellsRequest): Promise<RotaWeekView> {
  const state = await loadWeekState(storeId, input.weekStart);
  assertApprover(state.settings, viewer);
  if (state.status === 'locked') throw new DomainError('This week is locked because payroll has run');
  const published = state.status === 'published';
  const reason = input.reason?.trim() || null;
  if (published && !reason) throw new DomainError('Give a reason; the person will be told about the change');

  const upserts: Row[] = [];
  const deletes: Array<{ employeeId: string; date: string }> = [];
  const changes: Array<{ employeeId: string; date: string; before: string; after: string }> = [];

  for (const c of input.cells) {
    const person = state.people.find((p) => p.employeeId === c.employeeId);
    if (!person) throw new DomainError('That person isn’t on the rota');
    if (!state.dates.includes(c.date)) throw new DomainError('Edit days inside the selected week');
    const current = state.cells.get(`${c.employeeId}|${c.date}`);
    if (current?.kind === 'not_started') throw new DomainError(`${person.name} hasn’t started yet on ${dayLabel(c.date)}`);
    if (current?.source === 'leave') throw new DomainError(`${person.name} is on leave on ${dayLabel(c.date)}; change the leave request instead`);
    if (c.kind && !EDITABLE_KINDS.has(c.kind)) throw new DomainError('Leave and sick days are recorded through leave requests and timesheets');

    let kind = c.kind;
    if (kind == null && published) {
      const approvedPick = state.picks.some((p) => p.employee_id === c.employeeId && p.date === c.date && p.status === 'approved');
      kind = approvedPick ? 'day_off' : person.mode === 'rostered' ? 'working' : 'out_of_office';
    }
    if (kind == null) {
      if (current?.actual) throw new DomainError(`Clear the hours worked on ${dayLabel(c.date)} before resetting the day`);
      deletes.push({ employeeId: c.employeeId, date: c.date });
    } else {
      const working = kind === 'working';
      upserts.push({
        store_id: storeId,
        week_start: state.weekStart,
        employee_id: c.employeeId,
        date: c.date,
        kind,
        start_time: working ? c.startTime ?? state.settings.defaultStart : null,
        end_time: working ? c.endTime ?? state.settings.defaultEnd : null,
        note: c.note?.trim() || null,
        source: kind === 'day_off' ? 'assigned' : 'manual',
        updated_by: viewer.employeeId,
        updated_at: new Date().toISOString(),
      });
    }
    const after = kind === 'working'
      ? `working ${c.startTime ?? state.settings.defaultStart}–${c.endTime ?? state.settings.defaultEnd}`
      : kind == null ? 'default' : describeCell({ ...current!, kind });
    changes.push({ employeeId: c.employeeId, date: c.date, before: describeCell(current), after });
  }

  if (upserts.length > 0) {
    const { error } = await sb().from('rota_assignments').upsert(upserts, { onConflict: 'employee_id,date' });
    if (error) throw new Error(`Failed to save rota: ${error.message}`);
  }
  for (const d of deletes) await clearAssignments(d.employeeId, [d.date]);

  for (const ch of changes) {
    await audit(storeId, state.weekStart, viewer.employeeId, 'cell_changed', {
      employeeId: ch.employeeId, date: ch.date, detail: { before: ch.before, after: ch.after, reason },
    });
  }

  if (published) {
    const byPerson = new Map<string, string[]>();
    for (const ch of changes) {
      if (ch.employeeId === viewer.employeeId || ch.before === ch.after) continue;
      byPerson.set(ch.employeeId, [...(byPerson.get(ch.employeeId) ?? []), `• ${dayLabel(ch.date)}: ${ch.after}`]);
    }
    for (const [employeeId, lines] of byPerson) {
      void dm([employeeId], `🔄 <b>Your rota changed</b> (${escapeHtml(weekLabel(state.weekStart))})\n${escapeHtml(lines.join('\n'))}\nReason: ${escapeHtml(reason ?? '')}`);
    }
  }
  return getRotaWeek(storeId, state.weekStart, viewer, 'manager');
}

/** Records the hours someone actually worked. Timesheets are only written when the week is sent. */
export async function setRotaActuals(storeId: string, viewer: RotaViewer, input: SetRotaActualsRequest): Promise<RotaWeekView> {
  const state = await loadWeekState(storeId, input.weekStart);
  assertApprover(state.settings, viewer);
  if (state.status === 'locked') throw new DomainError('This week is locked because payroll has run');
  if (!state.dates.includes(input.date)) throw new DomainError('Record hours for days inside the selected week');
  if (input.date > formatManilaDate()) throw new DomainError('You can only record hours for today or earlier');
  const person = state.people.find((p) => p.employeeId === input.employeeId);
  if (!person) throw new DomainError('That person isn’t on the rota');
  const key = `${input.employeeId}|${input.date}`;
  const cell = state.cells.get(key);
  if (!cell?.kind || cell.kind === 'not_started') throw new DomainError(`${person.name} hasn’t started yet on ${dayLabel(input.date)}`);
  if (cell.source === 'leave') throw new DomainError(`${person.name} is on leave on ${dayLabel(input.date)}`);
  const ts = state.timesheets.get(key);
  if (ts && ts.payrollStatus !== 'Pending') {
    throw new DomainError(`The timesheet for ${dayLabel(input.date)} is already ${ts.payrollStatus.toLowerCase()}. Change it on the Timesheets page.`);
  }

  const note = input.note?.trim() || null;
  const clearing = input.startTime == null && input.ninePmReturns === 0 && !note;
  if (clearing && !cell.actual) return toView(state, viewer, 'manager');
  const actual = clearing
    ? { actual_start: null, actual_end: null, actual_nine_pm: null, actual_note: null }
    : { actual_start: input.startTime, actual_end: input.endTime, actual_nine_pm: input.ninePmReturns, actual_note: note };

  // Derived cells have no row yet, so write the plan out alongside the hours.
  const { error } = await sb().from('rota_assignments').upsert({
    store_id: storeId,
    week_start: state.weekStart,
    employee_id: input.employeeId,
    date: input.date,
    kind: cell.kind,
    start_time: cell.startTime,
    end_time: cell.endTime,
    note: cell.note,
    source: cell.source,
    updated_by: viewer.employeeId,
    updated_at: new Date().toISOString(),
    ...actual,
    actual_by: viewer.employeeId,
    actual_at: new Date().toISOString(),
  }, { onConflict: 'employee_id,date' });
  if (error) throw new Error(`Failed to save hours: ${error.message}`);

  await audit(storeId, state.weekStart, viewer.employeeId, clearing ? 'actual_cleared' : 'actual_set', {
    employeeId: input.employeeId,
    date: input.date,
    detail: clearing ? {} : { after: input.startTime ? `${input.startTime}–${input.endTime}` : 'no times', ninePm: input.ninePmReturns },
  });
  return getRotaWeek(storeId, state.weekStart, viewer, 'manager');
}

export async function setCoverOverride(storeId: string, viewer: RotaViewer, input: SetCoverOverrideRequest): Promise<RotaWeekView> {
  const weekStart = rotaWeekStart(input.date);
  const settings = await loadRotaSettings(storeId);
  assertApprover(settings, viewer);
  if (input.reason == null) {
    const { error } = await sb().from('rota_cover_overrides').delete().eq('store_id', storeId).eq('date', input.date);
    if (error) throw new Error(`Failed to remove emergency cover: ${error.message}`);
  } else {
    const { error } = await sb().from('rota_cover_overrides').upsert({
      store_id: storeId, date: input.date, reason: input.reason.trim(), approved_by: viewer.employeeId, created_at: new Date().toISOString(),
    }, { onConflict: 'store_id,date' });
    if (error) throw new Error(`Failed to save emergency cover: ${error.message}`);
  }
  await audit(storeId, weekStart, viewer.employeeId, input.reason == null ? 'emergency_removed' : 'emergency_set', {
    date: input.date, detail: { reason: input.reason },
  });
  return getRotaWeek(storeId, weekStart, viewer, 'manager');
}

export async function publishRotaWeek(storeId: string, viewer: RotaViewer, weekStart: string): Promise<RotaWeekView> {
  const state = await loadWeekState(storeId, weekStart);
  assertApprover(state.settings, viewer);
  if (state.status !== 'draft') throw new DomainError('This week is already published');
  const blockers = evaluate(state).issues.filter((i) => i.level === 'blocker');
  if (blockers.length > 0) throw new DomainError(`Fix these before publishing: ${blockers.map((b) => b.message).join('; ')}`);

  const now = new Date().toISOString();
  const rows = [...state.cells.values()]
    .filter((c) => c.kind && c.kind !== 'not_started' && c.source !== 'leave')
    .map((c) => ({
      store_id: storeId,
      week_start: weekStart,
      employee_id: c.employeeId,
      date: c.date,
      kind: c.kind,
      start_time: c.startTime,
      end_time: c.endTime,
      note: c.note,
      source: c.source,
      updated_by: viewer.employeeId,
      updated_at: now,
    }));
  if (rows.length > 0) {
    const { error } = await sb().from('rota_assignments').upsert(rows, { onConflict: 'employee_id,date' });
    if (error) throw new Error(`Failed to save rota: ${error.message}`);
  }
  const { error: wErr } = await sb().from('rota_weeks').upsert({
    store_id: storeId, week_start: weekStart, status: 'published', published_at: now, published_by: viewer.employeeId,
  }, { onConflict: 'store_id,week_start' });
  if (wErr) throw new Error(`Failed to publish rota: ${wErr.message}`);
  await audit(storeId, weekStart, viewer.employeeId, 'published');

  const tg = new Map(state.people.map((p) => [p.employeeId, p.telegramId]));
  for (const p of state.people.filter((x) => x.mode === 'rostered' && tg.get(x.employeeId))) {
    const lines = state.dates.map((d) => `${dayLabel(d)}: ${describeCell(state.cells.get(`${p.employeeId}|${d}`))}`);
    void sendTelegramMessage(`📅 <b>Your rota for ${escapeHtml(weekLabel(weekStart))}</b>\n${escapeHtml(lines.join('\n'))}`, tg.get(p.employeeId)!);
  }
  return getRotaWeek(storeId, weekStart, viewer, 'manager');
}

export async function setRotaDuty(storeId: string, viewer: RotaViewer, input: SetRotaDutyRequest): Promise<RotaWeekView> {
  const weekStart = rotaWeekStart(input.date);
  const state = await loadWeekState(storeId, weekStart);
  assertApprover(state.settings, viewer);
  if (state.status === 'locked') throw new DomainError('This week is locked because payroll has run');

  const previous = state.ninePmDuty.get(input.date) ?? null;
  const day = dayLabel(input.date);
  if (input.employeeId) {
    const person = state.people.find((p) => p.employeeId === input.employeeId);
    if (!person) throw new DomainError('That person isn’t on the rota');
    if (state.cells.get(`${input.employeeId}|${input.date}`)?.kind !== 'working') {
      throw new DomainError(`${person.name.split(' ')[0]} isn’t working on ${day}. Change their day to working first.`);
    }
    const { error } = await sb().from('rota_duties').upsert({
      store_id: storeId, date: input.date, duty: input.duty, employee_id: input.employeeId,
      assigned_by: viewer.employeeId, assigned_at: new Date().toISOString(),
    }, { onConflict: 'store_id,date,duty' });
    if (error) throw new Error(`Failed to assign 9pm returns: ${error.message}`);
  } else {
    const { error } = await sb().from('rota_duties').delete().eq('store_id', storeId).eq('date', input.date).eq('duty', input.duty);
    if (error) throw new Error(`Failed to remove 9pm returns: ${error.message}`);
  }
  if (previous === input.employeeId) return toView(state, viewer, 'manager');

  await audit(storeId, weekStart, viewer.employeeId, input.employeeId ? 'duty_set' : 'duty_removed', {
    employeeId: input.employeeId ?? previous ?? undefined, date: input.date, detail: { duty: input.duty },
  });

  if (input.date >= formatManilaDate()) {
    const bookings = state.ninePm.get(input.date) ?? [];
    if (input.employeeId && input.employeeId !== viewer.employeeId) {
      const refs = bookings.map((b) => b.ref).join(', ');
      void dm([input.employeeId], `🌙 <b>You’re on 9pm returns on ${escapeHtml(day)}</b>${bookings.length ? ` (${bookings.length}: ${escapeHtml(refs)})` : ''}.\nPlease be at the shop from 8:15pm.`);
    }
    if (previous && previous !== viewer.employeeId) {
      void dm([previous], `🌙 You’re no longer on 9pm returns on ${escapeHtml(day)}.`);
    }
  }
  return getRotaWeek(storeId, weekStart, viewer, 'manager');
}

export async function updateRotaSettings(storeId: string, viewer: RotaViewer, input: UpdateRotaSettingsRequest): Promise<RotaSettings> {
  assertApprover(await loadRotaSettings(storeId), viewer);
  const { error } = await sb().from('rota_settings').upsert({
    store_id: storeId,
    default_start: input.defaultStart,
    default_end: input.defaultEnd,
    min_staff: input.minStaff,
    emergency_min_staff: input.emergencyMinStaff,
    max_off_per_day: input.maxOffPerDay,
    change_notice_hours: input.changeNoticeHours,
    approver_ids: [...new Set(input.approverIds)],
    updated_by: viewer.employeeId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id' });
  if (error) throw new Error(`Failed to save rota settings: ${error.message}`);
  await audit(storeId, rotaWeekStart(formatManilaDate()), viewer.employeeId, 'settings_changed', { detail: { ...input } });
  return loadRotaSettings(storeId);
}

export async function updateWorkPattern(storeId: string, viewer: RotaViewer, employeeId: string, input: UpdateWorkPatternRequest): Promise<void> {
  assertApprover(await loadRotaSettings(storeId), viewer);
  const { error } = await sb().from('employee_work_patterns').upsert({
    employee_id: employeeId,
    schedule_mode: input.scheduleMode,
    target_days_per_week: input.targetDaysPerWeek,
    counts_toward_cover: input.scheduleMode === 'rostered' && input.countsTowardCover,
    updated_by: viewer.employeeId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'employee_id' });
  if (error) throw new Error(`Failed to save work pattern: ${error.message}`);
  await audit(storeId, rotaWeekStart(formatManilaDate()), viewer.employeeId, 'pattern_changed', { employeeId, detail: { ...input } });
}

/** Everyone the approver can configure, including people who are off the rota and owners who can only approve. */
export async function listRotaPeople(storeId: string): Promise<Array<Omit<Person, 'telegramId'> & { hasTelegram: boolean }>> {
  return (await loadPeople(storeId, { includeNonStaff: true })).map(({ telegramId, ...p }) => ({ ...p, hasTelegram: !!telegramId }));
}

// ── Reminders (used by the rota job) ────────────────────────────────────────

export async function sendPickReminders(): Promise<void> {
  const { data, error } = await sb().from('rota_settings').select('store_id');
  if (error) throw new Error(error.message);
  const weekStart = addDaysToDateStr(rotaWeekStart(formatManilaDate()), 7);
  for (const r of (data ?? []) as Row[]) {
    const state = await loadWeekState(String(r.store_id), weekStart);
    if (state.status !== 'draft') continue;
    const picked = new Set(state.picks.filter((p) => p.status === 'pending' || p.status === 'approved').map((p) => String(p.employee_id)));
    const due = state.people.filter((p) => p.mode === 'rostered' && !picked.has(p.employeeId));
    for (const p of due.filter((x) => x.telegramId)) {
      void sendTelegramMessage(`🗓 Good morning ${escapeHtml(p.name.split(' ')[0])}! Please pick your day off for <b>${escapeHtml(weekLabel(weekStart))}</b> in My Portal today.`, p.telegramId!);
    }
  }
}

export async function sendApproverDigest(): Promise<void> {
  const { data, error } = await sb().from('rota_settings').select('store_id');
  if (error) throw new Error(error.message);
  const weekStart = addDaysToDateStr(rotaWeekStart(formatManilaDate()), 7);
  for (const r of (data ?? []) as Row[]) {
    const state = await loadWeekState(String(r.store_id), weekStart);
    if (state.status !== 'draft') continue;
    const live = state.picks.filter((p) => p.status === 'pending' || p.status === 'approved');
    const picked = new Set(live.map((p) => String(p.employee_id)));
    const missing = state.people.filter((p) => p.mode === 'rostered' && !picked.has(p.employeeId)).map((p) => p.name);
    const pending = live.filter((p) => p.status === 'pending').length;
    if (missing.length === 0 && pending === 0) continue;
    const lines = [
      `🗓 <b>Rota for ${escapeHtml(weekLabel(weekStart))}</b>`,
      pending ? `${pending} day-off pick${pending === 1 ? '' : 's'} waiting for approval.` : null,
      missing.length ? `No day off picked yet: ${escapeHtml(missing.join(', '))}. Assign one on the Rota page.` : null,
    ].filter(Boolean);
    void dm(state.settings.approverIds, lines.join('\n'));
  }
}

export async function sendUnpublishedNudge(): Promise<void> {
  const { data, error } = await sb().from('rota_settings').select('store_id');
  if (error) throw new Error(error.message);
  const weekStart = addDaysToDateStr(rotaWeekStart(formatManilaDate()), 7);
  for (const r of (data ?? []) as Row[]) {
    const storeId = String(r.store_id);
    const week = await loadWeekRow(storeId, weekStart);
    if (week && week.status !== 'draft') continue;
    const settings = await loadRotaSettings(storeId);
    void dm(settings.approverIds, `📅 Next week’s rota (${escapeHtml(weekLabel(weekStart))}) hasn’t been published yet.`);
  }
}
