import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type RotaKind = 'working' | 'day_off' | 'holiday' | 'sick' | 'unpaid_leave' | 'out_of_office' | 'leave';
export type RotaMode = 'rostered' | 'self_managed' | 'excluded';
export type RotaCellSource = 'default' | 'pick' | 'assigned' | 'manual' | 'leave';
export type RotaWeekStatus = 'draft' | 'published' | 'locked';
export type RotaPickStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

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

export interface RotaPerson {
  employeeId: string;
  name: string;
  role: string | null;
  mode: RotaMode;
  countsTowardCover: boolean;
  targetDaysPerWeek: number;
  workingDays: number;
  plannedHours: number;
}

export interface RotaCell {
  employeeId: string;
  date: string;
  kind: RotaKind | null;
  startTime: string | null;
  endTime: string | null;
  isCustomTime: boolean;
  note: string | null;
  source: RotaCellSource;
  pendingPickId: string | null;
}

export interface RotaPick {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  note: string | null;
  status: RotaPickStatus;
  isLate: boolean;
  isClash: boolean;
  movedFrom: string | null;
  submittedAt: string;
  decidedByName: string | null;
  decisionNote: string | null;
}

export interface RotaDayCover {
  date: string;
  working: number;
  required: number;
  off: number;
  status: 'ok' | 'emergency' | 'short';
}

export interface RotaIssue {
  level: 'blocker' | 'warning';
  code: string;
  message: string;
  date?: string;
  employeeId?: string;
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

export interface RotaNinePmDay {
  date: string;
  count: number;
  /** Only filled in on the manager page. */
  bookings: Array<{ ref: string; customer: string | null; vehicle: string | null }>;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface RotaWeek {
  storeId: string;
  weekStart: string;
  dates: string[];
  status: RotaWeekStatus;
  publishedAt: string | null;
  publishedByName: string | null;
  settings: RotaSettings;
  canApprove: boolean;
  picking: { open: boolean; pickDay: string; isLate: boolean };
  people: RotaPerson[];
  cells: RotaCell[];
  picks: RotaPick[];
  holidays: Array<{ date: string; name: string }>;
  coverOverrides: Array<{ date: string; reason: string; approvedByName: string }>;
  ninePm: RotaNinePmDay[];
  cover: RotaDayCover[];
  issues: RotaIssue[];
  log: RotaLogEntry[];
}

export interface RotaPersonConfig {
  employeeId: string;
  name: string;
  role: string | null;
  mode: RotaMode;
  countsTowardCover: boolean;
  targetDaysPerWeek: number;
  hasTelegram: boolean;
  /** False for owners and developers: they can be approvers but are never scheduled. */
  isStaff: boolean;
}

export interface RotaCellEdit {
  employeeId: string;
  date: string;
  kind: Exclude<RotaKind, 'leave' | 'holiday' | 'sick' | 'unpaid_leave'> | null;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export function useMyRota(weekStart: string) {
  return useQuery({
    queryKey: ['me', 'rota', weekStart],
    queryFn: () => api.get<RotaWeek>(`/me/rota?weekStart=${weekStart}`),
    enabled: !!weekStart,
  });
}

export function useSaveMyPicks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { weekStart: string; dates: string[]; note?: string }) => api.put<RotaWeek>('/me/rota/picks', body),
    onSuccess: (week) => {
      qc.setQueryData(['me', 'rota', week.weekStart], week);
      qc.invalidateQueries({ queryKey: ['rota'] });
    },
  });
}

export function useRotaWeek(weekStart: string, enabled = true) {
  return useQuery({
    queryKey: ['rota', 'week', weekStart],
    queryFn: () => api.get<RotaWeek>(`/hr/rota?weekStart=${weekStart}`),
    enabled: enabled && !!weekStart,
    retry: false,
    refetchInterval: 60_000,
  });
}

function useWeekMutation<TBody>(fn: (body: TBody) => Promise<RotaWeek>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (week) => {
      qc.setQueryData(['rota', 'week', week.weekStart], week);
      qc.invalidateQueries({ queryKey: ['me', 'rota'] });
    },
  });
}

export function useSetRotaCells() {
  return useWeekMutation((body: { weekStart: string; cells: RotaCellEdit[]; reason?: string }) => api.put<RotaWeek>('/hr/rota/cells', body));
}

export type PickDecision =
  | { action: 'approve'; note?: string }
  | { action: 'decline'; note: string }
  | { action: 'move'; toDate: string; note: string };

export function useDecidePick() {
  return useWeekMutation(({ id, ...body }: { id: string } & PickDecision) => api.post<RotaWeek>(`/hr/rota/picks/${id}/decide`, body));
}

export function useSetCoverOverride() {
  return useWeekMutation((body: { date: string; reason: string | null }) => api.put<RotaWeek>('/hr/rota/cover-override', body));
}

export function useSetNinePmDuty() {
  return useWeekMutation((body: { date: string; employeeId: string | null }) =>
    api.put<RotaWeek>('/hr/rota/duties', { ...body, duty: 'nine_pm_return' }));
}

export function usePublishRota() {
  return useWeekMutation((body: { weekStart: string }) => api.post<RotaWeek>('/hr/rota/publish', body));
}

export function useRotaPeople(enabled = true) {
  return useQuery({ queryKey: ['rota', 'people'], queryFn: () => api.get<RotaPersonConfig[]>('/hr/rota/people'), enabled });
}

export function useUpdateWorkPattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, ...body }: { employeeId: string; scheduleMode: RotaMode; targetDaysPerWeek: number; countsTowardCover: boolean }) =>
      api.put(`/hr/rota/people/${employeeId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rota'] });
      qc.invalidateQueries({ queryKey: ['me', 'rota'] });
    },
  });
}

export function useUpdateRotaSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<RotaSettings, 'storeId'>) => api.put<RotaSettings>('/hr/rota/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rota'] });
      qc.invalidateQueries({ queryKey: ['me', 'rota'] });
    },
  });
}

// ── Date helpers (Manila) ───────────────────────────────────────────────────

export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

function fmt(date: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export const dayShort = (date: string) => fmt(date, { weekday: 'short' });
export const dayNum = (date: string) => fmt(date, { day: 'numeric' });
export const dayLabel = (date: string) => fmt(date, { weekday: 'short', day: 'numeric', month: 'short' });
export const weekLabel = (weekStart: string) => `${fmt(weekStart, { day: 'numeric', month: 'short' })} – ${fmt(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

export function to12h(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, '0')}${suffix}` : `${hh}${suffix}`;
}
